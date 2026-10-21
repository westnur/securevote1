import { Router } from "express";
import { getAddress } from "ethers";
import type { AppDeps } from "../app.js";
import { ORGANIZER_ROLE_ID } from "../lib/chain.js";
import { AppError, badRequest, conflict, notFound } from "../lib/errors.js";
import { audit } from "../services/audit.js";
import { membershipFor, requireAuthContext, requireRole } from "../services/access.js";
import { recordTransaction, verifyUserTransaction } from "../services/transactions.js";
import { idParam, organizerRoleSchema, parse } from "../validation/schemas.js";

export function organizationsRouter({ prisma, chain }: AppDeps): Router {
  const r = Router();

  r.get("/:orgId", async (req, res) => {
    const auth = requireAuthContext(req.auth);
    const orgId = parse(idParam, req.params.orgId);
    const me = membershipFor(auth, orgId);
    if (!me) throw notFound("Organization");
    const org = me.organization;
    const isStaff = me.roles.some((r) => r === "ADMIN" || r === "ORGANIZER" || r === "AUDITOR");
    const isAdmin = me.roles.includes("ADMIN");

    // Shareholders only see their own membership; staff see the member directory.
    const members = await prisma.organizationMembership.findMany({
      where: isStaff ? { organizationId: orgId } : { organizationId: orgId, userId: auth.user.id },
      include: { user: { select: { id: true, displayName: true, email: true, walletAddress: true } } },
      orderBy: [{ shareCount: "desc" }],
    });

    let chainReachable = true;
    const rows = await Promise.all(
      members.map(async (m) => {
        let onChainOrganizer: boolean | null = null;
        if (m.user.walletAddress && chainReachable) {
          try {
            onChainOrganizer = await chain.hasOrganizerRole(m.user.walletAddress);
          } catch {
            chainReachable = false;
          }
        }
        return {
          userId: m.userId,
          displayName: m.user.displayName,
          email: isAdmin ? m.user.email : undefined,
          walletAddress: m.user.walletAddress ? getAddress(m.user.walletAddress) : null,
          roles: m.roles,
          shareCount: m.shareCount,
          onChainOrganizer,
        };
      }),
    );

    res.json({
      organization: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        description: org.description,
        registrationNumber: org.registrationNumber,
        totalShares: org.totalShares,
      },
      myRoles: me.roles,
      members: rows,
    });
  });

  /**
   * Admin grants/revokes the organizer role. The admin first signs grantRole/revokeRole
   * on the contract with their own wallet; this endpoint verifies the RoleGranted /
   * RoleRevoked event and only then updates the off-chain role, keeping both in sync.
   */
  r.post("/:orgId/members/:userId/organizer-role", async (req, res) => {
    const auth = requireAuthContext(req.auth);
    const orgId = parse(idParam, req.params.orgId);
    const userId = parse(idParam, req.params.userId);
    requireRole(auth, orgId, ["ADMIN"], "Only administrators can change organizer permissions");
    const { action, txHash } = parse(organizerRoleSchema, req.body);
    if (!auth.user.walletAddress) throw badRequest("NO_WALLET", "No local test wallet is linked to your account");

    const member = await prisma.organizationMembership.findUnique({
      where: { userId_organizationId: { userId, organizationId: orgId } },
      include: { user: { select: { walletAddress: true, displayName: true } } },
    });
    if (!member) throw notFound("Member");
    if (!member.user.walletAddress) throw badRequest("NO_WALLET", "This member has no linked wallet");
    if (action === "grant" && member.roles.includes("AUDITOR")) {
      // Separation of duties: an auditor must stay independent of the elections they audit.
      throw conflict("SEPARATION_OF_DUTIES", "Auditors cannot be granted the organizer role");
    }

    const kind = action === "grant" ? "GRANT_ORGANIZER" : "REVOKE_ORGANIZER";
    const check = await verifyUserTransaction(chain, txHash, auth.user.walletAddress);
    const base = { txHash, kind, chainId: chain.chainId, fromAddress: check.from, userId: auth.user.id } as const;
    if (check.status === "PENDING") {
      await recordTransaction(prisma, { ...base, status: "PENDING" });
      res.status(202).json({ status: "PENDING", txHash });
      return;
    }
    if (check.status === "FAILED") {
      await recordTransaction(prisma, { ...base, status: "FAILED", blockNumber: check.blockNumber, error: "Reverted" });
      throw new AppError(422, "TX_REVERTED", "The transaction was reverted by the smart contract");
    }
    const eventName = action === "grant" ? "RoleGranted" : "RoleRevoked";
    const ok = check.events.some(
      (e) =>
        e.name === eventName &&
        String(e.args.role) === ORGANIZER_ROLE_ID &&
        String(e.args.account).toLowerCase() === member.user.walletAddress!.toLowerCase(),
    );
    if (!ok) {
      await recordTransaction(prisma, {
        ...base,
        status: "FAILED",
        blockNumber: check.blockNumber,
        error: `No ${eventName} event`,
      });
      throw badRequest("EVENT_MISSING", `No ${eventName} event for this member's wallet in the transaction`);
    }

    const roles =
      action === "grant" ? [...new Set([...member.roles, "ORGANIZER" as const])] : member.roles.filter((r) => r !== "ORGANIZER");
    await prisma.organizationMembership.update({ where: { id: member.id }, data: { roles } });
    await recordTransaction(prisma, { ...base, status: "CONFIRMED", blockNumber: check.blockNumber });
    await audit(prisma, {
      action: action === "grant" ? "ORGANIZER_ROLE_GRANTED" : "ORGANIZER_ROLE_REVOKED",
      actorUserId: auth.user.id,
      organizationId: orgId,
      details: { member: member.user.displayName, txHash },
    });
    res.json({ status: "CONFIRMED", roles });
  });

  return r;
}
