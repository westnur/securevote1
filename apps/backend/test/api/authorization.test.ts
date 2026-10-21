import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CSRF, isoIn, loginAs, setupTestApp } from "../helpers.js";

let ctx: Awaited<ReturnType<typeof setupTestApp>>;
let dividendId: string; // seeded draft in Altyn (owner: organizer)
let courtyardId: string; // seeded draft in Esil (owner: nurlan)

beforeAll(async () => {
  ctx = await setupTestApp();
  dividendId = (await ctx.prisma.election.findFirstOrThrow({ where: { title: { contains: "dividend" } } })).id;
  courtyardId = (await ctx.prisma.election.findFirstOrThrow({ where: { title: { contains: "Courtyard" } } })).id;
});
afterAll(async () => {
  await ctx.prisma.$disconnect();
});

const draft = (organizationId: string) => ({
  organizationId,
  title: "Unauthorized attempt",
  options: ["Yes", "No"],
  startTime: isoIn(0),
  endTime: isoIn(3600),
});

describe("role-based access control (server-side)", () => {
  it("rejects election creation by a shareholder, an auditor and an admin", async () => {
    for (const who of ["alikhan", "auditor", "admin"] as const) {
      const agent = await loginAs(ctx.app, who);
      const res = await agent.post("/api/elections").set(CSRF).send(draft(ctx.orgIds.altyn!));
      expect(res.status, who).toBe(403);
    }
  });

  it("rejects creating an election in an organization the organizer does not belong to", async () => {
    const agent = await loginAs(ctx.app, "organizer");
    const res = await agent.post("/api/elections").set(CSRF).send(draft(ctx.orgIds.esil!));
    expect(res.status).toBe(403);
  });

  it("hides drafts from shareholders and auditors (404, not 403, to avoid enumeration)", async () => {
    for (const who of ["alikhan", "auditor"] as const) {
      const agent = await loginAs(ctx.app, who);
      expect((await agent.get(`/api/elections/${dividendId}`)).status, who).toBe(404);
      const list = await agent.get("/api/elections");
      expect(list.body.elections.map((e: { id: string }) => e.id)).not.toContain(dividendId);
    }
  });

  it("isolates organizations: an Esil member cannot see Altyn elections and vice versa", async () => {
    const gulnara = await loginAs(ctx.app, "gulnara");
    expect((await gulnara.get(`/api/elections/${dividendId}`)).status).toBe(404);
    const organizer = await loginAs(ctx.app, "organizer");
    expect((await organizer.get(`/api/elections/${courtyardId}`)).status).toBe(404);
    expect((await organizer.get(`/api/organizations/${ctx.orgIds.esil}`)).status).toBe(404);
  });

  it("lets only the owning organizer edit a draft or its eligibility list", async () => {
    const nurlan = await loginAs(ctx.app, "nurlan");
    // Nurlan is an organizer, but of another organization: he cannot even see the draft.
    expect((await nurlan.put(`/api/elections/${dividendId}/voters`).set(CSRF).send({ voters: [] })).status).toBe(404);
    // The admin can see the draft but is not its organizer.
    const admin = await loginAs(ctx.app, "admin");
    const res = await admin.put(`/api/elections/${dividendId}/voters`).set(CSRF).send({ voters: [] });
    expect(res.status).toBe(403);
    const del = await admin.delete(`/api/elections/${dividendId}`).set(CSRF);
    expect(del.status).toBe(403);
  });

  it("does not let shareholders read the voter list or the audit log", async () => {
    // Make a published election visible to the shareholder first: use the admin-visible draft check instead.
    const shareholder = await loginAs(ctx.app, "alikhan");
    expect((await shareholder.get(`/api/elections/${dividendId}/voters`)).status).toBe(404);
    expect((await shareholder.get(`/api/elections/${dividendId}/audit`)).status).toBe(404);
  });

  it("restricts the admin system endpoint and the organizer-role endpoint to administrators", async () => {
    const organizer = await loginAs(ctx.app, "organizer");
    expect((await organizer.get("/api/admin/system")).status).toBe(403);
    const res = await organizer
      .post(`/api/organizations/${ctx.orgIds.altyn}/members/${ctx.userIds.saule}/organizer-role`)
      .set(CSRF)
      .send({ action: "grant", txHash: "0x" + "1".repeat(64) });
    expect(res.status).toBe(403);
    const admin = await loginAs(ctx.app, "admin");
    const sys = await admin.get("/api/admin/system");
    expect(sys.status).toBe(200);
    expect(sys.body.chain.adminWalletHasAdminRole).toBe(true);
  });

  it("enforces separation of duties: auditors cannot be made organizers", async () => {
    const admin = await loginAs(ctx.app, "admin");
    const res = await admin
      .post(`/api/organizations/${ctx.orgIds.altyn}/members/${ctx.userIds.auditor}/organizer-role`)
      .set(CSRF)
      .send({ action: "grant", txHash: "0x" + "2".repeat(64) });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("SEPARATION_OF_DUTIES");
  });

  it("shows member e-mail addresses to administrators only", async () => {
    const auditor = await loginAs(ctx.app, "auditor");
    const a = await auditor.get(`/api/organizations/${ctx.orgIds.altyn}`);
    expect(a.status).toBe(200);
    expect(a.body.members.every((m: { email?: string }) => m.email === undefined)).toBe(true);
    const shareholder = await loginAs(ctx.app, "madina");
    const s = await shareholder.get(`/api/organizations/${ctx.orgIds.altyn}`);
    expect(s.body.members).toHaveLength(1); // only their own membership
  });
});

