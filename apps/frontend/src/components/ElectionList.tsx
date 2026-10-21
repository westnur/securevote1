import { Link } from "react-router";
import type { Election } from "../lib/types";
import { formatDateTime, formatWeight, percentOf } from "../lib/format";
import { StatusBadge } from "./StatusBadge";
import { EmptyState, Table, td, th } from "./ui";

export function Participation({ e }: { e: Election }) {
  if (!e.chain || e.chain.voterCount === null) return <span className="text-slate-500">—</span>;
  const pct = percentOf(e.chain.totalVotedWeight, e.chain.totalEligibleWeight);
  return (
    <div className="min-w-28">
      <div className="h-1.5 w-full rounded bg-navy-700" aria-hidden="true">
        <div className="h-1.5 rounded bg-blue-500" style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <p className="mt-1 text-xs text-slate-400">
        {e.chain.votesCast}/{e.chain.voterCount} voters · {pct}% weight
      </p>
    </div>
  );
}

export function ElectionTable({ elections, empty }: { elections: Election[]; empty: string }) {
  if (elections.length === 0) return <EmptyState title={empty} />;
  return (
    <Table>
      <thead>
        <tr>
          <th className={th}>Election</th>
          <th className={th}>Status</th>
          <th className={th}>Voting window</th>
          <th className={th}>Your weight</th>
          <th className={th}>Participation</th>
        </tr>
      </thead>
      <tbody>
        {elections.map((e) => (
          <tr key={e.id} className="hover:bg-navy-850">
            <td className={td}>
              <Link to={`/app/elections/${e.id}`} className="font-medium text-blue-300 hover:underline">
                {e.title}
              </Link>
              <p className="text-xs text-slate-500">{e.organization.name}</p>
            </td>
            <td className={td}>
              <StatusBadge status={e.status} />
            </td>
            <td className={`${td} whitespace-nowrap text-xs text-slate-400`}>
              {formatDateTime(e.startTime)}
              <br />→ {formatDateTime(e.endTime)}
            </td>
            <td className={td}>{e.myWeight !== null ? formatWeight(e.myWeight) : <span className="text-slate-500">—</span>}</td>
            <td className={td}>
              <Participation e={e} />
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
