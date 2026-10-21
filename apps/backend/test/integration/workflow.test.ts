/**
 * Integration test of the PRIMARY VOTING WORKFLOW across REST API, PostgreSQL and the
 * SecureVote contract on an isolated Hardhat node:
 *
 *   create draft -> eligibility list -> publish (createSession) -> register voters ->
 *   open -> vote -> duplicate vote rejected -> close -> verify weighted results -> audit
 *
 * Each on-chain transaction is signed by the acting user's own local test account,
 * like the browser does. The API receives only transaction hashes.
 */
import { JsonRpcProvider, getAddress, type Contract } from "ethers";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { CSRF, isoIn, loginAs, sendTx, setupTestApp, walletContract, walletOf } from "../helpers.js";

let ctx: Awaited<ReturnType<typeof setupTestApp>>;
type Agent = Awaited<ReturnType<typeof loginAs>>;
let organizer: Agent, alikhan: Agent, madina: Agent, timur: Agent, zarina: Agent, auditor: Agent;
let organizerC: Contract, alikhanC: Contract, madinaC: Contract, timurC: Contract, zarinaC: Contract, auditorC: Contract;
let electionId = "";
let sessionId = "";
let election: { startTime: string; endTime: string };
const TITLE = "Integration test: approve merger with Fictional Partner LLP";
const OPTIONS = ["Approve", "Reject"];

/** Assert that a contract call reverts with the given custom error name. */
async function expectRevert(p: Promise<unknown>, errorName: string) {
  try {
    await p;
  } catch (err) {
    // Errors raised during gas estimation by a JSON-RPC signer carry raw revert data;
    // decode it with the contract ABI to get the custom error name.
    const e = err as { revert?: { name?: string }; data?: string; message?: string };
    const decoded = e.data ? organizerC.interface.parseError(e.data)?.name : undefined;
    expect(e.revert?.name ?? decoded ?? e.message).toBe(errorName);
    return;
  }
  throw new Error(`Expected revert ${errorName}, but the call succeeded`);
}

const sec = (iso: string) => Math.floor(Date.parse(iso) / 1000);

beforeAll(async () => {
  ctx = await setupTestApp();
  [organizer, alikhan, madina, timur, zarina, auditor] = await Promise.all(
    (["organizer", "alikhan", "madina", "timur", "zarina", "auditor"] as const).map((k) => loginAs(ctx.app, k)),
  );
  [organizerC, alikhanC, madinaC, timurC, zarinaC, auditorC] = await Promise.all(
    (["organizer", "alikhan", "madina", "timur", "zarina", "auditor"] as const).map((k) => walletContract(k)),
  );
});
afterAll(async () => {
  await ctx.prisma.$disconnect();
});

