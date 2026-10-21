import { createHash, randomBytes } from "node:crypto";

/** 256-bit random session token, URL-safe. */
export const newSessionToken = () => randomBytes(32).toString("base64url");

/** Only the SHA-256 hash of a session token is stored, so a database leak does not leak live sessions. */
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
