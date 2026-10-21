import { Link, useParams } from "react-router";
import { Participation } from "../components/ElectionList";
import { StatusBadge } from "../components/StatusBadge";
import { VotePanel } from "../components/VotePanel";
import { Alert, Card, Mono, PageHeader, Spinner } from "../components/ui";
import { formatDateTime, formatWeight, shortAddress } from "../lib/format";
import { useElection, useEligibility } from "../lib/queries";

export function ElectionDetailPage() {
  const { id = "" } = useParams();
  const election = useElection(id);
  const eligibility = useEligibility(id, election.isSuccess);

  if (election.isLoading) return <Spinner label="Loading election…" />;
  if (election.isError || !election.data) {
    return (
      <Alert tone="red" title="Election not available">
        {(election.error as Error)?.message ?? "Not found"}
      </Alert>
    );
  }
  const e = election.data;

  return (
    <>
      <PageHeader
        title={e.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={e.status} /> {e.organization.name} · organized by {e.createdBy.displayName}
          </span>
        }
        actions={
          <>
            {e.permissions.canManage && (
              <Link
                to={`/app/organizer/elections/${e.id}`}
                className="rounded-md bg-navy-700 px-3 py-2 text-sm text-slate-100 hover:bg-navy-600"
              >
                Manage
              </Link>
            )}
            {e.permissions.canViewAudit && e.chain && (
              <Link
                to={`/app/audit/${e.id}`}
                className="rounded-md bg-navy-700 px-3 py-2 text-sm text-slate-100 hover:bg-navy-600"
              >
                Audit
              </Link>
            )}
            {e.status === "CLOSED" && (
              <Link
                to={`/app/elections/${e.id}/results`}
                className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-500"
              >
                Results
              </Link>
            )}
          </>
        }
      />
      {e.chain?.error && (
        <div className="mb-6">
          <Alert tone="red" title="Blockchain state unavailable">
            {e.chain.error === "CHAIN_SESSION_MISSING" || e.chain.error === "CONTRACT_CHANGED"
              ? "This election refers to a session that does not exist on the current local chain. The Hardhat node was probably restarted — redeploy and reset the database (see README)."
              : "The local blockchain node is not reachable."}
          </Alert>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="About this election">
            <p className="whitespace-pre-line text-sm text-slate-300">{e.description || "No description."}</p>
            <h3 className="mt-5 text-xs font-medium uppercase tracking-wider text-slate-400">Options</h3>
            <ol className="mt-2 space-y-1.5">
              {e.options.map((o) => (
                <li key={o.index} className="rounded-md border border-navy-700 px-3 py-2 text-sm text-slate-200">
                  <span className="mr-2 text-slate-500">#{o.index}</span>
                  {o.label}
                </li>
              ))}
            </ol>
          </Card>
          <Card title="Rules and schedule">
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-slate-400">Voting starts</dt>
                <dd className="text-white">{formatDateTime(e.startTime)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Voting ends</dt>
                <dd className="text-white">{formatDateTime(e.endTime)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Quorum (by weight)</dt>
                <dd className="text-white">{e.quorumBps / 100}% of eligible weight</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Counting method</dt>
                <dd className="text-white">Plurality of weighted votes</dd>
              </div>
              {e.chain && (
                <>
                  <div>
                    <dt className="text-xs text-slate-400">On-chain session</dt>
                    <dd className="text-white">
                      #{e.chain.sessionId} ·{" "}
                      <Mono value={e.chain.contractAddress ?? ""} display={shortAddress(e.chain.contractAddress)} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-400">Eligible weight / participation</dt>
                    <dd className="text-white">
                      {formatWeight(e.chain.totalEligibleWeight)}
                      <Participation e={e} />
                    </dd>
                  </div>
                </>
              )}
            </dl>
          </Card>
        </div>
        <Card title="Your ballot">
          {eligibility.isLoading && <Spinner label="Checking eligibility…" />}
          {eligibility.isError && <Alert tone="red">{(eligibility.error as Error).message}</Alert>}
          {eligibility.data && <VotePanel election={e} eligibility={eligibility.data} />}
        </Card>
      </div>
    </>
  );
}
