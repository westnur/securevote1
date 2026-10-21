import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CSRF, TEST_PASSWORD, loginAs, setupTestApp } from "../helpers.js";

let ctx: Awaited<ReturnType<typeof setupTestApp>>;
beforeAll(async () => {
  ctx = await setupTestApp();
});
afterAll(async () => {
  await ctx.prisma.$disconnect();
});

describe("authentication", () => {
  it("logs in with valid demo credentials and sets a hardened session cookie", async () => {
    const res = await request(ctx.app)
      .post("/api/auth/login")
      .set(CSRF)
      .send({ email: "organizer@demo.securevote.test", password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: "organizer@demo.securevote.test" });
    expect(res.body.user.passwordHash).toBeUndefined();
    const cookie = String(res.headers["set-cookie"]);
    expect(cookie).toMatch(/sv_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
  });

  it("rejects a wrong password and an unknown user with the same generic error", async () => {
    const wrong = await request(ctx.app)
      .post("/api/auth/login")
      .set(CSRF)
      .send({ email: "organizer@demo.securevote.test", password: "nope" });
    const unknown = await request(ctx.app).post("/api/auth/login").set(CSRF).send({ email: "ghost@demo.securevote.test", password: "x" });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });

  it("returns the current user and memberships from the server-side session", async () => {
    const agent = await loginAs(ctx.app, "alikhan");
    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.memberships[0]).toMatchObject({ roles: ["SHAREHOLDER"], shareCount: 4000 });
  });

  it("invalidates the session on logout", async () => {
    const agent = await loginAs(ctx.app, "alikhan");
    expect((await agent.post("/api/auth/logout").set(CSRF)).status).toBe(204);
    expect((await agent.get("/api/auth/me")).status).toBe(401);
  });

  it("rejects requests with a forged or missing session cookie", async () => {
    expect((await request(ctx.app).get("/api/elections")).status).toBe(401);
    const forged = await request(ctx.app).get("/api/elections").set("Cookie", "sv_session=" + "A".repeat(43));
    expect(forged.status).toBe(401);
  });

  it("lists demo accounts without exposing passwords or hashes", async () => {
    const res = await request(ctx.app).get("/api/auth/demo-accounts");
    expect(res.status).toBe(200);
    expect(res.body.accounts.length).toBeGreaterThan(5);
    expect(JSON.stringify(res.body)).not.toMatch(/password|\$2[aby]\$/i);
  });
});

describe("CSRF and transport protections", () => {
  it("rejects state-changing requests without the CSRF header", async () => {
    const res = await request(ctx.app).post("/api/auth/login").send({ email: "a@b.test", password: "x" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("CSRF_HEADER_MISSING");
  });

  it("rejects state-changing requests from a foreign Origin", async () => {
    const agent = await loginAs(ctx.app, "organizer");
    const res = await agent.post("/api/elections").set(CSRF).set("Origin", "https://evil.example").send({});
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("CSRF_ORIGIN_REJECTED");
  });

  it("does not grant CORS access to foreign origins", async () => {
    const res = await request(ctx.app).get("/api/health").set("Origin", "https://evil.example");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    const ok = await request(ctx.app).get("/api/health").set("Origin", "http://localhost:5173");
    expect(ok.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
  });

  it("sends security headers and hides the framework", async () => {
    const res = await request(ctx.app).get("/api/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-security-policy"]).toBeDefined();
    expect(res.headers["x-frame-options"]).toBeDefined();
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("returns safe JSON errors for malformed and oversized bodies", async () => {
    const bad = await request(ctx.app).post("/api/auth/login").set(CSRF).set("Content-Type", "application/json").send("{bad json");
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("INVALID_JSON");
    const big = await request(ctx.app).post("/api/auth/login").set(CSRF).send({ email: "a@b.test", password: "x".repeat(60_000) });
    expect(big.status).toBe(413);
    expect(JSON.stringify(bad.body)).not.toMatch(/stack|node_modules/);
  });
});

describe("rate limiting", () => {
  it("blocks repeated failed logins for the same account", async () => {
    const limited = await setupTestApp({ loginPer15Min: 3 });
    const attempt = () =>
      request(limited.app).post("/api/auth/login").set(CSRF).send({ email: "madina@demo.securevote.test", password: "wrong" });
    for (let i = 0; i < 3; i++) expect((await attempt()).status).toBe(401);
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("RATE_LIMITED");
    await limited.prisma.$disconnect();
  });
});

describe("health", () => {
  it("reports database and blockchain status without secrets", async () => {
    const res = await request(ctx.app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok", database: "ok", blockchain: { reachable: true, chainId: 31337, contractDeployed: true } });
    expect(JSON.stringify(res.body)).not.toMatch(/postgres|password/i);
  });
});
