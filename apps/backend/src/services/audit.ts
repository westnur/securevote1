import type { Prisma, PrismaClient } from "@prisma/client";
import { logger } from "../lib/logger.js";

export interface AuditInput {
  action: string;
  actorUserId?: string | null;
  organizationId?: string | null;
  electionId?: string | null;
  /** Must never contain passwords, tokens, private keys or ballot choices. */
  details?: Prisma.InputJsonObject;
}

/** Append-only application audit log. Failures are logged but never break the request. */
export async function audit(prisma: PrismaClient, input: AuditInput): Promise<void> {
  try {
    await prisma.auditEvent.create({
      data: {
        action: input.action,
        actorUserId: input.actorUserId ?? null,
        organizationId: input.organizationId ?? null,
        electionId: input.electionId ?? null,
        details: input.details ?? {},
      },
    });
  } catch (err) {
    logger.error("Failed to write audit event", { action: input.action, error: String(err) });
  }
}
