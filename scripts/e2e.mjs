#!/usr/bin/env node
/**
 * Runs the Playwright end-to-end test against the running local stack.
 * Start the stack first in another terminal:  npm run dev
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ok = await fetch("http://127.0.0.1:4000/api/health")
  .then((r) => r.json())
  .then((h) => h.status === "ok")
  .catch(() => false);
if (!ok) {
  console.error("The local stack is not running or not healthy. Start it with `npm run dev` and retry.");
  process.exit(1);
}
const r = spawnSync("npx", ["playwright", "test", ...process.argv.slice(2)], {
  cwd: path.join(root, "apps/frontend"),
  stdio: "inherit",
  shell: process.platform === "win32", // npx is a .cmd script on Windows
});
process.exit(r.status ?? 1);
