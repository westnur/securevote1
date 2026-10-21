import { Link } from "react-router";
import type { AuditEventRow } from "../lib/types";
import { relativeTime } from "../lib/format";
import { EmptyState } from "./ui";

const LABELS: Record<string, string> = {
  AUTH_LOGIN: "Signed in",
  AUTH_LOGOUT: "Signed out",
  AUTH_LOGIN_FAILED: "Failed sign-in attempt",
  ELECTION_DRAFT_CREATED: "Draft created",
  ELECTION_DRAFT_UPDATED: "Draft updated",
  ELECTION_DRAFT_DELETED: "Draft deleted",
  ELIGIBILITY_LIST_UPDATED: "Eligibility list updated",
  ELECTION_PUBLISHED: "Published on-chain",
  VOTERS_REGISTERED_ON_CHAIN: "Voters registered on-chain",
  ELECTION_OPENED: "Voting opened",
  VOTE_RECORDED: "Vote recorded",
  ELECTION_CLOSED: "Election closed",
  TX_FAILED: "Transaction reverted",
  TX_VERIFICATION_FAILED: "Transaction verification failed",
  CHAIN_DB_MISMATCH: "Chain/database mismatch",
  ORGANIZER_ROLE_GRANTED: "Organizer role granted",
  ORGANIZER_ROLE_REVOKED: "Organizer role revoked",
  SEED_COMPLETED: "Synthetic demo data seeded",
};

export const auditLabel = (a: string) => LABELS[a] ?? a;

export function AuditFeed({ events }: { events: AuditEventRow[] }) {
  if (events.length === 0) return <EmptyState title="No audit events yet" />;
  return (
    <ul className="divide-y divide-navy-800">
      {events.map((e) => (
        <li key={e.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
          <div>
            <p className="text-slate-200">
              {auditLabel(e.action)}
              {e.actor && <span className="text-slate-400"> · {e.actor}</span>}
            </p>
            {e.election && (
              <Link to={`/app/elections/${e.election.id}`} className="text-xs text-blue-300 hover:underline">
                {e.election.title}
              </Link>
            )}
          </div>
          <time dateTime={e.createdAt} className="shrink-0 text-xs text-slate-500">
            {relativeTime(e.createdAt)}
          </time>
        </li>
      ))}
    </ul>
  );
}
