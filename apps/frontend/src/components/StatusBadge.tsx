import type { ElectionStatus } from "../lib/types";
import { Badge } from "./ui";

const MAP: Record<
  ElectionStatus,
  { label: string; tone: "neutral" | "blue" | "green" | "amber" | "red" | "violet"; help: string }
> = {
  DRAFT: { label: "Draft", tone: "neutral", help: "Only stored off-chain; editable by its organizer" },
  REGISTRATION: { label: "Registration", tone: "violet", help: "On-chain; voters are being registered" },
  SCHEDULED: { label: "Scheduled", tone: "blue", help: "Opened on-chain; voting starts at the start time" },
  ACTIVE: { label: "Voting open", tone: "green", help: "Votes are accepted now" },
  ENDED: { label: "Ended — awaiting close", tone: "amber", help: "Voting window passed; organizer must close it" },
  CLOSED: { label: "Closed", tone: "neutral", help: "Final results available" },
  CHAIN_UNAVAILABLE: { label: "Chain unavailable", tone: "red", help: "Local blockchain node not reachable" },
  CHAIN_MISSING: { label: "Not on chain", tone: "red", help: "Session not found on the current chain (node restarted?)" },
};

export function StatusBadge({ status }: { status: ElectionStatus }) {
  const s = MAP[status];
  return (
    <span title={s.help}>
      <Badge tone={s.tone}>{s.label}</Badge>
    </span>
  );
}

export const statusLabel = (s: ElectionStatus) => MAP[s].label;
