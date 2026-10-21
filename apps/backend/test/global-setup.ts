/**
 * Global test setup:
 *  - migrates the dedicated TEST database (TEST_DATABASE_URL, never the dev database)
 *  - starts an isolated Hardhat node on port 8546 and deploys SecureVote to it
 */
import { execSync, spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ContractFactory, JsonRpcProvider } from "ethers";
import type { TestProject } from "vitest/node";

const here = path.dirname(fileURLToPath(import.meta.url));
const contractsDir = path.resolve(here, "../../../packages/contracts");
const backendDir = path.resolve(here, "..");
export const TEST_RPC_PORT = 8546;

declare module "vitest" {
  export interface ProvidedContext {
    contractAddress: string;
    rpcUrl: string;
  }
}

async function waitForRpc(url: string, timeoutMs = 60_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      });
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Hardhat test node did not start at ${url}`);
}

let node: ChildProcess | undefined;

export default async function setup(project: TestProject) {
  const testDb = process.env.TEST_DATABASE_URL;
  if (!testDb) throw new Error("TEST_DATABASE_URL must be set for backend tests (see .env.example)");
  if (testDb === process.env.DATABASE_URL) throw new Error("TEST_DATABASE_URL must differ from DATABASE_URL");
  execSync("npx prisma migrate deploy", {
    cwd: backendDir,
    env: { ...process.env, DATABASE_URL: testDb },
    stdio: "pipe",
  });

  const artifact = path.join(contractsDir, "artifacts/contracts/SecureVote.sol/SecureVote.json");
  if (!fs.existsSync(artifact)) execSync("npx hardhat compile", { cwd: contractsDir, stdio: "pipe" });

  const rpcUrl = `http://127.0.0.1:${TEST_RPC_PORT}`;
  node = spawn("npx", ["hardhat", "node", "--hostname", "127.0.0.1", "--port", String(TEST_RPC_PORT)], {
    cwd: contractsDir,
    stdio: "ignore",
    detached: true,
  });
  await waitForRpc(rpcUrl);

  const { abi, bytecode } = JSON.parse(fs.readFileSync(artifact, "utf8"));
  const provider = new JsonRpcProvider(rpcUrl, 31337, { staticNetwork: true });
  const [admin, organizer] = await provider.listAccounts();
  const contract = await new ContractFactory(abi, bytecode, admin).deploy(admin!.address);
  await contract.waitForDeployment();
  const c = contract as unknown as {
    ORGANIZER_ROLE(): Promise<string>;
    grantRole(r: string, a: string): Promise<{ wait(): Promise<unknown> }>;
  };
  await (await c.grantRole(await c.ORGANIZER_ROLE(), organizer!.address)).wait();

  project.provide("contractAddress", await contract.getAddress());
  project.provide("rpcUrl", rpcUrl);

  return () => {
    if (node?.pid) {
      try {
        process.kill(-node.pid, "SIGTERM"); // kill the whole process group (npx + hardhat)
      } catch {
        /* already stopped */
      }
    }
  };
}
