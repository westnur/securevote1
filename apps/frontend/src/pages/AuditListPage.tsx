import { Link } from "react-router";
import { StatusBadge } from "../components/StatusBadge";
import { Card, EmptyState, PageHeader, Spinner, Table, td, th } from "../components/ui";
import { formatDateTime } from "../lib/format";
import { useElections } from "../lib/queries";

export function AuditListPage() {
  const { data, isLoading } = useElections();
  const auditable = (data ?? []).filter((e) => e.permissions.canViewAudit && e.chain);
  return (
    <>
      <PageHeader
        title="Audit"
        subtitle="Inspect on-chain configuration, contract events and transaction references, and verify that totals agree."
      />
      <Card>
        {isLoading && <Spinner />}
        {data && auditable.length === 0 && <EmptyState title="No published elections to audit yet" />}
        {auditable.length > 0 && (
          <Table>
            <thead>
              <tr>
                <th className={th}>Election</th>
                <th className={th}>Status</th>
                <th className={th}>Session</th>
                <th className={th}>Published</th>
              </tr>
            </thead>
            <tbody>
              {auditable.map((e) => (
                <tr key={e.id}>
                  <td className={td}>
                    <Link to={`/app/audit/${e.id}`} className="font-medium text-blue-300 hover:underline">
                      {e.title}
                    </Link>
                  </td>
                  <td className={td}>
                    <StatusBadge status={e.status} />
                  </td>
                  <td className={td}>#{e.chain!.sessionId}</td>
                  <td className={`${td} text-xs text-slate-400`}>{formatDateTime(e.publishedAt)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