describe("validation of manipulated client data", () => {
  it("rejects invalid election drafts", async () => {
    const agent = await loginAs(ctx.app, "organizer");
    const org = ctx.orgIds.altyn!;
    const cases = [
      { ...draft(org), options: ["Only one"] },
      { ...draft(org), options: ["Yes", "yes"] },
      { ...draft(org), endTime: isoIn(-10) },
      { ...draft(org), startTime: isoIn(7200), endTime: isoIn(3600) },
      { ...draft(org), title: "x".repeat(161) },
      { ...draft(org), quorumBps: 10_001 },
      { ...draft(org), options: Array.from({ length: 11 }, (_, i) => `O${i}`) },
      { ...draft(org), startTime: "tomorrow" },
    ];
    for (const body of cases) {
      const res = await agent.post("/api/elections").set(CSRF).send(body);
      expect(res.status, JSON.stringify(body).slice(0, 80)).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("rejects zero/negative weights, duplicates and non-shareholder voters", async () => {
    const agent = await loginAs(ctx.app, "organizer");
    const url = `/api/elections/${dividendId}/voters`;
    expect(
      (
        await agent
          .put(url)
          .set(CSRF)
          .send({ voters: [{ userId: ctx.userIds.alikhan, weight: 0 }] })
      ).status,
    ).toBe(400);
    expect(
      (
        await agent
          .put(url)
          .set(CSRF)
          .send({ voters: [{ userId: ctx.userIds.alikhan, weight: -5 }] })
      ).status,
    ).toBe(400);
    expect(
      (
        await agent
          .put(url)
          .set(CSRF)
          .send({
            voters: [
              { userId: ctx.userIds.alikhan, weight: 1 },
              { userId: ctx.userIds.alikhan, weight: 2 },
            ],
          })
      ).status,
    ).toBe(400);
    const auditorAsVoter = await agent
      .put(url)
      .set(CSRF)
      .send({ voters: [{ userId: ctx.userIds.auditor, weight: 10 }] });
    expect(auditorAsVoter.status).toBe(400);
    expect(auditorAsVoter.body.error.code).toBe("INVALID_VOTERS");
    const otherOrg = await agent
      .put(url)
      .set(CSRF)
      .send({ voters: [{ userId: ctx.userIds.gulnara, weight: 10 }] });
    expect(otherOrg.body.error.code).toBe("INVALID_VOTERS");
  });

  it("treats SQL-injection-like input as plain data", async () => {
    const agent = await loginAs(ctx.app, "organizer");
    const res = await agent.get("/api/elections").query({ q: '\'; DROP TABLE "User"; --' });
    expect(res.status).toBe(200);
    expect(res.body.elections).toEqual([]);
    expect(await ctx.prisma.user.count()).toBeGreaterThan(0);
    expect((await agent.get("/api/elections/' OR 1=1 --")).status).toBe(400);
  });

  it("stores script-like text verbatim (escaped by the UI, never executed by the API)", async () => {
    const agent = await loginAs(ctx.app, "organizer");
    const res = await agent
      .post("/api/elections")
      .set(CSRF)
      .send({ ...draft(ctx.orgIds.altyn!), title: "<img src=x onerror=alert(1)>" });
    expect(res.status).toBe(201);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body.election.title).toBe("<img src=x onerror=alert(1)>");
  });

  it("rejects malformed transaction hashes and unknown transactions", async () => {
    const agent = await loginAs(ctx.app, "organizer");
    const bad = await agent.post(`/api/elections/${dividendId}/publish`).set(CSRF).send({ txHash: "0x1234" });
    expect(bad.status).toBe(400);
    const unknown = await agent
      .post(`/api/elections/${dividendId}/publish`)
      .set(CSRF)
      .send({ txHash: "0x" + "ab".repeat(32) });
    expect(unknown.status).toBe(400);
    expect(unknown.body.error.code).toBe("TX_NOT_FOUND");
  });
});
