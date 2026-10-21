import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { defaultElectionValues, ElectionForm } from "../components/ElectionForm";
import { StatusBadge } from "../components/StatusBadge";
import { Alert, Card, EmptyState, PageHeader, Select, Spinner, Table, td, th } from "../components/ui";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatDateTime } from "../lib/format";
import { qk, useElections } from "../lib/queries";
import type { Election } from "../lib/types";

export function OrganizerPage() {
  const { me } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const elections = useElections();
  const orgs = me?.memberships.filter((m) => m.roles.includes("ORGANIZER")) ?? [];
  const [orgId, setOrgId] = useState(orgs[0]?.organizationId ?? "");
  const [error, setError] = useState<string | null>(null);
  const mine = (elections.data ?? []).filter((e) => e.permissions.canManage);

  return (
    <>
      <PageHeader
        title="Organizer dashboard"
        subtitle="Create elections, prepare the eligibility list and drive the on-chain lifecycle."
      />
      <div className="grid gap-6 xl:grid-cols-5">
        <div className="xl:col-span-3">
          <Card title="Your elections">
            {elections.isLoading && <Spinner />}
            {elections.data && mine.length === 0 && <EmptyState title="You have not created any elections yet" />}
            {mine.length > 0 && (
              <Table>
                <thead>
                  <tr>
                    <th className={th}>Title</th>
                    <th className={th}>Status</th>
                    <th className={th}>Ends</th>
                    <th className={th}>Voters</th>
                  </tr>
                </thead>
                <tbody>
                  {mine.map((e: Election) => (
                    <tr key={e.id}>
                      <td className={td}>
                        <Link to={`/app/organizer/elections/${e.id}`} className="font-medium text-blue-300 hover:underline">
                          {e.title}
                        </Link>
                      </td>
                      <td className={td}>
                        <StatusBadge status={e.status} />
                      </td>
                      <td className={`${td} text-xs text-slate-400`}>{formatDateTime(e.endTime)}</td>
                      <td className={td}>{e.chain?.voterCount ?? e.eligibleVoterCount}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>
        <div className="xl:col-span-2">
          <Card title="Create a new election (draft)">
            {orgs.length > 1 && (
              <div className="mb-4">
                <label htmlFor="org" className="mb-1 block text-sm text-slate-300">
                  Organization
                </label>
                <Select id="org" value={orgId} onChange={(e) => setOrgId(e.target.value)}>
                  {orgs.map((o) => (
                    <option key={o.organizationId} value={o.organizationId}>
                      {o.organizationName}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            {error && (
              <div className="mb-4">
                <Alert tone="red">{error}</Alert>
              </div>
            )}
            <ElectionForm
              initial={defaultElectionValues()}
              submitLabel="Create draft"
              onSubmit={async (payload) => {
                setError(null);
                try {
                  const res = await api.post<{ election: Election }>("/api/elections", { ...payload, organizationId: orgId });
                  await qc.invalidateQueries({ queryKey: qk.elections });
                  navigate(`/app/organizer/elections/${res.election.id}`);
                } catch (err) {
                  setError(
                    err instanceof ApiError
                      ? `${err.message}${err.details ? ": " + JSON.stringify(err.details) : ""}`
                      : String(err),
                  );
                }
              }}
            />
            <p className="mt-4 text-xs text-slate-500">
              Drafts are stored only in the database. Nothing is written to the blockchain until you publish the election.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
