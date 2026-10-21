import type { RequestHandler } from "express";
import type { PrismaClient } from "@prisma/client";
import { hashToken } from "../lib/crypto.js";
import { unauthorized } from "../lib/errors.js";

export const SESSION_COOKIE = "sv_session";

/** Loads the session (if any) from the HttpOnly cookie. Never trusts client-supplied user ids or roles. */
export function loadSession(prisma: PrismaClient): RequestHandler {
  return async (req, _res, next) => {
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    if (typeof token !== "string" || token.length < 20 || token.length > 200) return next();
    const session = await prisma.authSession.findUnique({
      where: { tokenHash: hashToken(token) },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            displayName: true,
            walletAddress: true,
            memberships: { include: { organization: true } },
          },
        },
      },
    });
    if (!session) return next();
    if (session.expiresAt.getTime() <= Date.now()) {
      await prisma.authSession.delete({ where: { id: session.id } }).catch(() => undefined);
      return next();
    }
    const { memberships, ...user } = session.user;
    req.auth = { user, memberships, sessionId: session.id };
    next();
  };
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.auth) return next(unauthorized());
  next();
};
