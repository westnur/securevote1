# Observed Test, Build and Quality Results

> Educational prototype. These are the results **actually observed** during the final verification run on **21 October 2026** in a Linux cloud container (Node.js 22.22.0, npm 10.9.4, PostgreSQL 16 local cluster, Chromium for Playwright). Re-run the commands yourself before presenting results; numbers may change as the code changes.

## 1. Summary

| Check                                                         | Command                                                                                       | Result                                                        |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Smart-contract tests                                          | `npm run test:contracts`                                                                      | ✅ **32 passing** (≈ 2 s)                                     |
| Backend tests (unit, API, integration with live Hardhat node) | `npm run test:backend`                                                                        | ✅ **60 passed** in 6 files                                   |
| Frontend component/unit tests                                 | `npm run test:frontend`                                                                       | ✅ **33 passed** in 9 files                                   |
| Financial model tests                                         | `npm run test:finance`                                                                        | ✅ **6 passed**, 0 failed                                     |
| End-to-end browser test (full workflow)                       | `npm run test:e2e` (stack running)                                                            | ✅ **1 passed** (≈ 25 s)                                      |
| All of the above except E2E                                   | `npm test`                                                                                    | ✅ exit code 0                                                |
| ESLint + solhint                                              | `npm run lint`                                                                                | ✅ exit code 0, no findings                                   |
| TypeScript (3 workspaces)                                     | `npm run typecheck`                                                                           | ✅ exit code 0                                                |
| Prettier                                                      | `npm run format:check`                                                                        | ✅ exit code 0                                                |
| Production build                                              | `npm run build`                                                                               | ✅ contract compiled, backend `dist/`, frontend `dist/`       |
| Built backend start                                           | `node apps/backend/dist/server.js`                                                            | ✅ `/api/health` → `status: ok`                               |
| Built frontend preview                                        | `npm run preview:frontend`                                                                    | ✅ served on :4173 with CSP meta tag; `/api` proxy works      |
| Frontend bundle secret check                                  | grep of `dist/assets` for DB password, demo password, Hardhat key #0, `DATABASE_URL`          | ✅ none found                                                 |
| Secret scan                                                   | `npm run security:secrets`                                                                    | ✅ "Secret scan passed (142 files checked)"                   |
| One-command stack                                             | `npm run dev:fresh`                                                                           | ✅ node → deploy → migrate → seed → API → web → demo scenario |
| Fresh clone reproducibility                                   | `git clone` → `npm ci` (npm 10.9.4) → contract/frontend/finance tests, build, typecheck, lint | ✅ all exit 0                                                 |

## 2. Smart-contract test list (observed)

```
SecureVote
  deployment and roles
    ✔ grants DEFAULT_ADMIN_ROLE to the constructor admin only
    ✔ rejects a zero-address admin
    ✔ lets only the admin grant and revoke ORGANIZER_ROLE
  session creation
    ✔ creates a session with a unique id and emits SessionCreated
    ✔ rejects session creation by an account without ORGANIZER_ROLE
    ✔ rejects fewer than two or more than ten options and empty labels
    ✔ rejects invalid schedules, empty titles and quorum above 100%
  voter registration
    ✔ registers voters with weights and emits VoterRegistered
    ✔ rejects registration by anyone other than the session's organizer
    ✔ rejects registration by an organizer whose role was revoked
    ✔ rejects zero voting weight, zero address, duplicates and malformed batches
    ✔ rejects registration batches larger than MAX_REGISTRATION_BATCH
    ✔ prevents registration after the session is opened
    ✔ rejects operations on a non-existent session
  opening
    ✔ opens a session with registered voters and freezes configuration
    ✔ refuses to open a session without voters, by a non-organizer, or after its end time
  voting
    ✔ accepts a vote from an eligible voter and emits VoteCast with the voter's weight
    ✔ rejects a duplicate vote from the same voter, even for a different option
    ✔ rejects a vote from an ineligible voter
    ✔ keeps eligibility per session (registered in one session is not eligible in another)
    ✔ rejects an invalid option index
    ✔ rejects a vote before the session is opened
    ✔ rejects a vote in an opened session before its start time
    ✔ rejects a vote after the voting window has expired
    ✔ rejects a vote after the session is closed
  closing and results
    ✔ calculates weighted results from accepted votes only
    ✔ reports quorum not reached when participating weight is below the threshold
    ✔ does not expose results before closure
    ✔ prevents closing early while registered voters have not yet voted
    ✔ rejects unauthorized attempts to close a session
    ✔ allows the admin to close after the end time (liveness) and forbids re-closing
    ✔ cannot close a session that was never opened

32 passing
```

Mapping to the required test list: successful session creation ✔ · unauthorized session creation ✔ · successful voter registration ✔ · unauthorized registration ✔ · successful vote ✔ · duplicate vote ✔ · ineligible voter ✔ · vote before opening ✔ · vote after closure/expiration ✔ · weighted result calculation ✔ · zero weight ✔ · invalid configuration ✔ · registration after opening ✔ · unauthorized close/modify ✔.

## 3. Backend test files

