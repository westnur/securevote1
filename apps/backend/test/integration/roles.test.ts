/** Admin grants/revokes ORGANIZER_ROLE on-chain; the API mirrors it only after verifying the event. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CSRF, isoIn, loginAs, sendTx, setupTestApp, walletContract, walletOf } from "../helpers.js";

let ctx: Awaited<ReturnType<typeof setupTestApp>>;
beforeAll(async () => {
  ctx = await setupTestApp();
});
afterAll(async () => {
  await ctx.prisma.$disconnect();
});

describe("organizer role management", () => {
  it("grants the organizer role after verifying the on-chain RoleGranted event, then revokes it", async () => {
    const admin = await loginAs(ctx.app, "admin");
    const adminC = await walletContract("admin");
    const role = await adminC.ORGANIZER_ROLE();
    const url = `/api/organizations/${ctx.orgIds.altyn}/members/${ctx.userIds.saule}/organizer-role`;

    // Before: Saule cannot create elections.
    const saule = await loginAs(ctx.app, "saule");
    const draft = {
      organizationId: ctx.orgIds.altyn,
      title: "Saule test",
      options: ["A", "B"],
      startTime: isoIn(0),
      endTime: isoIn(3600),
    };
    expect((await saule.post("/api/elections").set(CSRF).send(draft)).status).toBe(403);

    // A transaction that does something else (wrong event) is not accepted as a grant.
    const unrelated = await sendTx(adminC.grantRole(role, walletOf("timur")));
    const wrong = await admin.post(url).set(CSRF).send({ action: "grant", txHash: unrelated });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.code).toBe("EVENT_MISSING");
    await sendTx(adminC.revokeRole(role, walletOf("timur")));

    const grant = await sendTx(adminC.grantRole(role, walletOf("saule")));
    const res = await admin.post(url).set(CSRF).send({ action: "grant", txHash: grant });
    expect(res.status).toBe(200);
    expect(res.body.roles).toEqual(expect.arrayContaining(["SHAREHOLDER", "ORGANIZER"]));
    expect(await (await walletContract("saule")).hasRole(role, walletOf("saule"))).toBe(true);

    // After: the same user (new session reloads memberships) can create a draft.
    const saule2 = await loginAs(ctx.app, "saule");
    expect((await saule2.post("/api/elections").set(CSRF).send(draft)).status).toBe(201);

    const revoke = await sendTx(adminC.revokeRole(role, walletOf("saule")));
    const res2 = await admin.post(url).set(CSRF).send({ action: "revoke", txHash: revoke });
    expect(res2.status).toBe(200);
    expect(res2.body.roles).toEqual(["SHAREHOLDER"]);
  });

  it("rejects a grant transaction signed by someone other than the logged-in admin", async () => {
    const admin = await loginAs(ctx.app, "admin");
    const organizerC = await walletContract("organizer");
    // The organizer is not an on-chain admin, so even trying fails at the contract level.
    await expect(organizerC.grantRole(await organizerC.ORGANIZER_ROLE(), walletOf("saule"))).rejects.toThrow();
    // A real transaction from another wallet is rejected by the API's sender check.
    const now = Math.floor(Date.now() / 1000);
    const otherTx = await sendTx(organizerC.createSession("x", ["A", "B"], now, now + 3600, 0));
    const res = await admin
      .post(`/api/organizations/${ctx.orgIds.altyn}/members/${ctx.userIds.saule}/organizer-role`)
      .set(CSRF)
      .send({ action: "grant", txHash: otherTx });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("TX_SENDER_MISMATCH");
  });
});
