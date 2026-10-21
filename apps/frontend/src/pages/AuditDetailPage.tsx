import { Link, useParams } from "react-router";
import { auditLabel } from "../components/AuditFeed";
import { StatusBadge } from "../components/StatusBadge";
import { Alert, Badge, Button, Card, Mono, PageHeader, Spinner, Table, td, th } from "../components/ui";
import { ApiError } from "../lib/api";
import { downloadFile, toCsv } from "../lib/csv";
import { formatDateTime, formatWeight, shortAddress, shortHash } from "../lib/format";
import { useAuditReport } from "../lib/queries";
import type { AuditReport } from "../lib/types";

const Check = ({ ok }: { ok: boolean | null | undefined }) =>
  ok === null || ok === undefined ? (
    <Badge>n/a</Badge>
  ) : ok ? (
    <Badge tone="green">match</Badge>
  ) : (
    <Badge tone="red">mismatch</Badge>
  );

function exportJson(r: AuditReport) {
  const report = {
    notice: "SYNTHETIC AUDIT REPORT — educational SecureVote prototype on a local Hardhat network. Not a real audit.",
    generatedAt: r.verification.generatedAt,
    election: { id: r.election.id, title: r.election.title, organization: r.election.organization.name, chain: r.election.chain },
    onChainConfig: r.onChainConfig,
    verification: r.verification,
    chainEvents: r.chainEvents,
    transactions: r.transactions,
    appEvents: r.appEvents,
  };
  downloadFile(`securevote-audit-${r.election.id}.json`, JSON.stringify(report, null, 2), "application/json");
}

function exportCsv(r: AuditReport) {
  const csv = toCsv(
    ["block", "logIndex", "timestamp", "event", "transactionHash", "arguments"],
    r.chainEvents.map((e) => [
      e.blockNumber,
      e.logIndex,
      e.timestamp ? new Date(e.timestamp * 1000).toISOString() : "",
      e.name,
      e.transactionHash,
      e.args,
    ]),
  );
  downloadFile(`securevote-events-${r.election.id}.csv`, csv, "text/csv");
}