describe("primary voting workflow", () => {
  it("1. organizer creates a draft election with two options", async () => {
    const res = await organizer
      .post("/api/elections")
      .set(CSRF)
      .send({
        organizationId: ctx.orgIds.altyn,
        title: TITLE,
        description: "Synthetic integration-test scenario.",
        options: OPTIONS,
        startTime: isoIn(0),
        endTime: isoIn(24 * 3600),
        quorumBps: 5000,
      });
    expect(res.status).toBe(201);
    expect(res.body.election.status).toBe("DRAFT");
    electionId = res.body.election.id;
    election = res.body.election;
  });

  it("2. organizer registers fictional eligible shareholders and weights (off-chain list)", async () => {
    const res = await organizer
      .put(`/api/elections/${electionId}/voters`)
      .set(CSRF)
      .send({
        voters: [
          { userId: ctx.userIds.alikhan, weight: 4000 },
          { userId: ctx.userIds.madina, weight: 3000 },
          { userId: ctx.userIds.timur, weight: 2000 },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(3);
  });

  it("3a. refuses to link an on-chain session whose configuration differs from the draft", async () => {
    const hash = await sendTx(
      organizerC.createSession("A different title", OPTIONS, sec(election.startTime), sec(election.endTime), 5000),
    );
    const res = await organizer.post(`/api/elections/${electionId}/publish`).set(CSRF).send({ txHash: hash });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("CONFIG_MISMATCH");
  });

  it("3b. rejects session creation by an account without ORGANIZER_ROLE (contract)", async () => {
    await expectRevert(
      auditorC.createSession(TITLE, OPTIONS, sec(election.startTime), sec(election.endTime), 5000),
      "AccessControlUnauthorizedAccount",
    );
  });

  it("3c. organizer publishes the election on-chain with their own wallet", async () => {
    const hash = await sendTx(organizerC.createSession(TITLE, OPTIONS, sec(election.startTime), sec(election.endTime), 5000));
    const res = await organizer.post(`/api/elections/${electionId}/publish`).set(CSRF).send({ txHash: hash });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("CONFIRMED");
    sessionId = res.body.sessionId;
    const detail = await organizer.get(`/api/elections/${electionId}`);
    expect(detail.body.election.status).toBe("REGISTRATION");
    expect(detail.body.election.chain.configMatchesDatabase).toBe(true);
  });

  it("freezes the draft and eligibility list after publication", async () => {
    expect((await organizer.put(`/api/elections/${electionId}/voters`).set(CSRF).send({ voters: [] })).status).toBe(409);
    expect((await organizer.delete(`/api/elections/${electionId}`).set(CSRF)).status).toBe(409);
  });

  it("4. organizer registers the voters on-chain; unauthorized registration is rejected", async () => {
    await expectRevert(alikhanC.registerVoters(sessionId, [walletOf("alikhan")], [999_999]), "NotSessionOrganizer");
    const list = await organizer.get(`/api/elections/${electionId}/voters`);
    const voters = list.body.voters as { walletAddress: string; weight: number; onChain: { registered: boolean } }[];
    expect(voters.every((v) => v.onChain.registered === false)).toBe(true);
    const hash = await sendTx(
      organizerC.registerVoters(
        sessionId,
        voters.map((v) => v.walletAddress),
        voters.map((v) => v.weight),
      ),
    );
    const res = await organizer.post(`/api/elections/${electionId}/voters/registration`).set(CSRF).send({ txHash: hash });
    expect(res.status).toBe(200);
    expect(res.body.registered).toBe(3);
    expect(res.body.mismatches).toEqual([]);
  });

  it("rejects a vote before the session is opened", async () => {
    const elig = await alikhan.get(`/api/elections/${electionId}/eligibility`);
    expect(elig.body).toMatchObject({ canVote: false, reason: "NOT_OPEN", weight: 4000 });
    await expectRevert(alikhanC.castVote(sessionId, 0), "InvalidState");
  });

  it("5. organizer opens the session", async () => {
    const hash = await sendTx(organizerC.openSession(sessionId));
    const res = await organizer.post(`/api/elections/${electionId}/open`).set(CSRF).send({ txHash: hash });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ voterCount: 3, totalEligibleWeight: "9000" });
    // registration is closed now
    await expectRevert(organizerC.registerVoters(sessionId, [walletOf("zarina")], [1000]), "InvalidState");
  });

  it("6-8. eligible shareholders check eligibility and cast weighted votes", async () => {
    const elig = await alikhan.get(`/api/elections/${electionId}/eligibility`);
    expect(elig.body).toMatchObject({
      status: "ACTIVE",
      canVote: true,
      weight: 4000,
      onChain: { registered: true, weight: "4000" },
    });

    const h1 = await sendTx(alikhanC.castVote(sessionId, 1)); // Reject (4000)
    const r1 = await alikhan.post(`/api/elections/${electionId}/votes`).set(CSRF).send({ txHash: h1 });
    expect(r1.status).toBe(200);
    expect(r1.body).toMatchObject({ status: "CONFIRMED", weight: "4000" });

    const h2 = await sendTx(madinaC.castVote(sessionId, 0)); // Approve (3000)
    expect((await madina.post(`/api/elections/${electionId}/votes`).set(CSRF).send({ txHash: h2 })).status).toBe(200);

    // Re-submitting your own hash is idempotent; claiming someone else's vote is rejected.
    expect((await alikhan.post(`/api/elections/${electionId}/votes`).set(CSRF).send({ txHash: h1 })).status).toBe(200);
    const stolen = await timur.post(`/api/elections/${electionId}/votes`).set(CSRF).send({ txHash: h1 });
    expect(stolen.status).toBe(403);
    expect(stolen.body.error.code).toBe("TX_SENDER_MISMATCH");
  });

  it("11. rejects a duplicate vote from the same voter", async () => {
    await expectRevert(alikhanC.castVote(sessionId, 0), "AlreadyVoted");
    const elig = await alikhan.get(`/api/elections/${electionId}/eligibility`);
    expect(elig.body).toMatchObject({ canVote: false, reason: "ALREADY_VOTED" });
    expect(elig.body.voteTransaction.status).toBe("CONFIRMED");
  });

  it("rejects a vote from an ineligible shareholder (API hides the election, contract rejects)", async () => {
    expect((await zarina.get(`/api/elections/${electionId}`)).status).toBe(404);
    await expectRevert(zarinaC.castVote(sessionId, 0), "NotEligible");
  });

  it("does not publish results before closure and prevents early closing while voters remain", async () => {
    const res = await auditor.get(`/api/elections/${electionId}/results`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("RESULTS_NOT_AVAILABLE");
    await expectRevert(organizerC.closeSession(sessionId), "CloseNotAllowedYet");
  });

  it("rejects closing by unauthorized users (API and contract)", async () => {
    expect(
      (
        await auditor
          .post(`/api/elections/${electionId}/close`)
          .set(CSRF)
          .send({ txHash: "0x" + "3".repeat(64) })
      ).status,
    ).toBe(403);
    await expectRevert(auditorC.closeSession(sessionId), "NotSessionOrganizer");
  });

  it("13. closes the session once every registered voter has voted", async () => {
    const h = await sendTx(timurC.castVote(sessionId, 0)); // Approve (2000)
    expect((await timur.post(`/api/elections/${electionId}/votes`).set(CSRF).send({ txHash: h })).status).toBe(200);
    const hash = await sendTx(organizerC.closeSession(sessionId));
    const res = await organizer.post(`/api/elections/${electionId}/close`).set(CSRF).send({ txHash: hash });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ votesCast: 3, totalVotedWeight: "9000" });
  });

  it("12. rejects votes after the session is closed", async () => {
    await expectRevert(madinaC.castVote(sessionId, 1), "InvalidState");
    const elig = await madina.get(`/api/elections/${electionId}/eligibility`);
    expect(elig.body).toMatchObject({ status: "CLOSED", canVote: false, reason: "CLOSED" });
  });

  it("13. returns correct weighted results that match an independent event recount", async () => {
    const res = await alikhan.get(`/api/elections/${electionId}/results`);
    expect(res.status).toBe(200);
    expect(res.body.options).toEqual([
      { index: 0, label: "Approve", weight: "5000", votes: "2", weightPercent: 55.55 },
      { index: 1, label: "Reject", weight: "4000", votes: "1", weightPercent: 44.44 },
    ]);
    expect(res.body).toMatchObject({
      totalVotedWeight: "9000",
      totalEligibleWeight: "9000",
      turnoutPercent: 100,
      quorumReached: true,
      outcome: { decided: true, leaders: [0] },
      verification: { matchesContract: true, voteEvents: 3, registeredVoters: 3 },
    });
    // Note: by head count Reject (1 vote) loses 2:1, by weight Approve wins 5000:4000.
  });

  it("14. auditor inspects contract events and verifies totals and configuration", async () => {
    const res = await auditor.get(`/api/elections/${electionId}/audit`);
    expect(res.status).toBe(200);
    const names = res.body.chainEvents.map((e: { name: string }) => e.name);
    expect(names).toEqual([
      "SessionCreated",
      "VoterRegistered",
      "VoterRegistered",
      "VoterRegistered",
      "SessionOpened",
      "VoteCast",
      "VoteCast",
      "VoteCast",
      "SessionClosed",
    ]);
    expect(res.body.verification.configMatchesDatabase.allMatch).toBe(true);
    expect(res.body.verification.totals.matches).toBe(true);
    expect(res.body.transactions.filter((t: { kind: string }) => t.kind === "CAST_VOTE")).toHaveLength(3);
    // The mismatching session from step 3a was recorded as FAILED, not as success.
    const failed = await ctx.prisma.transactionReference.findMany({ where: { electionId, status: "FAILED" } });
    expect(failed).toHaveLength(1);
  });

  it("keeps ballot choices out of the application audit log", async () => {
    const events = await ctx.prisma.auditEvent.findMany({ where: { electionId, action: "VOTE_RECORDED" } });
    expect(events).toHaveLength(3);
    for (const e of events) expect(JSON.stringify(e.details)).not.toMatch(/option/i);
  });

  it("rejects a vote after the voting window has expired (time travel on the test chain)", async () => {
    const provider = new JsonRpcProvider(inject("rpcUrl"), 31337, { staticNetwork: true });
    const snapshot = await provider.send("evm_snapshot", []);
    try {
      const now = Math.floor(Date.now() / 1000);
      const created = await (await organizerC.createSession("Short window", ["A", "B"], now, now + 3600, 0)).wait();
      const id = organizerC.interface.parseLog(created.logs[0])!.args.sessionId;
      await sendTx(organizerC.registerVoters(id, [getAddress(walletOf("madina"))], [10]));
      await sendTx(organizerC.openSession(id));
      await provider.send("evm_increaseTime", [7200]);
      await provider.send("evm_mine", []);
      await expectRevert(madinaC.castVote(id, 0), "VotingEnded");
    } finally {
      await provider.send("evm_revert", [snapshot]);
    }
  });
});
