import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ElectionForm, type ElectionPayload } from "../components/ElectionForm";
import { StatusBadge } from "../components/StatusBadge";
import { TxStatusPanel } from "../components/TxStatusPanel";
import { Alert, Badge, Button, cx, Input, Mono, PageHeader, Spinner, Table, td, th } from "../components/ui";
import { api, ApiError } from "../lib/api";
import { formatWeight, shortAddress, toLocalInput } from "../lib/format";
import { qk, useElection, useVoters } from "../lib/queries";
import type { Election, TxRecordResponse, VoterRow, Candidate } from "../lib/types";
import { useTxFlow } from "../lib/useTxFlow";
import { useWallet } from "../lib/wallet";

const toSeconds = (iso: string) => Math.floor(Date.parse(iso) / 1000);

function Step({
  n,
  title,
  done,
  active,
  children,
  status,
}: {
  n: number;
  title: string;
  done: boolean;
  active: boolean;
  children: ReactNode;
  status?: ReactNode;
}) {
  return (
    <li className={cx("rounded-xl border p-5", active ? "border-blue-500/50 bg-navy-900" : "border-navy-700 bg-navy-900/60")}>
      <div className="mb-3 flex items-center gap-3">
        <span
          className={cx(
            "flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold",
            done ? "bg-emerald-500/20 text-emerald-300" : active ? "bg-blue-600 text-white" : "bg-navy-700 text-slate-400",
          )}
          aria-hidden="true"
        >
          {done ? "✓" : n}
        </span>
        <h2 className="font-medium text-white">
          {title} {done && <span className="sr-only">(completed)</span>}
        </h2>
      </div>
      {children}
      {status && <div className="mt-4">{status}</div>}
    </li>
  );
}

