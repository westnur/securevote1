# SecureVote — REST API

> Educational prototype. Base URL in development: `http://localhost:5173/api` (Vite proxy) or `http://127.0.0.1:4000/api`. All data is synthetic. The examples below were captured from the running local stack (ids shortened where marked).

## 1. Conventions

| Topic          | Rule                                                                                                                                                                                |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Format         | JSON request and response bodies; max request body 50 kB                                                                                                                            |
| Authentication | `POST /api/auth/login` sets the `sv_session` cookie (`HttpOnly`, `SameSite=Strict`, `Secure` when `COOKIE_SECURE=true`). Browsers send it automatically (`credentials: "include"`). |
| CSRF           | Every `POST/PUT/PATCH/DELETE` must include the header `X-SecureVote-CSRF: 1`. If an `Origin` header is present it must be in `CORS_ORIGIN`.                                         |
| Authorization  | Derived on the server from the session's organization memberships. Hidden or foreign resources return **404**; visible but forbidden actions return **403**.                        |
| Validation     | Zod schemas; failures return 400 `VALIDATION_ERROR` with `details[] = {path, message}`                                                                                              |
| Rate limits    | Global 1500 req/15 min/IP; 60 writes/min/IP; failed logins 10/15 min per IP+account and 100/15 min per IP                                                                           |
| Big numbers    | Weights and totals are decimal **strings** (uint256 on-chain)                                                                                                                       |
| Errors         | `{"error": {"code", "message", "details?", "requestId"}}` — never stack traces                                                                                                      |

### User-signed transactions

The API **never signs** blockchain transactions. Endpoints marked ✍️ expect the hash of a transaction that the logged-in user already signed with **their own linked test wallet**. The backend then fetches the receipt from the node and checks:

1. the transaction exists (`TX_NOT_FOUND`), targets the SecureVote contract (`TX_WRONG_CONTRACT`);
2. its sender is the user's linked wallet (`TX_SENDER_MISMATCH`, 403);
3. the receipt status (`PENDING` → HTTP 202, reverted → 422 `TX_REVERTED`);
4. the expected event for this election is present and consistent (`EVENT_MISSING`, `CONFIG_MISMATCH`).

Re-sending a hash you already recorded is idempotent (`alreadyRecorded: true`); a hash recorded by another user/action → 409 `TX_ALREADY_RECORDED`.

Success response of ✍️ endpoints: `200 {"status":"CONFIRMED","txHash","blockNumber", …endpoint-specific fields}`.

## 2. System

### `GET /api/health` — public

```json
{
  "status": "ok",
  "database": "ok",
  "blockchain": { "reachable": true, "chainId": 31337, "blockNumber": 45, "contractDeployed": true, "message": null },
  "time": "2026-10-21T20:43:52.894Z"
}
```

`status` is `degraded` (HTTP 200) when the chain is unreachable or the contract is missing, and HTTP 503 when the database is down.

### `GET /api/config` — public, non-secret frontend configuration

```json
{
  "chainId": 31337,
  "rpcUrl": "http://127.0.0.1:8545",
  "contractAddress": "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  "demoMode": true
}
```

## 3. Authentication

| Method & path                 | Auth   | Description                                                                                                                                   |
| ----------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/auth/login`        | —      | `{email, password}` → sets cookie. 401 `INVALID_CREDENTIALS` (same message for unknown user and wrong password). 429 after repeated failures. |
| `POST /api/auth/logout`       | cookie | Deletes the server-side session, clears cookie. 204.                                                                                          |
| `GET /api/auth/me`            | cookie | Current user and memberships. 401 if not signed in.                                                                                           |
| `GET /api/auth/demo-accounts` | —      | Only when `DEMO_MODE=true`: synthetic demo e-mails and roles (never passwords).                                                               |

```http
POST /api/auth/login
Content-Type: application/json
X-SecureVote-CSRF: 1

