import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import { logger } from "../lib/logger.js";

/** Assigns a request id (echoed in X-Request-Id and error bodies) and logs method/path/status/duration. */
export const requestContext: RequestHandler = (req, res, next) => {
  req.requestId = randomUUID();
  res.setHeader("X-Request-Id", req.requestId);
  const started = process.hrtime.bigint();
  res.on("finish", () => {
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    logger.info("request", {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl.split("?")[0], // no query string, no body, no headers
      status: res.statusCode,
      ms: Math.round(ms),
    });
  });
  next();
};