/** Off-chain eligibility list editor (only while the election is a draft). */
function VoterEditor({ election, voters, candidates }: { election: Election; voters: VoterRow[]; candidates: Candidate[] }) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<Record<string, { selected: boolean; weight: string }>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: "green" | "red"; text: string } | null>(null);

  useEffect(() => {
    const current = new Map(voters.map((v) => [v.userId, v.weight]));
    setRows(
      Object.fromEntries(
        candidates.map((c) => [
          c.userId,
          { selected: current.has(c.userId), weight: String(current.get(c.userId) ?? c.shareCount ?? 1) },
        ]),
      ),
    );
  }, [voters, candidates]);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const payload = candidates
        .filter((c) => rows[c.userId]?.selected)
        .map((c) => ({ userId: c.userId, weight: Number(rows[c.userId]!.weight) }));
      await api.put(`/api/elections/${election.id}/voters`, { voters: payload });
      await qc.invalidateQueries({ queryKey: qk.voters(election.id) });
      await qc.invalidateQueries({ queryKey: qk.election(election.id) });
      setMsg({ tone: "green", text: `Saved ${payload.length} eligible voter(s).` });
    } catch (err) {
      setMsg({ tone: "red", text: err instanceof ApiError ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  };

  const total = candidates.reduce((s, c) => s + (rows[c.userId]?.selected ? Number(rows[c.userId]?.weight) || 0 : 0), 0);
  return (
    <div className="space-y-3">
      <Table>
        <thead>
          <tr>
            <th className={th}>Eligible</th>
            <th className={th}>Shareholder (fictional)</th>
            <th className={th}>Test wallet</th>
            <th className={th}>Voting weight</th>
          </tr>
        </thead>
        <tbody>
          {candidates.map((c) => {
            const r = rows[c.userId] ?? { selected: false, weight: "1" };
            return (
              <tr key={c.userId}>
                <td className={td}>
                  <input
                    type="checkbox"
                    aria-label={`Eligible: ${c.displayName}`}
                    checked={r.selected}
                    onChange={(e) => setRows((s) => ({ ...s, [c.userId]: { ...r, selected: e.target.checked } }))}
                    className="h-4 w-4 accent-blue-500"
                  />
                </td>
                <td className={td}>
                  {c.displayName}
                  <p className="text-xs text-slate-500">{formatWeight(c.shareCount)} shares</p>
                </td>
                <td className={`${td} font-mono text-xs`}>{shortAddress(c.walletAddress)}</td>
                <td className={td}>
                  <Input
                    type="number"
                    min={1}
                    className="w-32"
                    aria-label={`Weight for ${c.displayName}`}
                    value={r.weight}
                    disabled={!r.selected}
                    onChange={(e) => setRows((s) => ({ ...s, [c.userId]: { ...r, weight: e.target.value } }))}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={save} loading={saving} variant="secondary">
          Save eligibility list
        </Button>
        <span className="text-sm text-slate-400">Total eligible weight: {formatWeight(total)}</span>
      </div>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
    </div>
  );
}

function VoterTable({ voters }: { voters: VoterRow[] }) {
  return (
    <Table>
      <thead>
        <tr>
          <th className={th}>Voter</th>
          <th className={th}>Wallet</th>
          <th className={th}>Weight</th>
          <th className={th}>On-chain</th>
        </tr>
      </thead>
      <tbody>
        {voters.map((v) => (
          <tr key={v.userId}>
            <td className={td}>{v.displayName}</td>
            <td className={td}>{v.walletAddress && <Mono value={v.walletAddress} display={shortAddress(v.walletAddress)} />}</td>
            <td className={td}>{formatWeight(v.weight)}</td>
            <td className={td}>
              {!v.onChain ? (
                <Badge>draft</Badge>
              ) : v.onChain.hasVoted ? (
                <Badge tone="green">voted</Badge>
              ) : v.onChain.registered ? (
                <Badge tone="blue">registered</Badge>
              ) : (
                <Badge tone="amber">not registered</Badge>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

export function ManageElectionPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const wallet = useWallet();
  const election = useElection(id);
  const voters = useVoters(id, election.isSuccess && !!election.data?.permissions.canViewVoters);
  const tx = useTxFlow();
  const [txStep, setTxStep] = useState<number | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  if (election.isLoading) return <Spinner label="Loading…" />;
  if (election.isError || !election.data) return <Alert tone="red">{(election.error as Error)?.message ?? "Not found"}</Alert>;
  const e = election.data;
  if (!e.permissions.canManage && !e.permissions.canClose) {
    return (
      <Alert tone="amber" title="Not your election">
        Only the organizer who created this election can manage it.
      </Alert>
    );
  }

  const list = voters.data?.voters ?? [];
  const unregistered = list.filter((v) => v.onChain && !v.onChain.registered && v.walletAddress);
  const isDraft = e.status === "DRAFT";
  const published = !!e.chain;
  const registrationDone = published && list.length > 0 && unregistered.length === 0 && (e.chain?.voterCount ?? 0) > 0;
  const opened = ["SCHEDULED", "ACTIVE", "ENDED", "CLOSED"].includes(e.status);
  const allVoted = !!e.chain && e.chain.voterCount !== null && e.chain.voterCount > 0 && e.chain.votesCast === e.chain.voterCount;
  const canCloseNow = e.status === "ENDED" || (e.status === "ACTIVE" && allVoted);
  const endPassed = Date.parse(e.endTime) <= Date.now();

  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: qk.election(id) }),
      qc.invalidateQueries({ queryKey: qk.voters(id) }),
      qc.invalidateQueries({ queryKey: qk.elections }),
    ]);
  };
  const record = (path: string) => (txHash: string) => api.post<TxRecordResponse>(`/api/elections/${id}/${path}`, { txHash });
  const walletHint = !wallet.ready && (
    <p className="text-xs text-amber-300">Connect your local test wallet (top right) to sign.</p>
  );

  return (
    <>
      <PageHeader
        title={e.title}
        subtitle={
          <span className="flex items-center gap-2">
            <StatusBadge status={e.status} /> Manage election lifecycle · each on-chain step is signed by your own wallet
          </span>
        }
        actions={
          <Link
            to={`/app/elections/${e.id}`}
            className="rounded-md bg-navy-700 px-3 py-2 text-sm text-slate-100 hover:bg-navy-600"
          >
            Public view
          </Link>
        }
      />
      {e.chain?.error && (
        <div className="mb-4">
          <Alert tone="red">
            On-chain state unavailable ({e.chain.error}). Actions are disabled until the chain is reachable.
          </Alert>
        </div>
      )}

      <ol className="space-y-4">
        <Step n={1} title="Election details" done={!isDraft} active={isDraft}>
          {e.permissions.canEditDraft ? (
            <>
              {editError && (
                <div className="mb-3">
                  <Alert tone="red">{editError}</Alert>
                </div>
              )}
              <ElectionForm
                initial={{
                  title: e.title,
                  description: e.description,
                  options: e.options.map((o) => ({ label: o.label })),
                  startTime: toLocalInput(new Date(e.startTime)),
                  endTime: toLocalInput(new Date(e.endTime)),
                  quorumPercent: e.quorumBps / 100,
                }}
                submitLabel="Save draft"
                onSubmit={async (p: ElectionPayload) => {
                  setEditError(null);
                  try {
                    await api.patch(`/api/elections/${id}`, p);
                    await refresh();
                  } catch (err) {
                    setEditError(err instanceof ApiError ? err.message : String(err));
                  }
                }}
              />
              <div className="mt-4 border-t border-navy-700 pt-4">
                <Button
                  variant="danger"
                  size="sm"
                  onClick={async () => {
                    if (!window.confirm("Delete this draft? This cannot be undone.")) return;
                    await api.del(`/api/elections/${id}`);
                    await qc.invalidateQueries({ queryKey: qk.elections });
                    navigate("/app/organizer");
                  }}
                >
                  Delete draft
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-400">
              Configuration is frozen: title, options, schedule and quorum ({e.quorumBps / 100}%) are stored in on-chain session #
              {e.chain?.sessionId}.{" "}
              {e.chain?.configMatchesDatabase === false && (
                <strong className="text-rose-300">Warning: database and chain differ!</strong>
              )}
            </p>
          )}
        </Step>

        <Step n={2} title="Eligible voters and weights" done={!isDraft && list.length > 0} active={isDraft}>
          {voters.isLoading && <Spinner />}
          {voters.data && isDraft && e.permissions.canEditDraft && (
            <VoterEditor election={e} voters={voters.data.voters} candidates={voters.data.candidates} />
          )}
          {voters.data && !isDraft && <VoterTable voters={list} />}
        </Step>

        <Step
          status={txStep === 3 && <TxStatusPanel state={tx.state} onRetryRecord={tx.retryRecord} />}
          n={3}
          title="Publish session on-chain"
          done={published}
          active={isDraft}
        >
          <p className="mb-3 text-sm text-slate-400">
            Signs <code className="text-slate-300">createSession(title, options, start, end, quorum)</code>. The contract checks
            that your wallet holds ORGANIZER_ROLE; the backend then checks that the on-chain configuration matches this draft.
          </p>
          {isDraft && (
            <>
              {list.length === 0 && <p className="mb-2 text-xs text-amber-300">Save at least one eligible voter first.</p>}
              {endPassed && <p className="mb-2 text-xs text-amber-300">The end time has passed — edit the schedule first.</p>}
              {walletHint}
              <Button
                className="mt-2"
                disabled={!wallet.ready || list.length === 0 || endPassed || tx.busy}
                loading={tx.busy}
                onClick={async () => {
                  setTxStep(3);
                  await tx.run(
                    (c) =>
                      c.createSession(
                        e.title,
                        e.options.map((o) => o.label),
                        toSeconds(e.startTime),
                        toSeconds(e.endTime),
                        e.quorumBps,
                      ),
                    record("publish"),
                  );
                  await refresh();
                }}
              >
                Sign and publish
              </Button>
            </>
          )}
        </Step>

        <Step
          status={txStep === 4 && <TxStatusPanel state={tx.state} onRetryRecord={tx.retryRecord} />}
          n={4}
          title="Register voters on-chain"
          done={registrationDone}
          active={e.status === "REGISTRATION" && !registrationDone}
        >
          <p className="mb-3 text-sm text-slate-400">
            Signs <code className="text-slate-300">registerVoters(session, addresses, weights)</code> for {unregistered.length}{" "}
            voter(s) not yet registered. Registration is only possible before the session opens.
          </p>
          {e.status === "REGISTRATION" && unregistered.length > 0 && (
            <>
              {walletHint}
              <Button
                className="mt-2"
                disabled={!wallet.ready || tx.busy}
                loading={tx.busy}
                onClick={async () => {
                  setTxStep(4);
                  await tx.run(
                    (c) =>
                      c.registerVoters(
                        e.chain!.sessionId,
                        unregistered.map((v) => v.walletAddress!),
                        unregistered.map((v) => v.weight),
                      ),
                    record("voters/registration"),
                  );
                  await refresh();
                }}
              >
                Sign and register {unregistered.length} voter(s)
              </Button>
            </>
          )}
        </Step>

        <Step
          status={txStep === 5 && <TxStatusPanel state={tx.state} onRetryRecord={tx.retryRecord} />}
          n={5}
          title="Open voting"
          done={opened}
          active={e.status === "REGISTRATION" && registrationDone}
        >
          <p className="mb-3 text-sm text-slate-400">
            Signs <code className="text-slate-300">openSession(session)</code>. After this, voters and configuration are frozen.
            Votes are accepted from the start time until the end time.
          </p>
          {e.status === "REGISTRATION" && (
            <>
              {!registrationDone && <p className="mb-2 text-xs text-amber-300">Register all eligible voters on-chain first.</p>}
              {walletHint}
              <Button
                className="mt-2"
                disabled={!wallet.ready || !registrationDone || tx.busy}
                loading={tx.busy}
                onClick={async () => {
                  setTxStep(5);
                  await tx.run((c) => c.openSession(e.chain!.sessionId), record("open"));
                  await refresh();
                }}
              >
                Sign and open voting
              </Button>
            </>
          )}
        </Step>

        <Step
          status={txStep === 6 && <TxStatusPanel state={tx.state} onRetryRecord={tx.retryRecord} />}
          n={6}
          title="Close and finalize"
          done={e.status === "CLOSED"}
          active={canCloseNow}
        >
          <p className="mb-3 text-sm text-slate-400">
            Signs <code className="text-slate-300">closeSession(session)</code>. The contract only allows closing after the end
            time, or earlier if every registered voter has voted — an organizer cannot cut voting short.
          </p>
          {opened && e.status !== "CLOSED" && (
            <>
              {!canCloseNow && (
                <p className="mb-2 text-xs text-slate-400">
                  Not yet possible: {e.chain?.votesCast ?? 0} of {e.chain?.voterCount ?? 0} voters have voted and the end time has
                  not passed.
                </p>
              )}
              {walletHint}
              <Button
                className="mt-2"
                disabled={!wallet.ready || !canCloseNow || tx.busy}
                loading={tx.busy}
                onClick={async () => {
                  setTxStep(6);
                  await tx.run((c) => c.closeSession(e.chain!.sessionId), record("close"));
                  await refresh();
                }}
              >
                Sign and close
              </Button>
            </>
          )}
          {e.status === "CLOSED" && (
            <Link to={`/app/elections/${e.id}/results`} className="text-sm text-blue-300 hover:underline">
              View final results →
            </Link>
          )}
        </Step>
      </ol>
    </>
  );
}
