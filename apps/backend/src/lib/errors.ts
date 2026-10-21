/**
 * An error that is safe to show to API clients. Anything that is not an AppError is
 * reported to the client as a generic 500 so stack traces and internals never leak.
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (code: string, message: string, details?: unknown) => new AppError(400, code, message, details);
export const unauthorized = (message = "Authentication required") => new AppError(401, "UNAUTHENTICATED", message);
export const forbidden = (message = "You do not have permission to perform this action") =>
  new AppError(403, "FORBIDDEN", message);
export const notFound = (what = "Resource") => new AppError(404, "NOT_FOUND", `${what} not found`);
export const conflict = (code: string, message: string, details?: unknown) => new AppError(409, code, message, details);
export const chainUnavailable = (message = "The local blockchain node is not reachable. Start it with `npm run chain:node`.") =>
  new AppError(503, "CHAIN_UNAVAILABLE", message);
