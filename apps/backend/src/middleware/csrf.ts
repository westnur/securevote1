import type { RequestHandler } from "express";
import { AppError } from "../lib/errors.js";

export const CSRF_HEADER = "x-securevote-csrf";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF defence in depth for cookie-authenticated, state-changing requests:
 *  1. The session cookie is SameSite=Strict (set in routes/auth.ts).
 *  2. A custom header must be present. Browsers cannot add custom headers to
 *     cross-site requests without a CORS preflight, which our CORS policy rejects.
 *  3. If the browser sends an Origin header, it must be on the allowlist.
 */
export function csrfProtection(allowedOrigins: string[]): RequestHandler {
  const allowed = new Set(allowedOrigins);
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();
    const origin = req.get("origin");
    if (origin && !allowed.has(origin)) {
      return next(new AppError(403, "CSRF_ORIGIN_REJECTED", "Request origin is not allowed"));
    }
    if (req.get(CSRF_HEADER) !== "1") {
      return next(new AppError(403, "CSRF_HEADER_MISSING", `Missing ${CSRF_HEADER} header`));
    }
    next();
  };
}
