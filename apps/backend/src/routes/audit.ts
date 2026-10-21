import { Router } from "express";
import type { Prisma } from "@prisma/client";
import type { AppDeps } from "../app.js";
import { requireAuthContext } from "../services/access.js";
import { limitQuery, parse } from "../validation/schemas.js";

export function auditRouter({ prisma }: AppDeps): Router {
  const r = Router();

  /** Recent application audit events: organization-wide for staff, own events for shareholders. */
  r.get("/recent", async (req, res) => {
    const auth = requireAuthContext(req.auth);
    const { limit } = parse(limitQuery, req.query);
    const staffOrgs = auth.memberships
      .filter((m) => m.roles.some((r) => r === "ADMIN" || r === "AUDITOR" || r === "ORGANIZER"))
      .map((m) => m.organizationId);
    const where: Prisma.AuditEventWhereInput = {
      OR: [{ organizationId: { in: staffOrgs } }, { actorUserId: auth.user.id }],
    };
    const events = await prisma.auditEvent.findMany({
      where,
      include: { actor: { select: { displayName: true } }, election: { select: { id: true, title: true } } },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    res.json({
      events: events.map((e) => ({
        id: e.id,
        action: e.action,
        actor: e.actor?.displayName ?? null,
        election: e.election,
        details: e.details,
        createdAt: e.createdAt.toISOString(),
      })),
    });
  });

  return r;
}
