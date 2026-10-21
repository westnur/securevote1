import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import type { PrismaClient } from "@prisma/client";
import type { Env } from "./config/env.js";
import type { ChainGateway } from "./lib/chain.js";
import { loadSession, requireAuth } from "./middleware/auth.js";
import { CSRF_HEADER, csrfProtection } from "./middleware/csrf.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { requestContext } from "./middleware/requestContext.js";
import { adminRouter } from "./routes/admin.js";
import { auditRouter } from "./routes/audit.js";
import { authRouter } from "./routes/auth.js";
import { electionsRouter } from "./routes/elections.js";
import { organizationsRouter } from "./routes/organizations.js";
import { systemRouter } from "./routes/system.js";

export interface AppDeps {
  prisma: PrismaClient;
  chain: ChainGateway;
  env: Env;
  limits: { apiPer15Min: number; loginPer15Min: number; writesPerMinute: number };
}

export const DEFAULT_LIMITS: AppDeps["limits"] = { apiPer15Min: 1500, loginPer15Min: 10, writesPerMinute: 60 };

export function createApp(deps: AppDeps) {
  const { env, prisma, limits } = deps;
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", false); // do not trust X-Forwarded-For for rate limiting by default
  app.use(requestContext);
  app.use(helmet()); // security headers: CSP, HSTS (when HTTPS), X-Content-Type-Options, frameguard...
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
      allowedHeaders: ["Content-Type", CSRF_HEADER],
    }),
  );
  app.use(express.json({ limit: "50kb" }));
  app.use(cookieParser());

  const json429 = (message: string) => (req: express.Request, res: express.Response) =>
    res.status(429).json({ error: { code: "RATE_LIMITED", message, requestId: req.requestId } });

  app.use(
    "/api",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: limits.apiPer15Min,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      handler: json429("Too many requests. Please slow down."),
    }),
  );
  // Tighter limit for state-changing requests.
  app.use(
    "/api",
    rateLimit({
      windowMs: 60 * 1000,
      limit: limits.writesPerMinute,
      skip: (req) => req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS",
      standardHeaders: "draft-8",
      legacyHeaders: false,
      handler: json429("Too many write requests. Please wait a minute."),
    }),
  );
  app.use("/api", csrfProtection(env.CORS_ORIGIN));
  app.use("/api", loadSession(prisma));

  app.use("/api", systemRouter(deps));
  app.use("/api/auth", authRouter(deps));
  app.use("/api/elections", requireAuth, electionsRouter(deps));
  app.use("/api/organizations", requireAuth, organizationsRouter(deps));
  app.use("/api/audit", requireAuth, auditRouter(deps));
  app.use("/api/admin", requireAuth, adminRouter(deps));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