{"email":"zarina@demo.securevote.test","password":"<SEED_DEMO_PASSWORD>"}
```

```json
{ "user": { "id": "cmvik3b2m…", "email": "zarina@demo.securevote.test", "displayName": "Zarina Shareholder" } }
```

`GET /api/auth/me`:

```json
{
  "user": {
    "id": "cmvik3b2m…",
    "email": "zarina@demo.securevote.test",
    "displayName": "Zarina Shareholder",
    "walletAddress": "0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc"
  },
  "memberships": [
    {
      "organizationId": "cmvik3ayp…",
      "organizationName": "Altyn Demo Holdings JSC",
      "roles": ["SHAREHOLDER"],
      "shareCount": 1000
    }
  ]
}
```

## 4. Elections

| Method & path                                    | Who                             | Description                                                                                                                                                                                |
| ------------------------------------------------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/elections?q=&status=`                  | signed in                       | Elections visible to the user (admin: all in org; organizer: published + own drafts; auditor: published; shareholder: published where eligible). Status is derived live from the contract. |
| `GET /api/elections/:id`                         | can view                        | Detail incl. `chain` state and `permissions`                                                                                                                                               |
| `POST /api/elections`                            | ORGANIZER of `organizationId`   | Create draft                                                                                                                                                                               |
| `PATCH /api/elections/:id`                       | owner organizer, DRAFT          | Replace draft fields                                                                                                                                                                       |
| `DELETE /api/elections/:id`                      | owner organizer, DRAFT          | Delete draft (204)                                                                                                                                                                         |
| `GET /api/elections/:id/voters`                  | owner organizer, admin, auditor | Eligibility list with on-chain registration (+ `candidates` for drafts)                                                                                                                    |
| `PUT /api/elections/:id/voters`                  | owner organizer, DRAFT          | Replace eligibility list `{voters:[{userId, weight}]}` (≤ 100, weight 1..10⁹, org shareholders with wallets only)                                                                          |
| ✍️ `POST /api/elections/:id/publish`             | owner organizer                 | `{txHash}` of `createSession(...)`; on-chain config must equal the draft → `{sessionId}`                                                                                                   |
| ✍️ `POST /api/elections/:id/voters/registration` | owner organizer                 | `{txHash}` of `registerVoters(...)` → `{registered, mismatches[]}`                                                                                                                         |
| ✍️ `POST /api/elections/:id/open`                | owner organizer                 | `{txHash}` of `openSession(id)` → `{voterCount, totalEligibleWeight}`                                                                                                                      |
| ✍️ `POST /api/elections/:id/close`               | owner organizer or org admin    | `{txHash}` of `closeSession(id)` → `{votesCast, totalVotedWeight}`                                                                                                                         |
| `GET /api/elections/:id/eligibility`             | can view                        | Current user's eligibility, on-chain voter record, vote tx, `canVote` + `reason`                                                                                                           |
| ✍️ `POST /api/elections/:id/votes`               | eligible shareholder            | `{txHash}` of the user's own `castVote(id, option)` → `{weight}`                                                                                                                           |
| `GET /api/elections/:id/results`                 | can view                        | Final results (409 `RESULTS_NOT_AVAILABLE` until closed on-chain)                                                                                                                          |
| `GET /api/elections/:id/audit`                   | admin, auditor, organizer       | Chain events, app audit log, tx references, verification                                                                                                                                   |

### Create a draft

```http
POST /api/elections
X-SecureVote-CSRF: 1
Content-Type: application/json

{"organizationId":"cmvik3ayp…","title":"Approval of the FY2026 dividend policy","description":"…",
 "options":["Approve","Reject","Abstain"],"startTime":"2026-10-21T20:00:00Z","endTime":"2026-10-24T20:00:00Z","quorumBps":5000}
```

→ `201 {"election": {…, "status":"DRAFT", "chain": null}}`

Validation rules (mirroring the contract): title 3–160 bytes, 2–10 unique options of ≤ 80 bytes, end after start and ≥ 1 minute in the future, duration ≤ 366 days, `quorumBps` 0..10000, no control characters.

