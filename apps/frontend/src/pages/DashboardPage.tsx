import { Link } from "react-router";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AuditFeed } from "../components/AuditFeed";
import { ElectionTable } from "../components/ElectionList";
import { Alert, Card, PageHeader, Spinner, StatCard } from "../components/ui";
import { useAuth } from "../lib/auth";
import { percentOf } from "../lib/format";
import { useElections, useHealth, useRecentAudit } from "../lib/queries";

export function DashboardPage() {
  const { me, hasRole } = useAuth();
  const elections = useElections();
  const audit = useRecentAudit(8);
  const health = useHealth();
  const list = elections.data ?? [];

  const active = list.filter((e) => e.status === "ACTIVE" || e.status === "ENDED");
  const upcoming = list.filter((e) => e.status === "REGISTRATION" || e.status === "SCHEDULED" || e.status === "DRAFT");
  const completed = list.filter((e) => e.status === "CLOSED");
  const onChain = list.filter((e) => e.chain?.voterCount);
  const avgTurnout = onChain.length
    ? Math.round(
        (onChain.reduce((s, e) => s + percentOf(e.chain!.totalVotedWeight, e.chain!.totalEligibleWeight), 0) / onChain.length) *
          10,
      ) / 10
    : null;
  const chartData = onChain.map((e) => ({
    name: e.title.length > 28 ? e.title.slice(0, 26) + "…" : e.title,
    weight: percentOf(e.chain!.totalVotedWeight, e.chain!.totalEligibleWeight),
    voters: e.chain!.voterCount ? Math.round((e.chain!.votesCast! / e.chain!.voterCount) * 1000) / 10 : 0,
  }));

  return (
    <>
      <PageHeader
        title={`Welcome, ${me?.user.displayName ?? ""}`}
        subtitle="Overview of the elections visible to your role. All data is synthetic."
        actions={
          hasRole("ORGANIZER") && (
            <Link
              to="/app/organizer"
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
            >
              New election
            </Link>
          )
        }
      />
      {health.data && health.data.status !== "ok" && (
        <div className="mb-6">
          <Alert tone="amber" title="Blockchain not ready">
            {health.data.blockchain.message ?? "The local blockchain is not fully available."}
          </Alert>
        </div>
      )}
      {elections.isError && (
        <div className="mb-6">
          <Alert tone="red" title="Could not load elections">
            {(elections.error as Error).message}
          </Alert>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active" value={elections.isLoading ? "…" : active.length} hint="Voting open or awaiting close" />
        <StatCard label="Upcoming" value={elections.isLoading ? "…" : upcoming.length} hint="Draft, registration or scheduled" />
        <StatCard label="Completed" value={elections.isLoading ? "…" : completed.length} hint="Closed with final results" />
        <StatCard
          label="Avg. participation"
          value={avgTurnout === null ? "—" : `${avgTurnout}%`}
          hint="Voted weight ÷ eligible weight (on-chain)"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Active elections">
            {elections.isLoading ? (
              <Spinner label="Loading…" />
            ) : (
              <ElectionTable elections={active} empty="No active elections" />
            )}
          </Card>
          <Card title="Upcoming elections">
            {elections.isLoading ? <Spinner /> : <ElectionTable elections={upcoming} empty="No upcoming elections" />}
          </Card>
          <Card title="Completed elections">
            {elections.isLoading ? <Spinner /> : <ElectionTable elections={completed} empty="No completed elections yet" />}
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Participation by election">
            {chartData.length === 0 ? (
              <p className="text-sm text-slate-400">No on-chain elections yet.</p>
            ) : (
              <div className="h-72" role="img" aria-label="Bar chart of participation percentage per election">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <CartesianGrid stroke="#1e2d4d" horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} tick={{ fill: "#94a3b8", fontSize: 11 }} unit="%" />
                    <YAxis type="category" dataKey="name" width={110} tick={{ fill: "#cbd5e1", fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: "#0b1324", border: "1px solid #2a3b60", color: "#e2e8f0" }} />
                    <Legend wrapperStyle={{ fontSize: 12, color: "#cbd5e1" }} />
                    <Bar dataKey="weight" name="Voted weight %" fill="#3b82f6" radius={[0, 3, 3, 0]} />
                    <Bar dataKey="voters" name="Voters who voted %" fill="#64748b" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
          <Card title="Recent audit events">{audit.isLoading ? <Spinner /> : <AuditFeed events={audit.data ?? []} />}</Card>
        </div>
      </div>
    </>
  );
}
