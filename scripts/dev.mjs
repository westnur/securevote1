#!/usr/bin/env node
/**
 * One-command local demo for SecureVote (EDUCATIONAL PROTOTYPE).
 *
 *   npm run dev          start everything; reuse existing chain/database state if valid
 *   npm run dev:fresh    restart from scratch: new chain, redeploy, reset DB, demo data
 *
 * Startup order (each step waits for the previous one):
 *   1. check .env and PostgreSQL
 *   2. Hardhat node on 127.0.0.1:8545 (started here unless already running)
 *   3. deploy SecureVote (if the node is new or has no contract)
 *   4. apply database migrations (+ re-seed synthetic data when the chain was redeployed)
 *   5. backend API on :4000 and frontend on :5173
 *   6. optional synthetic on-chain demo elections (only after a fresh deploy)
 *
 * Note: the Hardhat node prints its PUBLIC test private keys at startup. They are
 * well-known development keys, but keep that output out of screenshots/videos anyway.
 * This script writes the node output to .run/hardhat-node.log instead of the console.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fresh = process.argv.includes("--fresh");
const skipScenario = process.argv.includes("--no-scenario");
const children = [];
const isWindows = process.platform === "win32";
// On Windows, npm is a .cmd script that Node.js only runs through a shell. With a
// shell the command is passed as ONE string (our arguments are fixed, not user input).
const npm = "npm";
const viaShell = (args) => (isWindows ? [`${npm} ${args.join(" ")}`, []] : [npm, args]);
// Child processes: never stop for Hardhat's interactive telemetry question.
const childEnv = { ...process.env, HARDHAT_DISABLE_TELEMETRY_PROMPT: "true" };

const log = (msg) => console.log(`\x1b[36m[securevote]\x1b[0m ${msg}`);
const fail = (msg) => {
  console.error(`\x1b[31m[securevote] ${msg}\x1b[0m`);
  shutdown(1);
};

function loadEnv() {
  const file = path.join(root, ".env");
  if (!fs.existsSync(file)) fail("No .env file found. Run: cp .env.example .env  (then edit the placeholders)");
  const env = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

function portOpen(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const s = net.connect({ port, host });
    s.once("connect", () => (s.destroy(), resolve(true)));
    s.once("error", () => resolve(false));
  });
}

async function rpc(url, method, params = []) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return (await res.json()).result;
}

async function waitFor(check, label, timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if (await check()) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  fail(`Timed out waiting for ${label}`);
}

function run(args, label) {
  log(label);
  const r = spawnSync(...viaShell(args), { cwd: root, stdio: "inherit", shell: isWindows, env: childEnv });
  if (r.status !== 0) fail(`Step failed: ${label}`);
}

function startProcess(args, name, logFile) {
  const out = logFile ? fs.openSync(logFile, "a") : "inherit";
  const child = spawn(...viaShell(args), {
    cwd: root,
    stdio: ["ignore", out, out],
    detached: !isWindows,
    shell: isWindows,
    env: childEnv,
  });
  children.push({ child, name });
  child.on("exit", (code) => {
    if (!shuttingDown) log(`${name} exited with code ${code}`);
  });
  return child;
}

let shuttingDown = false;
function shutdown(code = 0) {
  shuttingDown = true;
  for (const { child } of children) {
    try {
      // Stop the whole process tree (npm → node → hardhat/vite/tsx).
      if (isWindows) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      else process.kill(-child.pid, "SIGTERM");
    } catch {
      /* already stopped */
    }
  }
  process.exit(code);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

