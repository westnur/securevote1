Educational project for the course Introduction to Finance. Not a real product, service or investment offer. Do not use with real funds.

# SecureVote — Secure Corporate Voting System (educational prototype)

SecureVote is a full-stack prototype of a **blockchain-based weighted voting platform** for corporate decisions (shareholder meetings, boards, homeowners' associations, NGOs). Organizers create voting sessions, register eligible fictional shareholders with voting weights, and shareholders cast **one weighted vote each**. A Solidity smart contract on a **local Hardhat network** enforces eligibility, the voting window and duplicate-vote prevention, and computes the results.

- Course: _Introduction to Finance_, Astana IT University, 2026–2027
- Everything is fictional: organizations, users, financial figures and voting scenarios.
- **Demo video:** `<ADD UNIVERSITY ONEDRIVE LINK HERE>`
- **Repository:** https://github.com/westnur/securevote1

> **Safety constraints.** Local Hardhat network (chain id 31337) only — the backend and frontend refuse other chains. No real cryptocurrency, tokens, funds, customers or personal data. Hardhat's test accounts are **public** keys; never use them on a real network. Not legally compliant, not audited, not suitable for real elections. AI-assisted implementation — see [`docs/AI_DISCLOSURE.md`](docs/AI_DISCLOSURE.md).

---

## Contents

1. [Architecture](#1-architecture) · 2. [Prerequisites](#2-prerequisites) · 3. [Quick start](#3-quick-start-one-command) · 4. [Step-by-step startup](#4-step-by-step-startup) · 5. [Environment variables](#5-environment-variables) · 6. [Smart contract](#6-smart-contract-compile-test-deploy) · 7. [Database](#7-database-migrations-and-seed-data) · 8. [Tests](#8-tests) · 9. [Demo roles and workflow](#9-demo-roles-and-workflow) · 10. [Commands](#10-command-reference) · 11. [Limitations](#11-limitations-and-security-assumptions) · 12. [Documentation](#12-documentation)

## 1. Architecture

```
Browser (React SPA) ──JSON + HttpOnly cookie──▶ Backend API (Express) ──▶ PostgreSQL (Prisma)
      │                                              │
      │ user signs transactions with own wallet      │ read-only: state, receipts, events
      ▼                                              ▼
              SecureVote.sol on Hardhat local chain (31337)
```

- **Smart contract** (`packages/contracts`) — authoritative for roles, lifecycle (`Created → Open → Closed`), voter registry, one-vote-per-voter, time window, weighted tallies and quorum.
- **Backend** (`apps/backend`) — demo authentication, organizations/roles, drafts and eligibility lists, verification of user-signed transactions, results/audit APIs, audit log, rate limiting, CSRF protection, validation. **It holds no private keys and never signs.**
- **Frontend** (`apps/frontend`) — dashboards, organizer workflow, ballot, results, auditor view; connects a browser wallet (MetaMask) or a local dev account.
- **Database** — users, organizations, memberships, drafts, eligibility, transaction references, audit events. **No vote totals** are stored off-chain.

Details: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · sequence diagram: [`docs/SEQUENCE_DIAGRAM.md`](docs/SEQUENCE_DIAGRAM.md).

## 2. Prerequisites

| Tool              | Version                         | Notes                                                     |
| ----------------- | ------------------------------- | --------------------------------------------------------- |
| Node.js           | **≥ 20.19** (tested with 22.22) | includes npm 10                                           |
| PostgreSQL        | 16                              | via Docker (`docker compose`) **or** a local installation |
| Docker (optional) | any recent                      | only for `npm run db:up`                                  |
| A browser         | Chrome/Chromium/Firefox         | MetaMask optional                                         |

No internet access is needed at runtime. Compilation uses the pinned `solc` npm package (no compiler download).

## 3. Quick start (one command)

```bash
git clone https://github.com/westnur/securevote1.git securevote && cd securevote
npm install
cp .env.example .env          # then edit the placeholder passwords
npm run db:up                 # PostgreSQL in Docker (skip if you run PostgreSQL locally)
npm run dev:fresh             # node + deploy + migrate + seed + API + web + demo elections
```

Open **http://localhost:5173**, choose a demo account and use the password you set as `SEED_DEMO_PASSWORD` in `.env`. Press `Ctrl+C` to stop everything.

`npm run dev` (without `:fresh`) reuses a running node and existing data when the contract is still deployed.

> If you use a **local PostgreSQL** instead of Docker, create the role and the two databases first, e.g. `CREATE ROLE securevote LOGIN PASSWORD '…' CREATEDB; CREATE DATABASE securevote OWNER securevote; CREATE DATABASE securevote_test OWNER securevote;`, and put the same password into `DATABASE_URL` and `TEST_DATABASE_URL`.

## 4. Step-by-step startup

Use this order if you want to see each component (each long-running command in its own terminal):

```bash
npm run db:up            # 1. PostgreSQL on 127.0.0.1:5432 (Docker)
npm run chain:node       # 2. Hardhat node on 127.0.0.1:8545 (prints PUBLIC test keys – do not record)
npm run chain:deploy     # 3. compile + deploy SecureVote, writes packages/contracts/deployments/localhost.json
npm run db:migrate       # 4. apply migrations
npm run db:seed          # 5. synthetic users, organizations and a draft election
npm run dev:backend      # 6. API on http://127.0.0.1:4000  (check: curl localhost:4000/api/health)
npm run dev:frontend     # 7. web app on http://localhost:5173
npm run demo:scenario    # 8. optional: two on-chain example elections (one closed, one active)
```

**Ports:** 5432 PostgreSQL · 8545 Hardhat node · 4000 API · 5173 web (dev) · 4173 web (preview build) · 8546 temporary node used by backend tests.

**Important:** the Hardhat node keeps its state only in memory. After restarting it, run `npm run chain:deploy` and re-seed (`npm run db:seed`), or simply `npm run dev:fresh`. Elections that refer to the old chain are shown as "Not on chain".

## 5. Environment variables

All variables live in one root `.env` (gitignored). [`.env.example`](.env.example) documents each one with placeholders.

| Variable                                                             | Used by           | Purpose                                                       |
| -------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------- |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT` | docker compose    | Local database container                                      |
| `DATABASE_URL`                                                       | backend, Prisma   | Development database                                          |
| `TEST_DATABASE_URL`                                                  | backend tests     | **Separate** database that tests wipe                         |
| `PORT`                                                               | backend           | API port (default 4000)                                       |
| `CORS_ORIGIN`                                                        | backend           | Allowed browser origins (CORS + CSRF origin check)            |
| `COOKIE_SECURE`                                                      | backend           | `true` behind HTTPS                                           |
| `SESSION_TTL_HOURS`                                                  | backend           | Login session lifetime                                        |
| `DEMO_MODE`                                                          | backend           | Enables the demo-account list on the login page               |
| `SEED_DEMO_PASSWORD`                                                 | seed, E2E         | Password given to all synthetic accounts                      |
| `CHAIN_ID`                                                           | backend           | Must be `31337` (enforced)                                    |
| `RPC_URL`, `PUBLIC_RPC_URL`                                          | backend / browser | Hardhat JSON-RPC endpoint                                     |
| `CONTRACT_ADDRESS`                                                   | backend           | Optional override of the deployment file                      |
| `VITE_API_BASE_URL`                                                  | frontend          | Empty = same origin via Vite proxy                            |
| `VITE_ENABLE_DEV_SIGNER`                                             | frontend          | Allows the "Hardhat dev account" connector (local demos only) |

The backend validates the environment at startup and prints the **names** of invalid variables (never their values).

## 6. Smart contract: compile, test, deploy

```bash
npm run chain:compile      # compile + export ABI to packages/contracts/abi/
npm run test:contracts     # Hardhat + Chai unit tests
npm run chain:deploy       # deploy to the running local node (refuses any chain ≠ 31337)
```

- Source: [`packages/contracts/contracts/SecureVote.sol`](packages/contracts/contracts/SecureVote.sol) (Solidity 0.8.28, OpenZeppelin `AccessControl`).
- Artifacts: `packages/contracts/artifacts/` (generated, gitignored); ABI for the apps: `packages/contracts/abi/SecureVote.json` (committed).
- Deployment record: `packages/contracts/deployments/localhost.json` (machine-specific, gitignored) — the backend reads the contract address from it and serves it to the frontend via `GET /api/config`.
- Roles after deploy: Hardhat account #0 = `DEFAULT_ADMIN_ROLE`; account #1 (demo organizer) = `ORGANIZER_ROLE`.
- Gas report: `REPORT_GAS=true npm run test:contracts`.

## 7. Database: migrations and seed data

```bash
npm run db:migrate        # prisma migrate deploy (apply committed migrations)
npm run db:migrate:dev    # create a new migration after changing schema.prisma
npm run db:seed           # replace demo data with the synthetic seed
npm run db:reset          # drop + re-create the dev database and seed (destructive, dev only)
```

Schema: [`apps/backend/prisma/schema.prisma`](apps/backend/prisma/schema.prisma) — `User`, `AuthSession`, `Organization`, `OrganizationMembership`, `Election`, `ElectionOption`, `VoterEligibility`, `AuditEvent`, `TransactionReference` (with primary/foreign keys, unique constraints, indexes, timestamps).

The seed ([`prisma/seed-data.ts`](apps/backend/prisma/seed-data.ts)) creates two fictional organizations, ten synthetic users on the reserved `.test` domain linked to Hardhat accounts #0–#9, and two draft elections. **Safety:** the seed refuses to run if the database contains any non-demo account.

## 8. Tests

| Suite                | Command                  | Needs                            | What it covers                                                                                                                                                            |
| -------------------- | ------------------------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Smart contract       | `npm run test:contracts` | nothing                          | 32 tests: roles, creation, registration, opening, voting, duplicates, time window, closing, weighted results, quorum                                                      |
| Backend              | `npm run test:backend`   | PostgreSQL + `TEST_DATABASE_URL` | 60 tests: unit, auth, CSRF, rate limiting, RBAC, validation, SQL-injection/XSS inputs, full API + chain workflow on an isolated Hardhat node (port 8546), role management |
| Frontend             | `npm run test:frontend`  | nothing                          | 33 tests: forms validation, ballot panel, tx status, results view, route guard, CSV injection, error decoding                                                             |
| Finance model        | `npm run test:finance`   | nothing                          | 6 tests: NPV, payback, no double counting, tax logic                                                                                                                      |
| End-to-end           | `npm run test:e2e`       | running stack (`npm run dev`)    | Browser test of the full workflow incl. duplicate-vote rejection and audit verification                                                                                   |
| All unit/integration | `npm test`               | PostgreSQL                       | contract + backend + frontend + finance                                                                                                                                   |

Quality checks: `npm run lint` (ESLint + solhint), `npm run typecheck`, `npm run format:check`, `npm run build`, `npm run security:secrets`, `npm run security:audit-deps`.

Observed results of the last full run are recorded in [`docs/TEST_RESULTS.md`](docs/TEST_RESULTS.md). Re-run the suites yourself; only present results you observed.

## 9. Demo roles and workflow

All accounts use the password from `SEED_DEMO_PASSWORD`. All e-mails end in `@demo.securevote.test`.

| Account                                    | Role(s)                                                       | Organization            | Test wallet                 |
| ------------------------------------------ | ------------------------------------------------------------- | ----------------------- | --------------------------- |
| `admin@` Aruzhan Admin                     | Administrator                                                 | both                    | Hardhat #0 (on-chain admin) |
| `organizer@` Daniyar Organizer             | Organizer                                                     | Altyn Demo Holdings JSC | #1 (has `ORGANIZER_ROLE`)   |
| `alikhan@`, `madina@`, `timur@`, `zarina@` | Shareholders (4000 / 3000 / 2000 / 1000 shares)               | Altyn                   | #2–#5                       |
| `saule@` Saule Shareholder                 | Shareholder (500) — can be promoted to organizer by the admin | Altyn                   | #7                          |
| `auditor@` Yerlan Auditor                  | Auditor                                                       | both                    | #6                          |
| `gulnara@`, `nurlan@`                      | HOA shareholder / HOA organizer (no on-chain role yet)        | Esil Demo Residence HOA | #8, #9                      |

**Main workflow** (≈ 3 minutes, see [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md)):

1. Organizer signs in → **Connect wallet → Use Hardhat dev account**.
2. _Organizer_ → open the draft _"Approval of the FY2026 dividend policy"_ (or create a new one) → check eligible shareholders and weights → **Save**.
3. **Sign and publish** → **Sign and register voters** → **Sign and open voting**.
4. Shareholders sign in, open the election, choose an option, **Review and sign vote**.
5. After voting, **Try to vote again** shows the contract's `AlreadyVoted` rejection.
6. Organizer **Sign and close** (allowed when everyone voted or after the end time).
7. **Results** show weighted totals, turnout, quorum and the outcome; the **Audit** page verifies totals against the public event log and exports JSON/CSV.

Using MetaMask instead of the dev account: add a network with RPC `http://127.0.0.1:8545` and chain id `31337`, import the **public** Hardhat test key of the linked account (shown by `npx hardhat node`), and choose "Use browser wallet". Never do this with a wallet that holds real funds.

## 10. Command reference

| Command                                                             | Description                                                                    |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `npm install`                                                       | Install all workspaces                                                         |
| `npm run dev` / `npm run dev:fresh`                                 | Start the full local stack (fresh = redeploy + re-seed)                        |
| `npm run dev:backend` / `npm run dev:frontend`                      | Start one service                                                              |
| `npm run build`                                                     | Compile contract, build backend (`dist/`) and frontend (`apps/frontend/dist/`) |
| `npm run start:backend` / `npm run preview:frontend`                | Run the built backend / preview the built frontend on :4173                    |
| `npm test` · `npm run test:e2e`                                     | Tests (see section 8)                                                          |
| `npm run lint` · `npm run typecheck` · `npm run format`             | Code quality                                                                   |
| `npm run db:up` · `db:down` · `db:migrate` · `db:seed` · `db:reset` | Database                                                                       |
| `npm run chain:node` · `chain:compile` · `chain:deploy`             | Blockchain                                                                     |
| `npm run demo:scenario`                                             | Create two on-chain example elections via the API                              |
| `npm run finance:model`                                             | Recalculate the financial model and regenerate its tables                      |
| `npm run security:secrets` · `security:audit-deps`                  | Secret scan · dependency audit                                                 |

### Troubleshooting

| Symptom                                                                                      | Cause / fix                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Elections show **"Not on chain"** or the health check says "No contract code"                | The Hardhat node was restarted (its state is in memory). Run `npm run dev:fresh`, or `npm run chain:deploy` + `npm run db:seed`.                                                     |
| API says **CHAIN_UNAVAILABLE**                                                               | Start the node: `npm run chain:node`.                                                                                                                                                |
| `Cannot connect to PostgreSQL` at backend start                                              | Start the database (`npm run db:up`) and check `DATABASE_URL`.                                                                                                                       |
| Backend tests fail with `TEST_DATABASE_URL must be set`                                      | Add `TEST_DATABASE_URL` (a second, disposable database) to `.env`.                                                                                                                   |
| Login returns **429**                                                                        | Too many failed attempts for that account; wait 15 minutes or restart the backend (in-memory limiter).                                                                               |
| "Connected wallet … does not match"                                                          | The wallet's account differs from the one linked to the signed-in demo user. Switch accounts in MetaMask or use the dev account.                                                     |
| Organizer buttons stay disabled                                                              | Connect a wallet first; the step's hint explains any other precondition (e.g. end time already passed).                                                                              |
| `npm install <new-package>` fails with `Cannot read properties of null (reading 'edgesOut')` | A known npm 10 bug with optional peer dependencies in workspaces. Add packages with `npx npm@11 install …`; plain `npm install`/`npm ci` of the existing lockfile works with npm 10. |

## 11. Limitations and security assumptions

- **Transparent ballot, not secret.** Every vote is a public event linking a wallet address to an option. Pseudonymous addresses are **not** anonymity. See [`docs/SECURITY.md`](docs/SECURITY.md#2-privacy-what-the-prototype-does-and-does-not-provide).
- **Trust in the organizer's registry.** The contract enforces one vote per registered wallet, but cannot know whether one person received two wallets (Sybil risk); registration is visible to auditors.
- **Local development chain.** A single Hardhat node with public test keys; the "dev account" connector lets anyone with RPC access send from unlocked accounts. Real deployments need user-held keys and a different network design.
- **Not audited.** Automated tests only; no professional audit, fuzzing or formal verification.
- **No legal validity.** Corporate voting in Kazakhstan has procedural requirements (see [`docs/LEGAL_KAZAKHSTAN.md`](docs/LEGAL_KAZAKHSTAN.md)); a blockchain record does not replace them.
- **Prototype operations.** In-memory rate limiting, no high availability, demo authentication without MFA, single shared demo password.
- Dependency audit findings (mostly in the Hardhat development toolchain and the Prisma CLI) are listed in [`docs/TEST_RESULTS.md`](docs/TEST_RESULTS.md).

## 12. Documentation

| Document                                               | Content                                                                                    |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)         | Components, data flow, on-chain/off-chain split, consistency, versions, ports              |
| [`docs/SECURITY.md`](docs/SECURITY.md)                 | Threat model, attack scenarios, mitigations, residual risks, key policy                    |
| [`docs/API.md`](docs/API.md)                           | REST endpoints with real request/response examples                                         |
| [`docs/SEQUENCE_DIAGRAM.md`](docs/SEQUENCE_DIAGRAM.md) | Mermaid sequence diagram of the voting workflow                                            |
| [`docs/FINANCIAL_MODEL.md`](docs/FINANCIAL_MODEL.md)   | Hypothetical assumptions, 3-year projections, NPV, payback, break-even, scenarios, funding |
| [`docs/RISK_REGISTER.md`](docs/RISK_REGISTER.md)       | Market, technology, cybersecurity, operational, financial, regulatory risks                |
| [`docs/LEGAL_KAZAKHSTAN.md`](docs/LEGAL_KAZAKHSTAN.md) | Legal questions with official sources (general information, not legal advice)              |
| [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md)           | 3-minute demo video script                                                                 |
| [`docs/TEST_RESULTS.md`](docs/TEST_RESULTS.md)         | Observed test/build/lint results and how to reproduce them                                 |
| [`docs/AI_DISCLOSURE.md`](docs/AI_DISCLOSURE.md)       | AI tools used, review checklist, open-source attribution                                   |

Licence: MIT for the project's own code (see [`LICENSE`](LICENSE)); dependencies under their own licences.
