import { Router, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { AppDeps } from "../app.js";
import { hashToken, newSessionToken } from "../lib/crypto.js";
import { AppError } from "../lib/errors.js";
import { SESSION_COOKIE, requireAuth } from "../middleware/auth.js";
import { audit } from "../services/audit.js";
import { loginSchema, parse } from "../validation/schemas.js";

// Pre-computed hash used when the email is unknown, so response time does not reveal
// whether an account exists (user enumeration).
const DUMMY_HASH = bcrypt.hashSync("securevote-dummy-password", 10);

export function authRouter({ prisma, env, limits }: AppDeps): Router {
  const r = Router();

  const tooManyAttempts = (req: Request, res: Response) =>
    res.status(429).json({
      error: { code: "RATE_LIMITED", message: "Too many login attempts. Try again later.", requestId: req.requestId },
    });
  // Brute-force protection per (IP, account) ...
  const accountLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: limits.loginPer15Min,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (req) => {
      const email = typeof req.body?.email === "string" ? req.body.email.toLowerCase().slice(0, 254) : "";
      return `${ipKeyGenerator(req.ip ?? "unknown")}|${email}`;
    },
    handler: tooManyAttempts,
  });
  // ... and a looser cap per IP against password spraying across many accounts.
  const ipLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: limits.loginPer15Min * 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: tooManyAttempts,
  });

  r.post("/login", ipLimiter, accountLimiter, async (req, res) => {
    const { email, password } = parse(loginSchema, req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) {
      await audit(prisma, { action: "AUTH_LOGIN_FAILED", details: { reason: "invalid_credentials" } });
      throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
    }

    const token = newSessionToken();
    const ttlMs = env.SESSION_TTL_HOURS * 3600 * 1000;
    await prisma.authSession.create({
      data: { tokenHash: hashToken(token), userId: user.id, expiresAt: new Date(Date.now() + ttlMs) },
    });
    // Opportunistic cleanup of this user's expired sessions.
    await prisma.authSession.deleteMany({ where: { userId: user.id, expiresAt: { lt: new Date() } } });

    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true, // not readable from JavaScript (limits XSS impact)
      sameSite: "strict", // not sent on cross-site requests (CSRF)
      secure: env.COOKIE_SECURE, // true behind HTTPS
      maxAge: ttlMs,
      path: "/",
    });
    await audit(prisma, { action: "AUTH_LOGIN", actorUserId: user.id });
    res.json({ user: { id: user.id, email: user.email, displayName: user.displayName } });
  });

  r.post("/logout", async (req, res) => {
    if (req.auth) {
      await prisma.authSession.delete({ where: { id: req.auth.sessionId } }).catch(() => undefined);
      await audit(prisma, { action: "AUTH_LOGOUT", actorUserId: req.auth.user.id });
    }
    res.clearCookie(SESSION_COOKIE, { path: "/", httpOnly: true, sameSite: "strict", secure: env.COOKIE_SECURE });
    res.status(204).end();
  });

  r.get("/me", requireAuth, (req, res) => {
    const { user, memberships } = req.auth!;
    res.json({
      user: { id: user.id, email: user.email, displayName: user.displayName, walletAddress: user.walletAddress },
      memberships: memberships.map((m) => ({
        organizationId: m.organizationId,
        organizationName: m.organization.name,
        roles: m.roles,
        shareCount: m.shareCount,
      })),
    });
  });

  /** Lists the synthetic demo accounts (never passwords). Disabled unless DEMO_MODE=true. */
  r.get("/demo-accounts", async (_req, res) => {
    if (!env.DEMO_MODE) throw new AppError(404, "NOT_FOUND", "Route not found");
    const users = await prisma.user.findMany({
      where: { email: { endsWith: "@demo.securevote.test" } },
      include: { memberships: { include: { organization: { select: { name: true } } } } },
      orderBy: { email: "asc" },
    });
    res.json({
      accounts: users.map((u) => ({
        email: u.email,
        displayName: u.displayName,
        roles: [...new Set(u.memberships.flatMap((m) => m.roles))],
        organizations: u.memberships.map((m) => m.organization.name),
      })),
    });
  });

  return r;
}
