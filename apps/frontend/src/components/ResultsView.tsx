import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Results } from "../lib/types";
import { formatWeight, shortHash } from "../lib/format";
import { Alert, Badge, Card, Mono, StatCard, Table, td, th } from "./ui";

export function ResultsView({ r }: { r: Results }) {
  const data = r.options.map((o) => ({ name: o.label, weight: Number(o.weight), leader: r.outcome.leaders.includes(o.index) }));
  return (
    <div className="space-y-6">
      <Alert tone={r.outcome.decided ? "green" : "amber"} title={r.outcome.decided ? "Decision adopted" : "No decision adopted"}>
        {r.outcome.summary}
      </Alert>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total eligible weight"
          value={formatWeight(r.totalEligibleWeight)}
          hint={`${r.voterCount} registered voters`}
        />
        <StatCard label="Participating weight" value={formatWeight(r.totalVotedWeight)} hint={`${r.votesCast} votes cast`} />
        <StatCard label="Turnout (by weight)" value={`${r.turnoutPercent}%`} />
        <StatCard
          label="Quorum"
          value={r.quorumReached ? "Reached" : "Not reached"}
          hint={`Required: ${r.quorumBps / 100}% of eligible weight`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Weighted totals">
          <div className="h-64" role="img" aria-label="Bar chart of voting weight per option">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <CartesianGrid stroke="#1e2d4d" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "#cbd5e1", fontSize: 12 }} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <Tooltip contentStyle={{ background: "#0b1324", border: "1px solid #2a3b60", color: "#e2e8f0" }} />
                <Bar dataKey="weight" name="Voting weight" radius={[4, 4, 0, 0]}>
                  {data.map((d) => (
                    <Cell key={d.name} fill={d.leader ? "#3b82f6" : "#475569"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Results table">
          <Table>
            <thead>
              <tr>
                <th className={th}>Option</th>
                <th className={th}>Weight</th>
                <th className={th}>Share</th>
                <th className={th}>Votes (head count)</th>
              </tr>
            </thead>
            <tbody>
              {r.options.map((o) => (
                <tr key={o.index}>
                  <td className={td}>
                    {o.label} {r.outcome.leaders.includes(o.index) && <Badge tone="blue">leading</Badge>}
                  </td>
                  <td className={td}>{formatWeight(o.weight)}</td>
                  <td className={td}>{o.weightPercent}%</td>
                  <td className={td}>{o.votes}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Counting method">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-300">
            <li>Each registered voter has a fixed weight, set before voting opened.</li>
            <li>The contract accepts at most one vote per wallet and adds the voter's full weight to the chosen option.</li>
            <li>
              The option with the largest total weight wins (plurality), provided the quorum is reached and there is no tie.
            </li>
            <li>Head-count votes are shown for comparison only; they do not decide the outcome.</li>
          </ul>
        </Card>
        <Card title="Verification and references">
          <dl className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-400">Independent event recount matches contract</dt>
              <dd>{r.verification.matchesContract ? <Badge tone="green">match</Badge> : <Badge tone="red">MISMATCH</Badge>}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-400">Vote events / registered voters</dt>
              <dd className="text-slate-200">
                {r.verification.voteEvents} / {r.verification.registeredVoters}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-400">Session / contract</dt>
              <dd>
                #{r.sessionId} · {r.contractAddress && <Mono value={r.contractAddress} display={shortHash(r.contractAddress)} />}
              </dd>
            </div>
            {r.closedBy && (
              <div className="flex items-center justify-between gap-2">
                <dt className="text-slate-400">Close transaction</dt>
                <dd>
                  <Mono value={r.closedBy.txHash} display={shortHash(r.closedBy.txHash)} />
                  {r.closedBy.blockNumber !== null && (
                    <span className="text-xs text-slate-500"> (block {r.closedBy.blockNumber})</span>
                  )}
                </dd>
              </div>
            )}
          </dl>
        </Card>
      </div>
    </div>
  );
}