Validation error example:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      { "path": "organizationId", "message": "Invalid input: expected string, received undefined" },
      { "path": "title", "message": "Invalid input: expected string, received undefined" }
    ],
    "requestId": "…"
  }
}
```

### Election detail (shareholder view, abbreviated)

```json
{
  "election": {
    "id": "cmvik3g3q…",
    "organization": { "id": "cmvik3ayp…", "name": "Altyn Demo Holdings JSC" },
    "title": "Approval of the 2027 capital expenditure plan",
    "options": [
      { "index": 0, "label": "Approve" },
      { "index": 1, "label": "Reject" },
      { "index": 2, "label": "Abstain" }
    ],
    "startTime": "2026-10-21T20:20:06.000Z",
    "endTime": "2026-10-24T20:20:06.000Z",
    "quorumBps": 6000,
    "status": "ACTIVE",
    "dbStatus": "PUBLISHED",
    "myWeight": 1000,
    "chain": {
      "sessionId": "2",
      "contractAddress": "0x5fbdb2315678afecb367f032d93f642f64180aa3",
      "chainId": 31337,
      "error": null,
      "state": "Open",
      "organizer": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      "voterCount": 5,
      "votesCast": 2,
      "totalEligibleWeight": "10500",
      "totalVotedWeight": "3000",
      "configMatchesDatabase": true
    },
    "permissions": { "canEditDraft": false, "canManage": false, "canClose": false, "canViewVoters": false, "canViewAudit": false }
  }
}
```

`status` ∈ `DRAFT | REGISTRATION | SCHEDULED | ACTIVE | ENDED | CLOSED | CHAIN_UNAVAILABLE | CHAIN_MISSING`.

### Eligibility

```json
{
  "electionId": "cmvik3g3q…",
  "status": "ACTIVE",
  "eligible": true,
  "weight": 1000,
  "walletAddress": "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc",
  "onChain": { "registered": true, "weight": "1000", "hasVoted": true },
  "voteTransaction": {
    "txHash": "0xe2a28aa9…62ee38e",
    "status": "CONFIRMED",
    "blockNumber": 16,
    "createdAt": "2026-10-21T20:20:07.699Z"
  },
  "canVote": false,
  "reason": "ALREADY_VOTED"
}
```

`reason` ∈ `NOT_ELIGIBLE, NO_WALLET, CHAIN_UNAVAILABLE, CHAIN_MISSING, NOT_OPEN, NOT_STARTED, ENDED, CLOSED, NOT_REGISTERED_ON_CHAIN, ALREADY_VOTED` (same order as the contract's checks).

### Record a vote ✍️

```http
POST /api/elections/cmvik3g3q…/votes
X-SecureVote-CSRF: 1

{"txHash":"0xe2a28aa9fa3910e2716a3a5f606a2692fec475c262c421350f4cfda7b62ee38e"}
```

```json
{ "status": "CONFIRMED", "txHash": "0xe2a28aa9…", "blockNumber": 16, "weight": "1000" }
```

Pending → `202 {"status":"PENDING", …}`; someone else's hash → `403 TX_SENDER_MISMATCH`; reverted → `422 TX_REVERTED`. The chosen option is **not** written to the application audit log.

### Results

```json
{
  "electionId": "cmvik3eoh…",
  "sessionId": "1",
  "contractAddress": "0x5fbdb2315678afecb367f032d93f642f64180aa3",
  "options": [
    { "index": 0, "label": "Audit firm A (fictional)", "weight": "6000", "votes": "3", "weightPercent": 57.14 },
    { "index": 1, "label": "Audit firm B (fictional)", "weight": "4500", "votes": "2", "weightPercent": 42.85 }
  ],
  "totalVotedWeight": "10500",
  "totalEligibleWeight": "10500",
  "turnoutPercent": 100,
  "votesCast": 5,
  "voterCount": 5,
  "quorumBps": 5000,
  "quorumReached": true,
  "outcome": {
    "decided": true,
    "leaders": [0],
    "tie": false,
    "summary": "\"Audit firm A (fictional)\" received the largest voting weight."
  },
  "verification": {
    "method": "Independent recount of public VoteCast/VoterRegistered events compared with contract storage",
    "matchesContract": true,
    "voteEvents": 5,
    "registeredVoters": 5
  },
  "closedBy": { "txHash": "0x576350a1…e78350d", "blockNumber": 11 }
}
```

Before closure:

```json
{
  "error": {
    "code": "RESULTS_NOT_AVAILABLE",
    "message": "Results are published only after the election is closed on-chain",
    "requestId": "…"
  }
}
```

### Audit report (abbreviated)

```json
{"election":{…},"onChainConfig":{"id":"1","title":"…","optionLabels":["…"],"state":"Closed","voterCount":5,"votesCast":5,…},
 "chainEvents":[{"name":"SessionCreated","blockNumber":3,"transactionHash":"0x9731…","logIndex":0,"timestamp":1792614004,"args":{"sessionId":"1","organizer":"0x7099…",…}}, …],
 "appEvents":[{"action":"ELECTION_DRAFT_CREATED","actor":"Daniyar Organizer","createdAt":"…"}, …],
 "transactions":[{"txHash":"0x9731…","kind":"CREATE_SESSION","status":"CONFIRMED","blockNumber":3,"from":"0x7099…","user":"Daniyar Organizer"}, …],
 "verification":{"configMatchesDatabase":{"title":true,"options":true,"startTime":true,"endTime":true,"quorumBps":true,"allMatch":true},
                 "totals":{"matches":true,"contract":{…},"recount":{…}},"generatedAt":"…"}}
