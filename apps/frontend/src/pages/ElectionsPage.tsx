import { useMemo, useState } from "react";
import { ElectionTable } from "../components/ElectionList";
import { statusLabel } from "../components/StatusBadge";
import { Alert, Card, Input, PageHeader, Select, Spinner } from "../components/ui";
import { useElections } from "../lib/queries";
import type { ElectionStatus } from "../lib/types";

const FILTERS: (ElectionStatus | "ALL")[] = ["ALL", "DRAFT", "REGISTRATION", "SCHEDULED", "ACTIVE", "ENDED", "CLOSED"];

export function ElectionsPage() {
  const { data, isLoading, isError, error } = useElections();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<ElectionStatus | "ALL">("ALL");

  const filtered = useMemo(
    () =>
      (data ?? []).filter(
        (e) =>
          (status === "ALL" || e.status === status) &&
          (q.trim() === "" || `${e.title} ${e.organization.name}`.toLowerCase().includes(q.trim().toLowerCase())),
      ),
    [data, q, status],
  );

  return (
    <>
      <PageHeader
        title="Elections"
        subtitle="Elections you are allowed to see: drafts you own, or published sessions in your organization."
      />
      <Card>
        <div className="mb-4 flex flex-wrap gap-3">
          <div className="min-w-60 flex-1">
            <label htmlFor="search" className="sr-only">
              Search elections
            </label>
            <Input id="search" placeholder="Search by title or organization…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div>
            <label htmlFor="status" className="sr-only">
              Filter by status
            </label>
            <Select id="status" value={status} onChange={(e) => setStatus(e.target.value as ElectionStatus | "ALL")}>
              {FILTERS.map((f) => (
                <option key={f} value={f}>
                  {f === "ALL" ? "All statuses" : statusLabel(f)}
                </option>
              ))}
            </Select>
          </div>
        </div>
        {isLoading && <Spinner label="Loading elections…" />}
        {isError && <Alert tone="red">{(error as Error).message}</Alert>}
        {data && (
          <ElectionTable
            elections={filtered}
            empty={data.length ? "No elections match your filters" : "No elections available"}
          />
        )}
      </Card>
    </>
  );
}