export function AuditDetailPage() {
  const { id = "" } = useParams();
  const { data: r, isLoading, isError, error } = useAuditReport(id);
  if (isLoading) return <Spinner label="Collecting on-chain events…" />;
  if (isError || !r) return <Alert tone="red">{error instanceof ApiError ? error.message : "Audit data unavailable"}</Alert>;
  const cfg = r.verification.configMatchesDatabase;
  const totals = r.verification.totals;

  return (
    <>
      <PageHeader
        title={`Audit: ${r.election.title}`}
        subtitle={
          <span className="flex items-center gap-2">
            <StatusBadge status={r.election.status} /> Generated {formatDateTime(r.verification.generatedAt)}
          </span>
        }
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => exportJson(r)}>
              Export report (JSON)
            </Button>
            <Button variant="secondary" size="sm" onClick={() => exportCsv(r)}>
              Export events (CSV)
            </Button>
            {r.election.status === "CLOSED" && (
              <Link
                to={`/app/elections/${r.election.id}/results`}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-500"
              >
                Results
              </Link>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Result verification">
          {!totals ? (
            <p className="text-sm text-slate-400">Not available (session not on chain).</p>
          ) : (
            <>
              <Alert tone={totals.matches ? "green" : "red"} title={totals.matches ? "Totals verified" : "Totals do NOT match"}>
                Recount of public events {totals.matches ? "agrees" : "disagrees"} with contract storage.
              </Alert>
              <Table>
                <thead>
                  <tr>
                    <th className={th}>Metric</th>
                    <th className={th}>Contract</th>
                    <th className={th}>Event recount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className={td}>Registered voters</td>
                    <td className={td}>{totals.contract.voterCount}</td>
                    <td className={td}>{totals.recount.registeredVoters}</td>
                  </tr>
                  <tr>
                    <td className={td}>Votes cast</td>
                    <td className={td}>{totals.contract.votesCast}</td>
                    <td className={td}>{totals.recount.voteEvents}</td>
                  </tr>
                  <tr>
                    <td className={td}>Eligible weight</td>
                    <td className={td}>{formatWeight(totals.contract.totalEligibleWeight)}</td>
                    <td className={td}>{formatWeight(totals.recount.totalEligibleWeight)}</td>
                  </tr>
                  <tr>
                    <td className={td}>Voted weight</td>
                    <td className={td}>{formatWeight(totals.contract.totalVotedWeight)}</td>
                    <td className={td}>{formatWeight(totals.recount.totalVotedWeight)}</td>
                  </tr>
                  {r.onChainConfig?.optionLabels.map((label, i) => (
                    <tr key={label}>
                      <td className={td}>Weight: {label}</td>
                      <td className={td}>
                        {totals.contract.optionWeights ? formatWeight(totals.contract.optionWeights[i]) : "after close"}
                      </td>
                      <td className={td}>{formatWeight(totals.recount.optionWeights[i])}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className={td}>Duplicate voters in log</td>
                    <td className={td}>—</td>
                    <td className={td}>{totals.recount.duplicateVoters.length}</td>
                  </tr>
                </tbody>
              </Table>
            </>
          )}
        </Card>

        <Card title="Configuration: database vs. blockchain">
          {!cfg || !r.onChainConfig ? (
            <p className="text-sm text-slate-400">Not available.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th className={th}>Field</th>
                  <th className={th}>On-chain value</th>
                  <th className={th}>Check</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className={td}>Title</td>
                  <td className={td}>{r.onChainConfig.title}</td>
                  <td className={td}>
                    <Check ok={cfg.title} />
                  </td>
                </tr>
                <tr>
                  <td className={td}>Options</td>
                  <td className={td}>{r.onChainConfig.optionLabels.join(" · ")}</td>
                  <td className={td}>
                    <Check ok={cfg.options} />
                  </td>
                </tr>
                <tr>
                  <td className={td}>Start</td>
                  <td className={td}>{formatDateTime(r.onChainConfig.startTime)}</td>
                  <td className={td}>
                    <Check ok={cfg.startTime} />
                  </td>
                </tr>
                <tr>
                  <td className={td}>End</td>
                  <td className={td}>{formatDateTime(r.onChainConfig.endTime)}</td>
                  <td className={td}>
                    <Check ok={cfg.endTime} />
                  </td>
                </tr>
                <tr>
                  <td className={td}>Quorum</td>
                  <td className={td}>{r.onChainConfig.quorumBps / 100}%</td>
                  <td className={td}>
                    <Check ok={cfg.quorumBps} />
                  </td>
                </tr>
                <tr>
                  <td className={td}>Organizer</td>
                  <td className={td}>
                    <Mono value={r.onChainConfig.organizer} display={shortAddress(r.onChainConfig.organizer)} />
                  </td>
                  <td className={td}>—</td>
                </tr>
                <tr>
                  <td className={td}>State</td>
                  <td className={td}>{r.onChainConfig.state}</td>
                  <td className={td}>—</td>
                </tr>
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      <div className="mt-6 space-y-6">
        <Card title={`Contract events (${r.chainEvents.length})`}>
          <Table>
            <thead>
              <tr>
                <th className={th}>Block</th>
                <th className={th}>Event</th>
                <th className={th}>Details</th>
                <th className={th}>Transaction</th>
              </tr>
            </thead>
            <tbody>
              {r.chainEvents.map((ev) => (
                <tr key={`${ev.transactionHash}-${ev.logIndex}`}>
                  <td className={td}>{ev.blockNumber}</td>
                  <td className={td}>
                    <Badge tone={ev.name === "VoteCast" ? "blue" : ev.name === "SessionClosed" ? "green" : "violet"}>
                      {ev.name}
                    </Badge>
                  </td>
                  <td className={`${td} font-mono text-xs text-slate-400`}>
                    {Object.entries(ev.args)
                      .filter(([k]) => k !== "sessionId" && k !== "title" && k !== "optionLabels")
                      .map(
                        ([k, v]) =>
                          `${k}=${typeof v === "string" && v.startsWith("0x") && v.length === 42 ? shortAddress(v) : String(v)}`,
                      )
                      .join("  ")}
                  </td>
                  <td className={td}>
                    <Mono value={ev.transactionHash} display={shortHash(ev.transactionHash)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          <p className="mt-3 text-xs text-slate-500">
            Privacy note: VoteCast events publicly link each voter address to an option. This prototype does not provide a secret
            ballot.
          </p>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Transaction references (database)">
            <Table>
              <thead>
                <tr>
                  <th className={th}>Kind</th>
                  <th className={th}>Status</th>
                  <th className={th}>By</th>
                  <th className={th}>Tx</th>
                </tr>
              </thead>
              <tbody>
                {r.transactions.map((t) => (
                  <tr key={t.txHash}>
                    <td className={td}>{t.kind}</td>
                    <td className={td}>
                      <Badge tone={t.status === "CONFIRMED" ? "green" : t.status === "FAILED" ? "red" : "amber"}>
                        {t.status}
                      </Badge>
                      {t.error && <p className="text-xs text-rose-300">{t.error}</p>}
                    </td>
                    <td className={td}>{t.user}</td>
                    <td className={td}>
                      <Mono value={t.txHash} display={shortHash(t.txHash)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
          <Card title="Application audit log">
            <ul className="divide-y divide-navy-800 text-sm">
              {r.appEvents.map((a) => (
                <li key={a.id} className="flex justify-between gap-2 py-2">
                  <span className="text-slate-200">
                    {auditLabel(a.action)} {a.actor && <span className="text-slate-400">· {a.actor}</span>}
                  </span>
                  <time className="shrink-0 text-xs text-slate-500">{formatDateTime(a.createdAt)}</time>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
