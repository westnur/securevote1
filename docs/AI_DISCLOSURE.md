# AI-Assistance and Open-Source Disclosure

> Educational project for the course Introduction to Finance (Astana IT University, 2026–2027). Not a real product, service or investment offer.

## 1. AI tools used

| Tool                                                                                                                             | Provider  | How it was used                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Claude** (large language model) used as a coding agent through **Claude Code on the web** (cloud session with terminal access) | Anthropic | Generated the initial implementation of the repository (smart contract, tests, backend, database schema, frontend, scripts) and the first drafts of all documents in `docs/`; ran the commands (compile, migrations, tests, builds, browser screenshots, Playwright E2E) and fixed the failures it observed; performed web searches to locate official legal sources (adilet.zan.kz) and secondary summaries of the 2026 Tax Code. |

Exact model name/version shown in the Claude Code session: **`<fill in from your session information>`**

> Students: if you used any additional AI tools (e.g. for slides, translation or the video), list them here as well.

## 2. What the AI produced

- `packages/contracts/` — `SecureVote.sol`, 32 Hardhat/Chai tests, deploy and ABI export scripts.
- `apps/backend/` — Express API, Prisma schema, migration, synthetic seed, demo scenario, unit/API/integration tests.
- `apps/frontend/` — React application, component tests, Playwright end-to-end test.
- `scripts/` — development orchestrator, E2E runner, secret scanner.
- `docs/` — architecture, security/threat model, API reference, sequence diagram, hypothetical financial model (assumptions, formulas and generated tables), risk register, Kazakhstan legal questions, demo script, this disclosure.
- All **financial numbers are hypothetical assumptions** proposed by the AI for illustration. They are not market research and must be reviewed, changed and justified by the students.

## 3. What the students must review and verify (checklist)

The AI's work is a starting point. Before the defense, the team should be able to explain every item and tick it off:

- [ ] Read `SecureVote.sol` line by line; explain every modifier/check and every custom error.
- [ ] Run `npm test` yourself and compare with [`TEST_RESULTS.md`](TEST_RESULTS.md); never present results you did not observe.
- [ ] Run the full demo (`npm run dev:fresh`) and the workflow in [`DEMO_SCRIPT.md`](DEMO_SCRIPT.md).
- [ ] Review the threat model in [`SECURITY.md`](SECURITY.md); agree with or change likelihood/impact ratings.
- [ ] Replace or justify every assumption in [`docs/finance/assumptions.json`](finance/assumptions.json), re-run `npm run finance:model`, and check the formulas in `model.mjs`.
- [ ] Open each legal source in [`LEGAL_KAZAKHSTAN.md`](LEGAL_KAZAKHSTAN.md) on adilet.zan.kz and confirm it is current; do not present the questions as legal conclusions.
- [ ] Verify the corporate income tax rate (20 %) in the official Tax Code text.
- [ ] Fill in the repository link, the OneDrive video link and the exact AI model name.
- [ ] Record who in the team reviewed which part: _______________________

**Known limitations of AI-generated content:** it can contain subtle logic errors, outdated library usage, or confident-sounding but unverified statements. Automated tests reduce but do not remove this risk. No professional security audit or legal review has been performed.

## 4. Open-source dependencies and attribution

The project uses the following open-source packages (versions as installed; full list in `package-lock.json`). All are used under their respective licences; no code was copied from them into this repository except through normal package installation and imports (OpenZeppelin `AccessControl` is imported, not modified).

| Package                                                      | Version                                     | Licence            | Purpose                                |
| ------------------------------------------------------------ | ------------------------------------------- | ------------------ | -------------------------------------- |
| Hardhat / @nomicfoundation/hardhat-toolbox                   | 2.29.1 / 6.1.2                              | MIT                | Local blockchain, compilation, testing |
| solc (solc-js)                                               | 0.8.28                                      | MIT                | Solidity compiler                      |
| @openzeppelin/contracts                                      | 5.6.1                                       | MIT                | `AccessControl` role management        |
| ethers                                                       | 6.17.0                                      | MIT                | Blockchain client library              |
| express / helmet / express-rate-limit / cookie-parser / cors | 5.3.0 / 8.3.0 / 8.7.1 / 1.4.7 / 2.8.6       | MIT                | HTTP API and security middleware       |
| zod                                                          | 4.6.7                                       | MIT                | Validation                             |
| prisma / @prisma/client                                      | 6.19.3                                      | Apache-2.0         | ORM and migrations                     |
| bcryptjs                                                     | 3.0.3                                       | BSD-3-Clause       | Password hashing                       |
| react / react-dom / react-router                             | 19.3.1 / 19.3.1 / 7.18.4                    | MIT                | User interface                         |
| @tanstack/react-query                                        | 5.104.5                                     | MIT                | Data fetching                          |
| react-hook-form / @hookform/resolvers                        | 7.90.0 / 5.9.2                              | MIT                | Forms                                  |
| recharts                                                     | 3.10.1                                      | MIT                | Charts                                 |
| tailwindcss / vite / @vitejs/plugin-react                    | 4.3.3 / 8.3.5 / 6.1.2                       | MIT                | Styling and build                      |
| vitest / @testing-library/react / supertest                  | 4.1.12 / 16.3.3 / 7.3.1                     | MIT                | Tests                                  |
| @playwright/test                                             | 1.56.1                                      | Apache-2.0         | End-to-end tests                       |
| typescript                                                   | 5.9.3                                       | Apache-2.0         | Language                               |
| eslint / prettier / solhint / tsx / dotenv-cli               | 10.13.0 / 3.9.10 / 6.2.5 / 4.23.15 / 11.0.0 | MIT                | Tooling                                |
| PostgreSQL                                                   | 16                                          | PostgreSQL Licence | Database (external service)            |

Fonts: system font stack (no web fonts are downloaded). Icons: a single custom SVG favicon created for this project.