async function main() {
  const env = loadEnv();
  fs.mkdirSync(path.join(root, ".run"), { recursive: true });

  // 1. PostgreSQL
  const dbUrl = new URL(env.DATABASE_URL ?? "postgresql://localhost:5432/x");
  const dbHost = dbUrl.hostname === "localhost" ? "127.0.0.1" : dbUrl.hostname;
  const dbPort = Number(dbUrl.port || 5432);
  // Give a just-started Docker container a moment to accept connections.
  const dbStart = Date.now();
  while (!(await portOpen(dbPort, dbHost))) {
    if (Date.now() - dbStart > 30_000) {
      fail(
        `PostgreSQL is not reachable at ${dbUrl.hostname}:${dbPort}. Start it with: npm run db:up (Docker Desktop must be running)`,
      );
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  await new Promise((r) => setTimeout(r, Date.now() - dbStart > 1000 ? 3000 : 0)); // container init grace period
  log("PostgreSQL is reachable");

  // 2. Hardhat node
  const rpcUrl = env.RPC_URL || "http://127.0.0.1:8545";
  let startedNode = false;
  if (!(await portOpen(8545))) {
    log("Starting Hardhat node (log: .run/hardhat-node.log — contains PUBLIC test keys, do not record it)");
    startProcess(["run", "chain:node"], "hardhat-node", path.join(root, ".run/hardhat-node.log"));
    await waitFor(async () => (await rpc(rpcUrl, "eth_chainId")) === "0x7a69", "Hardhat node");
    startedNode = true;
  } else {
    const chainId = await rpc(rpcUrl, "eth_chainId").catch(() => null);
    if (chainId !== "0x7a69") fail(`Port 8545 is in use but is not a Hardhat node with chain id 31337 (got ${chainId}).`);
    log("Using the Hardhat node that is already running on :8545");
  }

  // 3. Contract
  const deploymentFile = path.join(root, "packages/contracts/deployments/localhost.json");
  let deployed = false;
  if (fs.existsSync(deploymentFile)) {
    const { address } = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
    deployed = (await rpc(rpcUrl, "eth_getCode", [address, "latest"])) !== "0x";
  }
  const redeploy = fresh || startedNode || !deployed;
  if (redeploy) {
    if (fresh && !startedNode) log("--fresh: redeploying to the running node");
    run(["run", "chain:deploy"], "Compiling and deploying SecureVote to the local chain");
  } else {
    log("SecureVote contract already deployed — keeping existing chain and database state");
  }

  // 4. Database
  // Generate the Prisma client explicitly: in npm workspaces @prisma/client's own install
  // hook cannot find apps/backend/prisma/schema.prisma.
  run(["run", "db:generate", "-w", "@securevote/backend"], "Generating Prisma client");
  run(["run", "db:migrate"], "Applying database migrations");
  if (redeploy) {
    // The old chain state is gone, so stale election references are replaced with fresh
    // synthetic demo data. The seed refuses to touch databases with non-demo accounts.
    run(["run", "db:seed"], "Re-seeding synthetic demo data (chain was redeployed)");
  }

  // 5. Backend + frontend
  startProcess(["run", "dev:backend"], "backend");
  await waitFor(async () => {
    const r = await fetch(`http://127.0.0.1:${env.PORT || 4000}/api/health`);
    return (await r.json()).status === "ok";
  }, "backend /api/health");
  startProcess(["run", "dev:frontend"], "frontend");
  await waitFor(() => portOpen(5173), "frontend on :5173");

  // 6. Demo data
  if (redeploy && !skipScenario) {
    run(["run", "demo:scenario"], "Creating synthetic on-chain demo elections");
  }

  log("");
  log("SecureVote is running (educational prototype — local Hardhat network, synthetic data):");
  log("  Frontend:  http://localhost:5173");
  log(`  API:       http://localhost:${env.PORT || 4000}/api/health`);
  log("  Demo users: organizer@ / alikhan@ / madina@ / timur@ / zarina@ / auditor@ / admin@demo.securevote.test");
  log("  Password:   the SEED_DEMO_PASSWORD value from your .env");
  log("Press Ctrl+C to stop all processes started by this script.");
}

main().catch((err) => fail(err?.message ?? String(err)));
