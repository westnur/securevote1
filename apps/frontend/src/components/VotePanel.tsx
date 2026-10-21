import { useState } from "react";
import { Link } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { formatWeight, shortAddress, shortHash } from "../lib/format";
import { qk } from "../lib/queries";
import type { Election, Eligibility, IneligibilityReason, TxRecordResponse } from "../lib/types";
import { useTxFlow } from "../lib/useTxFlow";
import { useWallet } from "../lib/wallet";
import { TxStatusPanel } from "./TxStatusPanel";
import { Alert, Button, ConfirmDialog, Mono } from "./ui";

export const REASONS: Record<IneligibilityReason, string> = {
  NOT_ELIGIBLE: "You are not on the eligibility list for this election.",
  NO_WALLET: "No local test wallet is linked to your account.",
  CHAIN_UNAVAILABLE: "The local blockchain is not reachable, so eligibility cannot be checked.",
  CHAIN_MISSING: "This session was not found on the current chain (was the node restarted?).",
  NOT_OPEN: "Voting has not been opened by the organizer yet.",
  NOT_STARTED: "The session is open, but the voting window has not started yet.",
  ENDED: "The voting window has ended.",
  CLOSED: "This election is closed.",
  NOT_REGISTERED_ON_CHAIN: "Your wallet has not been registered on-chain for this session.",
  ALREADY_VOTED: "You have already voted in this election. A second vote would be rejected by the contract.",
};

export function VotePanel({ election, eligibility }: { election: Election; eligibility: Eligibility }) {
  const wallet = useWallet();
  const qc = useQueryClient();
  const { state, run, retryRecord, busy } = useTxFlow();
  const [choice, setChoice] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);

  const submit = async () => {
    setConfirming(false);
    if (choice === null || !election.chain) return;
    const sessionId = election.chain.sessionId;
    await run(
      (c) => c.castVote(sessionId, choice),
      (txHash) => api.post<TxRecordResponse>(`/api/elections/${election.id}/votes`, { txHash }),
    );
    await qc.invalidateQueries({ queryKey: qk.election(election.id) });
    await qc.invalidateQueries({ queryKey: qk.eligibility(election.id) });
  };

  const voted = eligibility.reason === "ALREADY_VOTED";

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-slate-400">Eligible</dt>
          <dd className="font-medium text-white">{eligibility.eligible ? "Yes" : "No"}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400">Your voting weight</dt>
          <dd className="font-medium text-white">{eligibility.weight !== null ? formatWeight(eligibility.weight) : "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400">Linked wallet</dt>
          <dd className="font-mono text-xs text-slate-300">{shortAddress(eligibility.walletAddress)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400">On-chain registration</dt>
          <dd className="text-slate-200">
            {eligibility.onChain
              ? eligibility.onChain.registered
                ? `Registered (${formatWeight(eligibility.onChain.weight)})`
                : "Not registered"
              : "—"}
          </dd>
        </div>
      </dl>

      {voted && eligibility.voteTransaction && (
        <Alert tone="green" title="Your vote is recorded on-chain">
          Transaction <Mono value={eligibility.voteTransaction.txHash} display={shortHash(eligibility.voteTransaction.txHash)} />
          {eligibility.voteTransaction.blockNumber !== null && <> in block {eligibility.voteTransaction.blockNumber}</>} (
          {eligibility.voteTransaction.status.toLowerCase()}).
        </Alert>
      )}
      {!eligibility.canVote && eligibility.reason && !(voted && eligibility.voteTransaction) && state.phase !== "confirmed" && (
        <Alert tone={voted ? "green" : "amber"}>{REASONS[eligibility.reason]}</Alert>
      )}

      {eligibility.canVote && state.phase !== "confirmed" && (
        <fieldset disabled={busy} className="space-y-2">
          <legend className="mb-2 text-sm font-medium text-slate-200">Select one option</legend>
          {election.options.map((o) => (
            <label
              key={o.index}
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-navy-700 px-3 py-2.5 hover:border-blue-500/60 has-[:checked]:border-blue-500 has-[:checked]:bg-blue-500/10"
            >
              <input
                type="radio"
                name="ballot"
                value={o.index}
                checked={choice === o.index}
                onChange={() => setChoice(o.index)}
                className="accent-blue-500"
              />
              <span className="text-sm text-slate-100">{o.label}</span>
            </label>
          ))}
          {!wallet.ready && (
            <p className="text-xs text-amber-300">Connect your local test wallet (top right) to sign your vote.</p>
          )}
          <Button
            className="mt-2 w-full"
            disabled={choice === null || !wallet.ready}
            onClick={() => setConfirming(true)}
            loading={busy}
          >
            Review and sign vote
          </Button>
        </fieldset>
      )}

      <TxStatusPanel state={state} onRetryRecord={retryRecord} />

      {voted && election.chain && (
        <div className="rounded-lg border border-navy-700 p-3">
          <p className="text-xs text-slate-400">
            Security demonstration: send a second <code>castVote</code> transaction from your wallet. The smart contract must
            reject it — no second vote can be counted.
          </p>
          <Button
            size="sm"
            variant="secondary"
            className="mt-2"
            disabled={!wallet.ready || busy}
            onClick={() =>
              void run(
                (c) => c.castVote(election.chain!.sessionId, 0),
                (txHash) => api.post<TxRecordResponse>(`/api/elections/${election.id}/votes`, { txHash }),
              )
            }
          >
            Try to vote again
          </Button>
        </div>
      )}

      {election.status === "CLOSED" && (
        <Link to={`/app/elections/${election.id}/results`} className="inline-block text-sm text-blue-300 hover:underline">
          View final results →
        </Link>
      )}

      <ConfirmDialog
        open={confirming}
        title="Confirm your vote"
        confirmLabel="Sign and submit"
        onCancel={() => setConfirming(false)}
        onConfirm={() => void submit()}
      >
        <p>
          You are voting <strong className="text-white">{choice !== null ? election.options[choice]?.label : ""}</strong> with a
          weight of <strong className="text-white">{formatWeight(eligibility.weight)}</strong>.
        </p>
        <p className="mt-2 text-amber-200">
          A vote cannot be changed. This prototype uses a transparent ballot: your wallet address and choice will be publicly
          visible in the blockchain event log.
        </p>
      </ConfirmDialog>
    </div>
  );
}
