import { Router, type Response } from "express";
import { getAddress } from "ethers";
import type { Prisma, TxKind } from "@prisma/client";
import type { AppDeps } from "../app.js";
import type { AuthContext } from "../types/express.js";
import type { ChainEvent } from "../lib/chain.js";
import { AppError, badRequest, conflict, forbidden } from "../lib/errors.js";
import { audit } from "../services/audit.js";
import {
  canCloseElection,
  canViewAudit,
  canViewVoterList,
  isElectionOwner,
  requireAuthContext,
  requireRole,
} from "../services/access.js";
import {
  electionInclude,
  electionStatus,
  loadChainView,
  loadVisibleElection,
  toElectionDto,
  type ElectionRecord,
} from "../services/elections.js";
import { recordTransaction, verifyUserTransaction } from "../services/transactions.js";
import { compareConfig, computeOutcome, percent, recountFromEvents } from "../services/verification.js";
import {
  createElectionSchema,
  idParam,
  listElectionsQuery,
  parse,
  txSubmissionSchema,
  updateElectionSchema,
  votersSchema,
} from "../validation/schemas.js";

export function electionsRouter({ prisma, chain }: AppDeps): Router {
  const r = Router();

  const requireWallet = (auth: AuthContext) => {
    if (!auth.user.walletAddress) throw badRequest("NO_WALLET", "No local test wallet is linked to your account");
    return getAddress(auth.user.walletAddress);
  };

  const requireOwner = (auth: AuthContext, e: ElectionRecord) => {
    if (!isElectionOwner(auth, e)) throw forbidden("Only the organizer who created this election can manage it");
  };

  const requirePublished = (e: ElectionRecord) => {
    if (e.status !== "PUBLISHED" || !e.chainSessionId) {
      throw conflict("NOT_PUBLISHED", "This election has not been published on-chain yet");
    }
    return e.chainSessionId;
  };

  /**
   * Shared flow for every endpoint that records a user-signed transaction:
   * verify receipt -> check expected event(s) -> store reference -> audit -> respond.
   * A transaction is reported as CONFIRMED only after the node returned a successful
   * receipt containing the expected event — never earlier.
   */
  async function handleSignedTx(
    res: Response,
    opts: {
      auth: AuthContext;
      election: ElectionRecord | null;
      organizationId: string;
      kind: TxKind;
      txHash: string;
      expectedFrom: string | string[];
      auditAction: string;
      onConfirmed: (events: ChainEvent[]) => Promise<Prisma.InputJsonObject>;
    },
  ) {
    const { auth, election, kind, txHash } = opts;
    const check = await verifyUserTransaction(chain, txHash, opts.expectedFrom);

    // Idempotent re-submission of a hash this user already had confirmed: no side effects.
    const existing = await prisma.transactionReference.findUnique({ where: { txHash: txHash.toLowerCase() } });
    if (
      existing?.status === "CONFIRMED" &&
      existing.userId === auth.user.id &&
      existing.kind === kind &&
      existing.electionId === (election?.id ?? null)
    ) {
      return res.json({ status: "CONFIRMED", txHash, blockNumber: existing.blockNumber, alreadyRecorded: true });
    }
    const base = {
      txHash,
      kind,
      chainId: chain.chainId,
      fromAddress: check.from,
      userId: auth.user.id,
      electionId: election?.id ?? null,
    };

    if (check.status === "PENDING") {
      await recordTransaction(prisma, { ...base, status: "PENDING" });
      return res.status(202).json({ status: "PENDING", txHash, message: "Transaction submitted; waiting for confirmation" });
    }
    if (check.status === "FAILED") {
      await recordTransaction(prisma, { ...base, status: "FAILED", blockNumber: check.blockNumber, error: "Reverted" });
      await audit(prisma, {
        action: "TX_FAILED",
        actorUserId: auth.user.id,
        organizationId: opts.organizationId,
        electionId: election?.id,
        details: { kind, txHash },
      });
      throw new AppError(422, "TX_REVERTED", "The transaction was reverted by the smart contract");
    }

    let details: Prisma.InputJsonObject;
    try {
      details = await opts.onConfirmed(check.events);
    } catch (err) {
      const message = err instanceof AppError ? err.message : "Verification failed";
      await recordTransaction(prisma, { ...base, status: "FAILED", blockNumber: check.blockNumber, error: message });
      await audit(prisma, {
        action: "TX_VERIFICATION_FAILED",
        actorUserId: auth.user.id,
        organizationId: opts.organizationId,
        electionId: election?.id,
        details: { kind, txHash, reason: message },
      });
      throw err;
    }
    await recordTransaction(prisma, { ...base, status: "CONFIRMED", blockNumber: check.blockNumber });
    await audit(prisma, {
      action: opts.auditAction,
      actorUserId: auth.user.id,
      organizationId: opts.organizationId,
      electionId: election?.id,
      details: { txHash, blockNumber: check.blockNumber, ...details },
    });
    return res.json({ status: "CONFIRMED", txHash, blockNumber: check.blockNumber, ...details });
  }

  const sessionEvents = (events: ChainEvent[], name: string, sessionId: string) =>
    events.filter((e) => e.name === name && String(e.args.sessionId) === sessionId);

  // ---------------------------------------------------------------- list / detail

  r.get("/", async (req, res) => {
    const auth = requireAuthContext(req.auth);
    const query = parse(listElectionsQuery, req.query);
    const userId = auth.user.id;

    // Build the visibility filter from the user's server-side memberships.
    const or: Prisma.ElectionWhereInput[] = auth.memberships.flatMap((m) => {
      const orgId = m.organizationId;
      return m.roles.map((role): Prisma.ElectionWhereInput => {
        switch (role) {
          case "ADMIN":
            return { organizationId: orgId };
          case "ORGANIZER":
            return { organizationId: orgId, OR: [{ status: "PUBLISHED" }, { createdById: userId }] };
          case "AUDITOR":
            return { organizationId: orgId, status: "PUBLISHED" };
          case "SHAREHOLDER":
            return { organizationId: orgId, status: "PUBLISHED", eligibility: { some: { userId } } };
        }
      });
    });
    if (or.length === 0) {
      res.json({ elections: [] });
      return;
    }

    const rows = (await prisma.election.findMany({
      where: {
        AND: [{ OR: or }, query.q ? { title: { contains: query.q, mode: "insensitive" } } : {}],
      },
      include: { ...electionInclude, eligibility: { where: { userId }, select: { weight: true } } },
      orderBy: [{ startTime: "desc" }],
      take: 200,
    })) as (ElectionRecord & { eligibility: { weight: number }[] })[];

    const elections = await Promise.all(
      rows.map(async (e) => toElectionDto(e, await loadChainView(chain, e), auth, e.eligibility[0]?.weight ?? null)),
    );
    res.json({ elections: query.status ? elections.filter((e) => e.status === query.status) : elections });
  });

  r.get("/:id", async (req, res) => {
    const auth = requireAuthContext(req.auth);
    const { election, eligibility } = await loadVisibleElection(prisma, auth, parse(idParam, req.params.id));
    res.json({ election: toElectionDto(election, await loadChainView(chain, election), auth, eligibility?.weight ?? null) });
  });

  // ---------------------------------------------------------------- drafts (off-chain)

  r.post("/", async (req, res) => {
    const auth = requireAuthContext(req.auth);
    const body = parse(createElectionSchema, req.body);
    requireRole(auth, body.organizationId, ["ORGANIZER"], "Only organizers can create elections");
    const created = await prisma.election.create({
      data: {
        organizationId: body.organizationId,
        createdById: auth.user.id,
        title: body.title,
        description: body.description,
        startTime: body.startTime,
        endTime: body.endTime,
        quorumBps: body.quorumBps,
        options: { create: body.options.map((label, index) => ({ index, label })) },
      },
      include: electionInclude,
    });
    await audit(prisma, {
      action: "ELECTION_DRAFT_CREATED",
      actorUserId: auth.user.id,
      organizationId: body.organizationId,
      electionId: created.id,
      details: { title: created.title, options: body.options.length },
    });
    res.status(201).json({ election: toElectionDto(created as ElectionRecord, { session: null }, auth, null) });
  });

  r.patch("/:id", async (req, res) => {
    const auth = requireAuthContext(req.auth);
    const { election } = await loadVisibleElection(prisma, auth, parse(idParam, req.params.id));
    requireOwner(auth, election);
    if (election.status !== "DRAFT") throw conflict("NOT_DRAFT", "Published elections cannot be edited");
    const body = parse(updateElectionSchema, req.body);
    const updated = await prisma.$transaction(async (tx) => {
      await tx.electionOption.deleteMany({ where: { electionId: election.id } });
      return tx.election.update({
        where: { id: election.id },
        data: {
          title: body.title,
          description: body.description,
          startTime: body.startTime,
          endTime: body.endTime,
          quorumBps: body.quorumBps,
          options: { create: body.options.map((label, index) => ({ index, label })) },
        },
        include: electionInclude,
      });
    });
    await audit(prisma, {
      action: "ELECTION_DRAFT_UPDATED",
      actorUserId: auth.user.id,
      organizationId: election.organizationId,
      electionId: election.id,
    });
    res.json({ election: toElectionDto(updated as ElectionRecord, { session: null }, auth, null) });
  });

  r.delete("/:id", async (req, res) => {
    const auth = requireAuthContext(req.auth);
    const { election } = await loadVisibleElection(prisma, auth, parse(idParam, req.params.id));
    requireOwner(auth, election);
    if (election.status !== "DRAFT") throw conflict("NOT_DRAFT", "Published elections cannot be deleted");
    await prisma.election.delete({ where: { id: election.id } });
    await audit(prisma, {
      action: "ELECTION_DRAFT_DELETED",
      actorUserId: auth.user.id,
      organizationId: election.organizationId,
      details: { title: election.title },
    });
    res.status(204).end();
  });

  // ---------------------------------------------------------------- eligibility list

  r.get("/:id/voters", async (req, res) => {
    const auth = requireAuthContext(req.auth);
    const { election } = await loadVisibleElection(prisma, auth, parse(idParam, req.params.id));
    if (!canViewVoterList(auth, election)) throw forbidden();

    const entries = await prisma.voterEligibility.findMany({
      where: { electionId: election.id },
      include: { user: { select: { id: true, displayName: true, walletAddress: true } } },
      orderBy: { weight: "desc" },
    });
    const sessionId = election.chainSessionId;
    const voters = await Promise.all(
      entries.map(async (v) => ({
        userId: v.userId,
        displayName: v.user.displayName,
        walletAddress: v.user.walletAddress ? getAddress(v.user.walletAddress) : null,
        weight: v.weight,
        registeredTxHash: v.registeredTxHash,
        // authoritative on-chain record (null while the election is a draft)
        onChain: sessionId && v.user.walletAddress ? await chain.getVoter(sessionId, v.user.walletAddress) : null,
      })),
    );

    // Candidates the organizer may add while the election is still a draft.
    let candidates: { userId: string; displayName: string; walletAddress: string | null; shareCount: number }[] = [];
    if (election.status === "DRAFT" && isElectionOwner(auth, election)) {
      const members = await prisma.organizationMembership.findMany({
        where: { organizationId: election.organizationId, roles: { has: "SHAREHOLDER" } },
        include: { user: { select: { id: true, displayName: true, walletAddress: true } } },
        orderBy: { shareCount: "desc" },
      });
      candidates = members.map((m) => ({
        userId: m.userId,
        displayName: m.user.displayName,
        walletAddress: m.user.walletAddress ? getAddress(m.user.walletAddress) : null,
        shareCount: m.shareCount,
      }));
    }
    res.json({ voters, candidates });
  });

  r.put("/:id/voters", async (req, res) => {
    const auth = requireAuthContext(req.auth);
    const { election } = await loadVisibleElection(prisma, auth, parse(idParam, req.params.id));
    requireOwner(auth, election);
    if (election.status !== "DRAFT") {
      throw conflict("NOT_DRAFT", "The eligibility list is frozen once the election is published on-chain");
    }
    const { voters } = parse(votersSchema, req.body);

    // Every voter must be a shareholder of THIS organization with a linked test wallet.
    const members = await prisma.organizationMembership.findMany({
      where: { organizationId: election.organizationId, userId: { in: voters.map((v) => v.userId) } },
      include: { user: { select: { walletAddress: true } } },
    });
    const byUser = new Map(members.map((m) => [m.userId, m]));
    const invalid = voters.filter((v) => {
      const m = byUser.get(v.userId);
      return !m || !m.roles.includes("SHAREHOLDER") || !m.user.walletAddress;
    });
    if (invalid.length > 0) {
      throw badRequest(
        "INVALID_VOTERS",
        "Some voters are not shareholders of this organization or have no linked wallet",
        invalid.map((v) => v.userId),
      );
    }

    await prisma.$transaction([
      prisma.voterEligibility.deleteMany({ where: { electionId: election.id } }),
      prisma.voterEligibility.createMany({
        data: voters.map((v) => ({ electionId: election.id, userId: v.userId, weight: v.weight })),
      }),
    ]);
    await audit(prisma, {
      action: "ELIGIBILITY_LIST_UPDATED",
      actorUserId: auth.user.id,
      organizationId: election.organizationId,
      electionId: election.id,
      details: { voters: voters.length, totalWeight: voters.reduce((s, v) => s + v.weight, 0) },
    });
    res.json({ count: voters.length });
  });

  // ---------------------------------------------------------------- on-chain lifecycle (user-signed)

  r.post("/:id/publish", async (req, res) => {
    const auth = requireAuthContext(req.auth);
    const { election } = await loadVisibleElection(prisma, auth, parse(idParam, req.params.id));
    requireOwner(auth, election);
    if (election.status !== "DRAFT") throw conflict("ALREADY_PUBLISHED", "This election is already published");
    const { txHash } = parse(txSubmissionSchema, req.body);
    const wallet = requireWallet(auth);

    await handleSignedTx(res, {
      auth,
      election,
      organizationId: election.organizationId,
      kind: "CREATE_SESSION",
      txHash,
      expectedFrom: wallet,
      auditAction: "ELECTION_PUBLISHED",
      onConfirmed: async (events) => {
        const created = events.find((e) => e.name === "SessionCreated");
        if (!created) throw badRequest("EVENT_MISSING", "No SessionCreated event in this transaction");
        const sessionId = String(created.args.sessionId);
        const cmp = compareConfig(
          {
            title: election.title,
            options: election.options.map((o) => o.label),
            startTime: election.startTime,
            endTime: election.endTime,
            quorumBps: election.quorumBps,
          },
          {
            title: String(created.args.title),
            optionLabels: created.args.optionLabels as string[],
            startTime: Number(created.args.startTime),
            endTime: Number(created.args.endTime),
            quorumBps: Number(created.args.quorumBps),
          },
        );
        if (!cmp.allMatch) {
          throw badRequest("CONFIG_MISMATCH", "On-chain session does not match the draft", cmp);
        }
        const contractAddress = await chain.requireContractAddress();
        await prisma.election.update({
          where: { id: election.id },
          data: {
            status: "PUBLISHED",
            chainSessionId: sessionId,
            contractAddress: contractAddress.toLowerCase(),
            chainId: chain.chainId,
            publishedAt: new Date(),
          },
        });
        return { sessionId };
      },
    });
  });

  r.post("/:id/voters/registration", async (req, res) => {
    const auth = requireAuthContext(req.auth);
    const { election } = await loadVisibleElection(prisma, auth, parse(idParam, req.params.id));
    requireOwner(auth, election);
    const sessionId = requirePublished(election);
    const { txHash } = parse(txSubmissionSchema, req.body);

    await handleSignedTx(res, {
      auth,
      election,
      organizationId: election.organizationId,
      kind: "REGISTER_VOTERS",
      txHash,
      expectedFrom: requireWallet(auth),
      auditAction: "VOTERS_REGISTERED_ON_CHAIN",
      onConfirmed: async (events) => {
        const regs = sessionEvents(events, "VoterRegistered", sessionId);
        if (regs.length === 0) throw badRequest("EVENT_MISSING", "No VoterRegistered events for this election");
        const entries = await prisma.voterEligibility.findMany({
          where: { electionId: election.id },
          include: { user: { select: { walletAddress: true } } },
        });
        const byWallet = new Map(entries.map((e) => [e.user.walletAddress?.toLowerCase(), e]));
        let matched = 0;
        const mismatches: string[] = [];
        for (const ev of regs) {
          const entry = byWallet.get(String(ev.args.voter).toLowerCase());
          if (entry && String(entry.weight) === String(ev.args.weight)) {
            await prisma.voterEligibility.update({
              where: { id: entry.id },
              data: { registeredTxHash: txHash.toLowerCase(), registeredAt: new Date() },
            });
            matched += 1;
          } else {
            mismatches.push(String(ev.args.voter));
          }
        }
        if (mismatches.length > 0) {
          await audit(prisma, {
            action: "CHAIN_DB_MISMATCH",
            actorUserId: auth.user.id,
            organizationId: election.organizationId,
            electionId: election.id,
            details: { reason: "Registered voters not on the off-chain eligibility list", voters: mismatches },
          });
        }
        return { registered: matched, mismatches };
      },
    });
  });

  r.post("/:id/open", async (req, res) => {
    const auth = requireAuthContext(req.auth);
    const { election } = await loadVisibleElection(prisma, auth, parse(idParam, req.params.id));
    requireOwner(auth, election);
    const sessionId = requirePublished(election);
    const { txHash } = parse(txSubmissionSchema, req.body);

    await handleSignedTx(res, {
      auth,
      election,
      organizationId: election.organizationId,
      kind: "OPEN_SESSION",
      txHash,
      expectedFrom: requireWallet(auth),
      auditAction: "ELECTION_OPENED",
      onConfirmed: async (events) => {
        const opened = sessionEvents(events, "SessionOpened", sessionId)[0];
        if (!opened) throw badRequest("EVENT_MISSING", "No SessionOpened event for this election");
        return { voterCount: Number(opened.args.voterCount), totalEligibleWeight: String(opened.args.totalEligibleWeight) };
      },
    });
  });

  r.post("/:id/close", async (req, res) => {
    const auth = requireAuthContext(req.auth);
    const { election } = await loadVisibleElection(prisma, auth, parse(idParam, req.params.id));
    if (!canCloseElection(auth, election)) throw forbidden("Only the election's organizer or an administrator can close it");
    const sessionId = requirePublished(election);
    const { txHash } = parse(txSubmissionSchema, req.body);

    await handleSignedTx(res, {
      auth,
      election,
      organizationId: election.organizationId,
      kind: "CLOSE_SESSION",
      txHash,
      expectedFrom: requireWallet(auth),
      auditAction: "ELECTION_CLOSED",
      onConfirmed: async (events) => {
        const closed = sessionEvents(events, "SessionClosed", sessionId)[0];
        if (!closed) throw badRequest("EVENT_MISSING", "No SessionClosed event for this election");
        return { votesCast: Number(closed.args.votesCast), totalVotedWeight: String(closed.args.totalVotedWeight) };
      },
    });
  });

  // ---------------------------------------------------------------- shareholder voting

  r.get("/:id/eligibility", async (req, res) => {
    const auth = requireAuthContext(req.auth);
    const { election, eligibility } = await loadVisibleElection(prisma, auth, parse(idParam, req.params.id));
    const view = await loadChainView(chain, election);
    const status = electionStatus(election, view);
    const wallet = auth.user.walletAddress ? getAddress(auth.user.walletAddress) : null;

    const onChain =
      eligibility && wallet && election.chainSessionId && view.session
        ? await chain.getVoter(election.chainSessionId, wallet)
        : null;
    const voteTx = await prisma.transactionReference.findFirst({
      where: { electionId: election.id, userId: auth.user.id, kind: "CAST_VOTE" },
      orderBy: { createdAt: "desc" },
      select: { txHash: true, status: true, blockNumber: true, createdAt: true },
    });

    // The order of these checks mirrors the contract's castVote() checks.
    let reason: string | null = null;
    if (!eligibility) reason = "NOT_ELIGIBLE";
    else if (!wallet) reason = "NO_WALLET";
    else if (status === "CHAIN_UNAVAILABLE" || status === "CHAIN_MISSING") reason = status;
    else if (status === "DRAFT" || status === "REGISTRATION") reason = "NOT_OPEN";
    else if (status === "SCHEDULED") reason = "NOT_STARTED";
    else if (status === "ENDED") reason = "ENDED";
    else if (status === "CLOSED") reason = "CLOSED";
    else if (!onChain?.registered) reason = "NOT_REGISTERED_ON_CHAIN";
    else if (onChain.hasVoted) reason = "ALREADY_VOTED";

    res.json({
      electionId: election.id,
      status,
      eligible: !!eligibility,
      weight: eligibility?.weight ?? null,
      walletAddress: wallet,
      onChain,
      voteTransaction: voteTx,
      canVote: reason === null,
      reason,
    });
  });

  r.post("/:id/votes", async (req, res) => {
    const auth = requireAuthContext(req.auth);
    const { election, eligibility } = await loadVisibleElection(prisma, auth, parse(idParam, req.params.id));
    if (!eligibility) throw forbidden("You are not eligible to vote in this election");
    const sessionId = requirePublished(election);
    const { txHash } = parse(txSubmissionSchema, req.body);
    const wallet = requireWallet(auth);

    await handleSignedTx(res, {
      auth,
      election,
      organizationId: election.organizationId,
      kind: "CAST_VOTE",
      txHash,
      expectedFrom: wallet,
      // The ballot choice is deliberately NOT copied into the application audit log.
      auditAction: "VOTE_RECORDED",
      onConfirmed: async (events) => {
        const vote = sessionEvents(events, "VoteCast", sessionId).find(
          (e) => String(e.args.voter).toLowerCase() === wallet.toLowerCase(),
        );
        if (!vote) throw badRequest("EVENT_MISSING", "No VoteCast event from your wallet for this election");
        return { weight: String(vote.args.weight) };
      },
    });
  });

  // ---------------------------------------------------------------- results and audit

  r.get("/:id/results", async (req, res) => {
    const auth = requireAuthContext(req.auth);
    const { election } = await loadVisibleElection(prisma, auth, parse(idParam, req.params.id));
    const sessionId = requirePublished(election);
    const view = await loadChainView(chain, election);
    if (!view.session) throw new AppError(503, view.error ?? "CHAIN_UNAVAILABLE", "On-chain session is not available");
    if (view.session.state !== "Closed") {
      throw conflict("RESULTS_NOT_AVAILABLE", "Results are published only after the election is closed on-chain");
    }

    const [results, events, closeTx] = await Promise.all([
      chain.getResults(sessionId),
      chain.getSessionEvents(sessionId),
      prisma.transactionReference.findFirst({
        where: { electionId: election.id, kind: "CLOSE_SESSION", status: "CONFIRMED" },
        select: { txHash: true, blockNumber: true },
      }),
    ]);
    const labels = view.session.optionLabels;
    const recount = recountFromEvents(events, labels.length);
    const recountMatches =
      recount.totalVotedWeight === results.totalVotedWeight &&
      recount.totalEligibleWeight === results.totalEligibleWeight &&
      recount.optionWeights.every((w, i) => w === results.optionWeights[i]) &&
      recount.optionVotes.every((v, i) => v === results.optionVotes[i]) &&
      recount.duplicateVoters.length === 0;
    const closedEvent = events.find((e) => e.name === "SessionClosed");

    res.json({
      electionId: election.id,
      sessionId,
      contractAddress: election.contractAddress,
      options: labels.map((label, i) => ({
        index: i,
        label,
        weight: results.optionWeights[i],
        votes: results.optionVotes[i],
        weightPercent: percent(results.optionWeights[i]!, results.totalVotedWeight),
      })),
      totalVotedWeight: results.totalVotedWeight,
      totalEligibleWeight: results.totalEligibleWeight,
      turnoutPercent: percent(results.totalVotedWeight, results.totalEligibleWeight),
      votesCast: view.session.votesCast,
      voterCount: view.session.voterCount,
      quorumBps: view.session.quorumBps,
      quorumReached: results.quorumReached,
      outcome: computeOutcome(labels, results.optionWeights, results.quorumReached),
      verification: {
        method: "Independent recount of public VoteCast/VoterRegistered events compared with contract storage",
        matchesContract: recountMatches,
        voteEvents: recount.voteEvents,
        registeredVoters: recount.registeredVoters,
      },
      closedBy: closedEvent ? { txHash: closedEvent.transactionHash, blockNumber: closedEvent.blockNumber } : closeTx,
    });
  });

  r.get("/:id/audit", async (req, res) => {
    const auth = requireAuthContext(req.auth);
    const { election } = await loadVisibleElection(prisma, auth, parse(idParam, req.params.id));
    if (!canViewAudit(auth, election)) throw forbidden("Only administrators, organizers and auditors can view audit data");

    const view = await loadChainView(chain, election);
    const [chainEvents, appEvents, transactions] = await Promise.all([
      election.chainSessionId && view.session ? chain.getSessionEvents(election.chainSessionId) : Promise.resolve([]),
      prisma.auditEvent.findMany({
        where: { electionId: election.id },
        include: { actor: { select: { displayName: true } } },
        orderBy: { createdAt: "asc" },
        take: 500,
      }),
      prisma.transactionReference.findMany({
        where: { electionId: election.id },
        include: { user: { select: { displayName: true } } },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    const s = view.session;
    const configCheck = s
      ? compareConfig(
          {
            title: election.title,
            options: election.options.map((o) => o.label),
            startTime: election.startTime,
            endTime: election.endTime,
            quorumBps: election.quorumBps,
          },
          s,
        )
      : null;
    const recount = s ? recountFromEvents(chainEvents, s.optionLabels.length) : null;
    let totalsCheck: null | { matches: boolean; contract: unknown; recount: unknown } = null;
    if (s && recount) {
      // Running totals are compared with contract storage (votesCast / weights);
      // per-option totals become available from the contract only after closure.
      const perOption = s.state === "Closed" ? await chain.getResults(election.chainSessionId!) : null;
      const matches =
        recount.totalVotedWeight === s.totalVotedWeight &&
        recount.totalEligibleWeight === s.totalEligibleWeight &&
        recount.voteEvents === s.votesCast &&
        recount.registeredVoters === s.voterCount &&
        recount.duplicateVoters.length === 0 &&
        (!perOption || recount.optionWeights.every((w, i) => w === perOption.optionWeights[i]));
      totalsCheck = {
        matches,
        contract: {
          votesCast: s.votesCast,
          voterCount: s.voterCount,
          totalVotedWeight: s.totalVotedWeight,
          totalEligibleWeight: s.totalEligibleWeight,
          optionWeights: perOption?.optionWeights ?? null,
        },
        recount,
      };
    }

    res.json({
      election: toElectionDto(election, view, auth, null),
      onChainConfig: s,
      chainEvents,
      appEvents: appEvents.map((a) => ({
        id: a.id,
        action: a.action,
        actor: a.actor?.displayName ?? null,
        details: a.details,
        createdAt: a.createdAt.toISOString(),
      })),
      transactions: transactions.map((t) => ({
        txHash: t.txHash,
        kind: t.kind,
        status: t.status,
        blockNumber: t.blockNumber,
        from: t.fromAddress,
        user: t.user.displayName,
        error: t.error,
        createdAt: t.createdAt.toISOString(),
      })),
      verification: {
        configMatchesDatabase: configCheck,
        totals: totalsCheck,
        generatedAt: new Date().toISOString(),
      },
    });
  });

  return r;
}
