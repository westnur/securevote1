/**
 * Populates the LOCAL demo with two on-chain elections by driving the real REST API and
 * signing each transaction with the acting user's own (unlocked, local) Hardhat account —
 * exactly what the frontend does. Requires: node running, contract deployed, DB seeded,
 * backend running.  Usage: npm run demo:scenario
 *
 *  1. "Appointment of the external auditor for FY2026" — every voter votes, then closed.
 *  2. "Approval of the 2027 capital expenditure plan"   — open, 2 of 5 voters have voted.
 * The seeded draft "Approval of the FY2026 dividend policy" is left for the live demo.
 */
import { getAddress, type Contract } from "ethers";
import { ApiClient } from "./lib/api-client.js";
import { signerContract } from "./lib/dev-signer.js";

const API = process.env.API_URL ?? `http://127.0.0.1:${process.env.PORT ?? 4000}`;
const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "";
const email = (u: string) => `${u}@demo.securevote.test`;

interface Me { user: { walletAddress: string }; memberships: { organizationId: string }[] }
interface Voters { candidates: { userId: string; displayName: string; shareCount: number; walletAddress: string }[]; voters: { walletAddress: string; weight: number }[] }

async function as(user: string) {
  const api = new ApiClient(API);
  await api.login(email(user), PASSWORD);
  const me = await api.expectOk<Me>("GET", "/api/auth/me");
  return { api, me };
}

async function send(contractCall: Promise<{ wait: () => Promise<{ hash: string } | null> }>) {
  const tx = await contractCall;
  const receipt = await tx.wait();
  return receipt!.hash;
}

async function runElection(opts: {
  contractAddress: string;
  title: string;
  description: string;
  options: string[];
  hours: number;
  quorumBps: number;
  voters: string[];
  votes: [string, number][];
  close: boolean;
}) {
  const org = await as("organizer");
  const orgId = org.me.memberships[0]!.organizationId;
  const organizerContract = await signerContract(RPC, opts.contractAddress, org.me.user.walletAddress);
  const now = Math.floor(Date.now() / 1000);
  const start = new Date(now * 1000).toISOString();
  const end = new Date((now + opts.hours * 3600) * 1000).toISOString();

  const { election } = await org.api.expectOk<{ election: { id: string; startTime: string; endTime: string } }>(
    "POST",
    "/api/elections",
    { organizationId: orgId, title: opts.title, description: opts.description, options: opts.options, startTime: start, endTime: end, quorumBps: opts.quorumBps },
  );
  const { candidates } = await org.api.expectOk<Voters>("GET", `/api/elections/${election.id}/voters`);
  const chosen = candidates.filter((c) => opts.voters.includes(c.displayName.split(" ")[0]!.toLowerCase()));
  await org.api.expectOk("PUT", `/api/elections/${election.id}/voters`, {
    voters: chosen.map((c) => ({ userId: c.userId, weight: c.shareCount })),
  });

  const startSec = Date.parse(election.startTime) / 1000;
  const endSec = Date.parse(election.endTime) / 1000;
  let hash = await send(organizerContract.createSession(opts.title, opts.options, startSec, endSec, opts.quorumBps));
  const pub = await org.api.expectOk<{ sessionId: string }>("POST", `/api/elections/${election.id}/publish`, { txHash: hash });

  hash = await send(
    organizerContract.registerVoters(pub.sessionId, chosen.map((c) => getAddress(c.walletAddress)), chosen.map((c) => c.shareCount)),
  );
  await org.api.expectOk("POST", `/api/elections/${election.id}/voters/registration`, { txHash: hash });
  hash = await send(organizerContract.openSession(pub.sessionId));
  await org.api.expectOk("POST", `/api/elections/${election.id}/open`, { txHash: hash });

  for (const [voter, option] of opts.votes) {
    const v = await as(voter);
    const c: Contract = await signerContract(RPC, opts.contractAddress, v.me.user.walletAddress);
    hash = await send(c.castVote(pub.sessionId, option));
    await v.api.expectOk("POST", `/api/elections/${election.id}/votes`, { txHash: hash });
  }
  if (opts.close) {
    hash = await send(organizerContract.closeSession(pub.sessionId));
    await org.api.expectOk("POST", `/api/elections/${election.id}/close`, { txHash: hash });
  }
  console.log(`  ✔ ${opts.title} (session #${pub.sessionId}, ${opts.votes.length} votes${opts.close ? ", closed" : ", open"})`);
}

async function main() {
  if (!PASSWORD) throw new Error("SEED_DEMO_PASSWORD is not set");
  const health = await fetch(`${API}/api/health`).then((r) => r.json()).catch(() => null);
  if (!health?.blockchain?.contractDeployed) {
    throw new Error(`Backend at ${API} not ready or contract not deployed: ${JSON.stringify(health)}`);
  }
  const cfg = await fetch(`${API}/api/config`).then((r) => r.json());
  console.log(`Creating synthetic on-chain demo elections on contract ${cfg.contractAddress} ...`);

  await runElection({
    contractAddress: cfg.contractAddress,
    title: "Appointment of the external auditor for FY2026",
    description: "Choose between two FICTIONAL audit firms. Completed example election.",
    options: ["Audit firm A (fictional)", "Audit firm B (fictional)"],
    hours: 48,
    quorumBps: 5000,
    voters: ["alikhan", "madina", "timur", "zarina", "saule"],
    votes: [["alikhan", 1], ["madina", 0], ["timur", 0], ["zarina", 0], ["saule", 1]],
    close: true,
  });
  await runElection({
    contractAddress: cfg.contractAddress,
    title: "Approval of the 2027 capital expenditure plan",
    description: "Fictional capital expenditure plan of 1.2 bn KZT for warehouse automation. Active example election.",
    options: ["Approve", "Reject", "Abstain"],
    hours: 72,
    quorumBps: 6000,
    voters: ["alikhan", "madina", "timur", "zarina", "saule"],
    votes: [["timur", 0], ["zarina", 1]],
    close: false,
  });
  console.log("Done. The draft 'Approval of the FY2026 dividend policy' is left for the live demo.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
