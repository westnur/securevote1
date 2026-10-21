import type { ChainEvent, ChainSession } from "../lib/chain.js";

/**
 * Pure functions used for result verification and database/blockchain consistency
 * checks. They contain no I/O so they are easy to unit test and to explain.
 */

export type ElectionStatus =
  | "DRAFT" // only in the database
  | "REGISTRATION" // on-chain, state Created: voters can be registered
  | "SCHEDULED" // on-chain Open, but now < startTime
  | "ACTIVE" // on-chain Open and startTime <= now < endTime
  | "ENDED" // on-chain Open but the window has passed; awaiting close
  | "CLOSED" // on-chain Closed: results final
  | "CHAIN_UNAVAILABLE" // node unreachable — state unknown
  | "CHAIN_MISSING"; // DB references a session that is not on the current chain

export function deriveStatus(
  dbStatus: "DRAFT" | "PUBLISHED",
  session: ChainSession | null,
  chainError: string | undefined,
  nowSeconds: number,
): ElectionStatus {
  if (dbStatus === "DRAFT") return "DRAFT";
  if (chainError === "CHAIN_UNAVAILABLE") return "CHAIN_UNAVAILABLE";
  if (!session) return "CHAIN_MISSING";
  switch (session.state) {
    case "Created":
      return "REGISTRATION";
    case "Closed":
      return "CLOSED";
    case "Open":
      if (nowSeconds < session.startTime) return "SCHEDULED";
      if (nowSeconds >= session.endTime) return "ENDED";
      return "ACTIVE";
  }
}

export interface ConfigComparison {
  title: boolean;
  options: boolean;
  startTime: boolean;
  endTime: boolean;
  quorumBps: boolean;
  allMatch: boolean;
}

/** Compare the off-chain draft metadata with the on-chain session configuration. */
export function compareConfig(
  db: { title: string; options: string[]; startTime: Date; endTime: Date; quorumBps: number },
  chain: Pick<ChainSession, "title" | "optionLabels" | "startTime" | "endTime" | "quorumBps">,
): ConfigComparison {
  const r = {
    title: db.title === chain.title,
    options: db.options.length === chain.optionLabels.length && db.options.every((o, i) => o === chain.optionLabels[i]),
    startTime: Math.floor(db.startTime.getTime() / 1000) === chain.startTime,
    endTime: Math.floor(db.endTime.getTime() / 1000) === chain.endTime,
    quorumBps: db.quorumBps === chain.quorumBps,
  };
  return { ...r, allMatch: Object.values(r).every(Boolean) };
}

export interface Recount {
  optionWeights: string[];
  optionVotes: string[];
  totalVotedWeight: string;
  totalEligibleWeight: string;
  registeredVoters: number;
  voteEvents: number;
  duplicateVoters: string[];
}

/**
 * Independently recompute the tally from the public event log (VoterRegistered and
 * VoteCast). An auditor can compare this with the contract's stored totals.
 */
export function recountFromEvents(events: ChainEvent[], optionCount: number): Recount {
  const weights = Array.from({ length: optionCount }, () => 0n);
  const votes = Array.from({ length: optionCount }, () => 0n);
  let eligible = 0n;
  let voted = 0n;
  let registered = 0;
  let voteEvents = 0;
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const e of events) {
    if (e.name === "VoterRegistered") {
      registered += 1;
      eligible += BigInt(String(e.args.weight));
    } else if (e.name === "VoteCast") {
      voteEvents += 1;
      const voter = String(e.args.voter).toLowerCase();
      if (seen.has(voter)) duplicates.push(voter);
      seen.add(voter);
      const idx = Number(e.args.optionIndex);
      const w = BigInt(String(e.args.weight));
      if (idx >= 0 && idx < optionCount) {
        weights[idx] += w;
        votes[idx] += 1n;
      }
      voted += w;
    }
  }
  return {
    optionWeights: weights.map(String),
    optionVotes: votes.map(String),
    totalVotedWeight: voted.toString(),
    totalEligibleWeight: eligible.toString(),
    registeredVoters: registered,
    voteEvents,
    duplicateVoters: duplicates,
  };
}

export interface Outcome {
  decided: boolean;
  leaders: number[];
  tie: boolean;
  summary: string;
}

/**
 * Counting method: simple plurality of WEIGHTED votes. If the quorum is not reached,
 * or nobody voted, or the top options are tied, no option is declared adopted.
 */
export function computeOutcome(labels: string[], weights: string[], quorumReached: boolean): Outcome {
  const w = weights.map((x) => BigInt(x));
  const max = w.reduce((a, b) => (b > a ? b : a), 0n);
  if (max === 0n) return { decided: false, leaders: [], tie: false, summary: "No votes were cast." };
  const leaders = w.map((x, i) => (x === max ? i : -1)).filter((i) => i >= 0);
  const tie = leaders.length > 1;
  if (!quorumReached) {
    return { decided: false, leaders, tie, summary: "Quorum was not reached — no decision can be adopted." };
  }
  if (tie) {
    return {
      decided: false,
      leaders,
      tie,
      summary: `Tie between ${leaders.map((i) => `"${labels[i]}"`).join(" and ")} — no option has a plurality.`,
    };
  }
  return { decided: true, leaders, tie, summary: `"${labels[leaders[0]!]}" received the largest voting weight.` };
}

/** Percentage with 2 decimals from two decimal-string bigints (avoids float overflow). */
export function percent(part: string, whole: string): number {
  const w = BigInt(whole);
  if (w === 0n) return 0;
  return Number((BigInt(part) * 10_000n) / w) / 100;
}