| File                                |  Tests | Focus                                                                                                                                                                                                                                                        |
| ----------------------------------- | -----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `test/unit/verification.test.ts`    |      7 | status derivation, event recount, outcome rules, config comparison, bigint percentages                                                                                                                                                                       |
| `test/unit/env.test.ts`             |      4 | env validation, chain-id 31337 enforcement, no secret values in errors                                                                                                                                                                                       |
| `test/api/auth.test.ts`             |     13 | login/logout/me, cookie flags, generic errors, CSRF header/origin, CORS, security headers, malformed/oversized bodies, rate limiting, health                                                                                                                 |
| `test/api/authorization.test.ts`    |     14 | RBAC per role, organization isolation, owner-only edits, admin-only endpoints, separation of duties, input validation, SQL-injection and XSS-like input, tx hash validation                                                                                  |
| `test/integration/workflow.test.ts` |     20 | full workflow API + contract: draft → voters → publish (incl. config mismatch) → register → open → votes → duplicate rejected → stolen tx hash rejected → close → weighted results → audit verification → ballot choice absent from app log → expired window |
| `test/integration/roles.test.ts`    |      2 | grant/revoke organizer role verified via on-chain events; wrong event and wrong sender rejected                                                                                                                                                              |
| **Total**                           | **60** |                                                                                                                                                                                                                                                              |

## 4. End-to-end test (Playwright, Chromium)

`e2e/voting-workflow.spec.ts` — organizer creates a draft through the UI, selects 3 shareholders, publishes, registers and opens (each signed with the dev account); an ineligible shareholder cannot see the election; three shareholders vote; a forced second vote shows "Duplicate vote rejected"; the organizer closes; results show Approve 5,000 (55.55 %) vs Reject 4,000 and "Decision adopted"; the auditor page shows "Totals verified" with 3 `VoteCast` events.

```
✓  1 [chromium] › e2e/voting-workflow.spec.ts › full voting workflow with weighted results and duplicate-vote rejection (24.6s)
1 passed
```

## 5. Dependency audit (observed, not fixed)

- `npm audit --omit=dev`: **3 high** — all from `deepmerge-ts < 8` used by the **Prisma CLI's config loader** (`prisma` / `@prisma/config` 6.19.3; advisory GHSA-ggr8-5vv4-36mx, stack exhaustion when merging recursive object graphs). The suggested fix is a breaking upgrade to Prisma 7, which was not applied. Exposure is limited to the CLI processing the project's own configuration.
- Full `npm audit` (including dev tools): 49 findings (14 low, 9 moderate, 26 high, 0 critical), almost all in the **Hardhat 2 toolchain** (`hardhat`, `@nomicfoundation/*`, `solc`, `mocha`, legacy `@ethersproject/*`, `elliptic`, `undici`, …). These packages run only on developer machines against a local chain. Upgrading to Hardhat 3 is the long-term fix.

## 6. Issues found and fixed during verification

| Found by                 | Problem                                                                                                                   | Fix                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Backend integration test | ethers v6 de-duplicates identical RPC requests for 250 ms, so a retried `closeSession` reused a stale failed gas estimate | `cacheTimeout: -1` on all providers (backend, frontend, scripts)                                                              |
| Backend test             | Zod 4 runs object refinements even when a field failed → 500 on invalid dates                                             | guard in `checkSchedule`                                                                                                      |
| Integration test         | idempotent re-submission of a vote hash wrote a second audit entry                                                        | idempotency check before side effects                                                                                         |
| Demo script              | login rate limiter (10/15 min) blocked legitimate repeated logins                                                         | count only failed attempts, per IP+account and per IP                                                                         |
| Browser check            | after login, the route guard still saw the old (null) user                                                                | update the `me` query in place instead of `queryClient.clear()`                                                               |
| E2E                      | logout redirect remembered the previous user's page; aborted logout request kept the session alive                        | await logout, explicit `signedOut` state                                                                                      |
| E2E                      | wallet auto-reconnect deleted its own saved preference                                                                    | separate `resetState` from user `disconnect`                                                                                  |
| Orchestrator             | Prisma blocks `migrate reset` when run by an AI agent                                                                     | dev script uses `migrate deploy` + idempotent seed that refuses to touch non-demo data; `npm run db:reset` remains for humans |

## 7. What could not be verified in this environment

| Item                                       | Reason                                                                                                                                                                                    | How to verify                                                                   |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `docker compose up` (PostgreSQL container) | Docker Hub returned **429 Too Many Requests** when pulling `postgres:16-alpine`. `docker compose config` validated the file successfully. A local PostgreSQL 16 cluster was used instead. | `npm run db:up` on your machine, then `docker compose ps` should show `healthy` |
| MetaMask / browser-wallet connector        | No wallet extension in the headless test browser. The dev-account connector (same signing path through ethers) was tested end to end.                                                     | Follow README §9 "Using MetaMask"                                               |
| Native solc download                       | `binaries.soliditylang.org` is blocked in this environment; the project intentionally uses the official `solc` npm package instead.                                                       | not required                                                                    |
| Slither / fuzzing / formal verification    | Not set up (see SECURITY.md §7)                                                                                                                                                           | optional future work                                                            |
| Backend tests in the fresh clone           | Require a `.env` with a test database; they were run in the main working copy (60 passed).                                                                                                | `npm run test:backend` with your `.env`                                         |