```

## 5. Organizations, audit and administration

| Method & path                                                      | Who       | Description                                                                                                                               |
| ------------------------------------------------------------------ | --------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/organizations/:orgId`                                    | member    | Organization info, your roles; member directory for staff (e-mails only for admins), incl. `onChainOrganizer` flag read from the contract |
| ✍️ `POST /api/organizations/:orgId/members/:userId/organizer-role` | org ADMIN | `{action:"grant"                                                                                                                          | "revoke", txHash}`of the admin's own`grantRole/revokeRole(ORGANIZER_ROLE, memberWallet)`; verified via `RoleGranted/RoleRevoked`. Auditors cannot be granted (409 `SEPARATION_OF_DUTIES`). |
| `GET /api/audit/recent?limit=`                                     | signed in | Recent app audit events (organization-wide for staff, own events for shareholders)                                                        |
| `GET /api/admin/system`                                            | ADMIN     | DB counts, pending/failed tx counts, chain status, whether the admin's wallet holds `DEFAULT_ADMIN_ROLE`                                  |

## 6. Error codes

| HTTP | Code                                                                                                                                       | Meaning                                                                  |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| 400  | `VALIDATION_ERROR`, `INVALID_JSON`, `INVALID_VOTERS`, `NO_WALLET`, `TX_NOT_FOUND`, `TX_WRONG_CONTRACT`, `EVENT_MISSING`, `CONFIG_MISMATCH` | Bad input or transaction does not prove the requested action             |
| 401  | `UNAUTHENTICATED`, `INVALID_CREDENTIALS`                                                                                                   | Not signed in / wrong credentials                                        |
| 403  | `FORBIDDEN`, `CSRF_HEADER_MISSING`, `CSRF_ORIGIN_REJECTED`, `TX_SENDER_MISMATCH`                                                           | Not allowed                                                              |
| 404  | `NOT_FOUND`                                                                                                                                | Unknown or not visible to you                                            |
| 409  | `NOT_DRAFT`, `ALREADY_PUBLISHED`, `NOT_PUBLISHED`, `RESULTS_NOT_AVAILABLE`, `TX_ALREADY_RECORDED`, `SEPARATION_OF_DUTIES`, `CONFLICT`      | Invalid state                                                            |
| 413  | `PAYLOAD_TOO_LARGE`                                                                                                                        | Body > 50 kB                                                             |
| 422  | `TX_REVERTED`                                                                                                                              | The contract reverted the transaction                                    |
| 429  | `RATE_LIMITED`                                                                                                                             | Too many requests                                                        |
| 503  | `CHAIN_UNAVAILABLE`, `CONTRACT_NOT_DEPLOYED`, `CHAIN_SESSION_MISSING`                                                                      | Local blockchain not ready                                               |
| 500  | `INTERNAL_ERROR`                                                                                                                           | Unexpected error (details only in server log, correlated by `requestId`) |

## 7. Smart-contract interface (called by the frontend)

| Function                                                                                 | Caller                      | Reverts with                                                                                                                                   |
| ---------------------------------------------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `createSession(title, optionLabels[], startTime, endTime, quorumBps) → id`               | `ORGANIZER_ROLE`            | `AccessControlUnauthorizedAccount`, `InvalidTitle`, `InvalidOptionCount`, `InvalidOptionLabel`, `InvalidSchedule`, `InvalidQuorum`             |
| `registerVoters(id, voters[], weights[])`                                                | session organizer with role | `NotSessionOrganizer`, `InvalidState`, `EmptyBatch`, `BatchTooLarge`, `LengthMismatch`, `InvalidVoter`, `ZeroWeight`, `VoterAlreadyRegistered` |
| `openSession(id)`                                                                        | session organizer with role | `NotSessionOrganizer`, `InvalidState`, `NoEligibleVoters`, `VotingEnded`                                                                       |
| `castVote(id, optionIndex)`                                                              | registered voter            | `InvalidState`, `VotingNotStarted`, `VotingEnded`, `NotEligible`, `AlreadyVoted`, `InvalidOption`                                              |
| `closeSession(id)`                                                                       | session organizer or admin  | `NotSessionOrganizer`, `InvalidState`, `CloseNotAllowedYet`                                                                                    |
| `getSession(id)`, `getVoter(id, addr)`, `getResults(id)` (Closed only), `sessionCount()` | anyone                      | `SessionNotFound`, `InvalidState`                                                                                                              |
| `grantRole/revokeRole(ORGANIZER_ROLE, account)`                                          | `DEFAULT_ADMIN_ROLE`        | `AccessControlUnauthorizedAccount`                                                                                                             |

Events: `SessionCreated`, `VoterRegistered`, `SessionOpened`, `VoteCast`, `SessionClosed`, `RoleGranted`, `RoleRevoked`.
