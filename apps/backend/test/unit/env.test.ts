import { describe, expect, it } from "vitest";
import { loadEnv } from "../../src/config/env.js";

const base = { DATABASE_URL: "postgresql://u:p@localhost:5432/db" };

describe("environment validation", () => {
  it("applies safe defaults", () => {
    const env = loadEnv(base);
    expect(env.CHAIN_ID).toBe(31337);
    expect(env.COOKIE_SECURE).toBe(false);
    expect(env.CORS_ORIGIN).toEqual(["http://localhost:5173"]);
  });

  it("refuses any chain other than the local Hardhat chain", () => {
    expect(() => loadEnv({ ...base, CHAIN_ID: "1" })).toThrow(/31337/);
  });

  it("requires a PostgreSQL URL and a well-formed contract address", () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
    expect(() => loadEnv({ ...base, CONTRACT_ADDRESS: "0x123" })).toThrow(/CONTRACT_ADDRESS/);
  });

  it("never includes variable values in the error message", () => {
    try {
      loadEnv({ DATABASE_URL: "mysql://secret-password@host/db" });
      expect.unreachable();
    } catch (err) {
      expect(String(err)).not.toContain("secret-password");
    }
  });
});
