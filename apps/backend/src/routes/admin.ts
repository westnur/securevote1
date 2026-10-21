import { Router } from "express";
import type { AppDeps } from "../app.js";
import { forbidden } from "../lib/errors.js";
import { requireAuthContext } from "../services/access.js";

export function adminRouter({ prisma, chain }: AppDeps): Router {
  const r = Router();

  /** System health and technical information for administrators. */
  r.get("/system", async (req, res) => {
    const auth = requireAuthContext(req.auth);
    if (!auth.memberships.some((m) => m.roles.includes("ADMIN"))) throw forbidden("Administrators only");

    const [users, organizations, elections, published, auditEvents, transactions, pendingTx, failedTx] = await Promise.all([
      prisma.user.count(),
      prisma.organization.count(),
      prisma.election.count(),
      prisma.election.count({ where: { status: "PUBLISHED" } }),
      prisma.auditEvent.count(),
      prisma.transactionReference.count(),
      prisma.transactionReference.count({ where: { status: "PENDING" } }),
      prisma.transactionReference.count({ where: { status: "FAILED" } }),
    ]);
    const chainStatus = await chain.status();
    let adminWalletHasAdminRole: boolean | null = null;
    if (chainStatus.contractDeployed && auth.user.walletAddress) {
      adminWalletHasAdminRole = await chain.isAdmin(auth.user.walletAddress).catch(() => null);
    }
    res.json({
      server: { nodeVersion: process.version, uptimeSeconds: Math.round(process.uptime()), env: process.env.NODE_ENV },
      database: { ok: true, users, organizations, elections, published, auditEvents, transactions, pendingTx, failedTx },
      chain: { ...chainStatus, adminWalletHasAdminRole },
    });
  });

  return r;
}
