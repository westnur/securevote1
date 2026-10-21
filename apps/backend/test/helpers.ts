import request from "supertest";
import { inject } from "vitest";
import { getAddress } from "ethers";
import { loadEnv } from "../src/config/env.js";
import { createApp, DEFAULT_LIMITS, type AppDeps } from "../src/app.js";
import { EthersChainGateway } from "../src/lib/chain.js";
import { createPrisma } from "../src/lib/prisma.js";
import { seedDatabase, DEMO_USERS, HARDHAT_ACCOUNTS } from "../prisma/seed-data.js";
import { signerContract } from "../scripts/lib/dev-signer.js";

export const TEST_PASSWORD = "Test-Password-123";
export const CSRF = { "X-SecureVote-CSRF": "1" } as const;

export function testEnv() {
  return loadEnv({
    ...process.env,
    NODE_ENV: "test",
    DATABASE_URL: process.env.TEST_DATABASE_URL,
    RPC_URL: inject("rpcUrl"),
    CONTRACT_ADDRESS: inject("contractAddress"),
    DEMO_MODE: "true",
  });
}

export async function setupTestApp(limits: Partial<AppDeps["limits"]> = {}) {
  const env = testEnv();
  const prisma = createPrisma(env.DATABASE_URL);
  const seeded = await seedDatabase(prisma, { password: TEST_PASSWORD, bcryptRounds: 4 });
  const chain = new EthersChainGateway(env.RPC_URL, env.CHAIN_ID, { contractAddress: env.CONTRACT_ADDRESS });
  const app = createApp({ prisma, chain, env, limits: { ...DEFAULT_LIMITS, apiPer15Min: 100_000, writesPerMinute: 100_000, loginPer15Min: 1000, ...limits } });
  return { app, prisma, chain, env, ...seeded };
}

export type UserKey = (typeof DEMO_USERS)[number]["key"];

export const emailOf = (key: UserKey) => DEMO_USERS.find((u) => u.key === key)!.email;
export const walletOf = (key: UserKey) => getAddress(HARDHAT_ACCOUNTS[DEMO_USERS.find((u) => u.key === key)!.wallet]!);

/** A supertest agent (keeps cookies) logged in as the given demo user. */
export async function loginAs(app: Parameters<typeof request.agent>[0], key: UserKey) {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/login").set(CSRF).send({ email: emailOf(key), password: TEST_PASSWORD });
  if (res.status !== 200) throw new Error(`login ${key} failed: ${res.status} ${JSON.stringify(res.body)}`);
  return agent;
}

/** Contract connected to the user's own unlocked local test account (simulates their wallet). */
export function walletContract(key: UserKey) {
  return signerContract(inject("rpcUrl"), inject("contractAddress"), walletOf(key));
}

export async function sendTx(p: Promise<{ wait: () => Promise<{ hash: string } | null> }>): Promise<string> {
  const tx = await p;
  return (await tx.wait())!.hash;
}

export function isoIn(seconds: number) {
  return new Date((Math.floor(Date.now() / 1000) + seconds) * 1000).toISOString();
}
