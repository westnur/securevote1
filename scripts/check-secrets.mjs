#!/usr/bin/env node
/**
 * Lightweight secret scanner for the files tracked by git (plus staged files).
 * It is NOT a replacement for a dedicated tool such as gitleaks or GitHub secret
 * scanning, but it catches the mistakes most likely in this project:
 *  - committed .env files
 *  - private keys / mnemonics / PEM blocks
 *  - database URLs with real-looking passwords
 * Hardhat's well-known PUBLIC test accounts are fine as ADDRESSES, but their private
 * keys must not be committed either (to build good habits).
 * Exit code 1 if anything suspicious is found.
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";

const files = execSync("git ls-files --cached --others --exclude-standard", {
  encoding: "utf8",
})
  .split("\n")
  .filter(Boolean)
  .filter(
    (f) =>
      fs.existsSync(f) &&
      !f.endsWith("package-lock.json") &&
      !f.includes("node_modules/"),
  );

const rules = [
  {
    name: "Tracked .env file",
    file: /(^|\/)\.env(\..+)?$/,
    exclude: /\.env\.example$/,
  },
  {
    name: "Private key assignment",
    re: /(private[_-]?key|PRIVATE_KEY|secret[_-]?key)\s*[:=]\s*["']?(0x)?[0-9a-fA-F]{64}\b/,
  },
  {
    name: "PEM private key",
    re: /-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----/,
  },
  {
    name: "Mnemonic phrase assignment",
    re: /(mnemonic|seed[_ ]?phrase)\s*[:=]\s*["'](\w+\s){11,23}\w+["']/i,
  },
  {
    name: "Database URL with password",
    re: /postgres(ql)?:\/\/[^:\s/]+:(?!change-me|password@|\$\{)[^@\s]{6,}@/,
  },
  {
    name: "Generic API token",
    re: /\b(sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{30,}|AKIA[0-9A-Z]{16})\b/,
  },
];

// SHA-256 fingerprints of well-known Hardhat test private keys (the keys themselves are
// deliberately not written in this repository). Any 64-hex token is hashed and compared.
const KNOWN_TEST_KEY_FINGERPRINTS = new Set([
  "bc1a50966c9e6486bc4ebf880b51611a2a97fcb8e7a6976e9b81a9e3e8ca0e3c", // Hardhat account #0
]);
const sha256 = (s) => createHash("sha256").update(s).digest("hex");

const findings = [];
for (const f of files) {
  if (!/\.(png|jpg|ico|zip)$/.test(f)) {
    for (const token of fs
      .readFileSync(f, "utf8")
      .match(/\b[0-9a-fA-F]{64}\b/g) ?? []) {
      if (KNOWN_TEST_KEY_FINGERPRINTS.has(sha256(token.toLowerCase())))
        findings.push(`${f}: Hardhat test private key`);
    }
  }
  for (const r of rules) {
    if (r.file) {
      if (r.file.test(f) && !(r.exclude && r.exclude.test(f)))
        findings.push(`${f}: ${r.name}`);
      continue;
    }
    if (f === "scripts/check-secrets.mjs") continue; // contains the patterns themselves
    const text = fs.readFileSync(f, "utf8");
    text.split("\n").forEach((line, i) => {
      if (r.re.test(line)) findings.push(`${f}:${i + 1}: ${r.name}`);
    });
  }
}

if (findings.length) {
  console.error(
    "Potential secrets found:\n" + findings.map((x) => "  - " + x).join("\n"),
  );
  process.exit(1);
}
console.log(`Secret scan passed (${files.length} files checked).`);
