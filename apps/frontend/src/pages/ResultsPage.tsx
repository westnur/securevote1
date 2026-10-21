import { Link, useParams } from "react-router";
import { ResultsView } from "../components/ResultsView";
import { StatusBadge } from "../components/StatusBadge";
import { Alert, PageHeader, Spinner } from "../components/ui";
import { ApiError } from "../lib/api";
import { useElection, useResults } from "../lib/queries";

export function ResultsPage() {
  const { id = "" } = useParams();
  const election = useElection(id);
  const results = useResults(id, election.data?.status === "CLOSED");

  if (election.isLoading) return <Spinner label="Loading…" />;
  if (!election.data) return <Alert tone="red">{(election.error as Error)?.message ?? "Election not found"}</Alert>;
  const e = election.data;
  return (
    <>
      <PageHeader
        title={`Results: ${e.title}`}
        subtitle={
          <span className="flex items-center gap-2">
            <StatusBadge status={e.status} /> Final totals read from the smart contract
          </span>
        }
        actions={
          <Link
            to={`/app/elections/${e.id}`}
            className="rounded-md bg-navy-700 px-3 py-2 text-sm text-slate-100 hover:bg-navy-600"
          >
            Back to election
          </Link>
        }
      />
      {e.status !== "CLOSED" && (
        <Alert tone="blue" title="Results not available yet">
          Results are published only after the session is closed on-chain. Current status: {e.status.toLowerCase()}.
        </Alert>
      )}
      {results.isLoading && <Spinner label="Reading results from the contract…" />}
      {results.isError && (
        <Alert tone="red">{results.error instanceof ApiError ? results.error.message : String(results.error)}</Alert>
      )}
      {results.data && <ResultsView r={results.data} />}
    </>
  );
}
