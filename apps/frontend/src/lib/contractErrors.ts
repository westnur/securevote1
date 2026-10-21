import { Interface } from "ethers";
import { secureVoteAbi } from "@securevote/contracts";

const iface = new Interface(secureVoteAbi);

/** Human-readable explanations for the contract's custom errors. */
const MESSAGES: Record<string, string> = {
  AlreadyVoted: "Duplicate vote rejected: this wallet has already voted in this session.",
  NotEligible: "Your wallet is not registered as an eligible voter for this session.",
  VotingNotStarted: "Voting has not started yet for this session.",
  VotingEnded: "The voting period for this session has ended.",
  InvalidState: "This action is not allowed in the session's current lifecycle state.",
  InvalidOption: "The selected option does not exist.",
  NotSessionOrganizer: "Only the organizer who created this session (or an admin, for closing) may do this.",
  AccessControlUnauthorizedAccount: "Your wallet does not hold the required on-chain role.",
  CloseNotAllowedYet: "The session cannot be closed before its end time while registered voters have not voted.",
  NoEligibleVoters: "Register at least one eligible voter before opening the session.",
  VoterAlreadyRegistered: "One of these voters is already registered for this session.",
  ZeroWeight: "Voting weight must be positive.",
  InvalidVoter: "Invalid voter address.",
  InvalidSchedule: "The voting schedule is invalid (end must be after start and in the future).",
  InvalidOptionCount: "A session needs between 2 and 10 options.",
  InvalidOptionLabel: "An option label is empty or too long.",
  InvalidTitle: "The title is empty or too long.",
  InvalidQuorum: "Quorum must be between 0% and 100%.",
  BatchTooLarge: "Too many voters in one registration transaction.",
  LengthMismatch: "Voter and weight lists have different lengths.",
  EmptyBatch: "No voters to register.",
  SessionNotFound: "This session does not exist on the connected blockchain.",
};

function findRevertData(err: unknown): string | null {
  const seen = new Set<unknown>();
  const stack: unknown[] = [err];
  while (stack.length) {
    const e = stack.pop();
    if (!e || typeof e !== "object" || seen.has(e)) continue;
    seen.add(e);
    const o = e as Record<string, unknown>;
    if (typeof o.data === "string" && /^0x[0-9a-fA-F]{8}/.test(o.data)) return o.data;
    for (const key of ["error", "info", "data", "cause", "payload"]) if (o[key]) stack.push(o[key]);
  }
  return null;
}

export interface DecodedTxError {
  kind: "rejected" | "contract" | "network" | "unknown";
  name?: string;
  message: string;
}

/** Convert any wallet/RPC/contract error into a clear message for the UI. */
export function decodeTxError(err: unknown): DecodedTxError {
  const e = err as { code?: string | number; shortMessage?: string; message?: string; revert?: { name?: string } };
  if (e?.code === "ACTION_REJECTED" || e?.code === 4001) {
    return { kind: "rejected", message: "You rejected the transaction in your wallet. Nothing was submitted." };
  }
  const name =
    e?.revert?.name ??
    (() => {
      const data = findRevertData(err);
      if (!data) return undefined;
      try {
        return iface.parseError(data)?.name;
      } catch {
        return undefined;
      }
    })();
  if (name)
    return { kind: "contract", name, message: MESSAGES[name] ?? `The smart contract rejected the transaction (${name}).` };
  const msg = String(e?.shortMessage ?? e?.message ?? err);
  if (/failed to fetch|ECONNREFUSED|network|NETWORK_ERROR|could not coalesce|SERVER_ERROR/i.test(msg)) {
    return { kind: "network", message: "Cannot reach the local blockchain node (RPC). Is `npm run chain:node` running?" };
  }
  return { kind: "unknown", message: msg.length > 240 ? msg.slice(0, 240) + "…" : msg };
}
