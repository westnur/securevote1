import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { id as keccakId } from "ethers";
import { TxStatusPanel } from "../components/TxStatusPanel";
import { Alert, Badge, Button, Card, Mono, PageHeader, Select, Spinner, Table, td, th } from "../components/ui";
import { WalletControl } from "../components/WalletControl";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatWeight, shortAddress } from "../lib/format";
import { qk, useConfig, useHealth, useOrg } from "../lib/queries";
import type { OrgDetails, TxRecordResponse } from "../lib/types";
import { useTxFlow } from "../lib/useTxFlow";
import { useWallet } from "../lib/wallet";

const ORGANIZER_ROLE = keccakId("ORGANIZER_ROLE");

function MemberDirectory({ org }: { org: OrgDetails }) {
  const qc = useQueryClient();
  const wallet = useWallet();
  const tx = useTxFlow();
  const isAdmin = org.myRoles.includes("ADMIN");

  const change = async (userId: string, walletAddress: string, action: "grant" | "revoke") => {
    await tx.run(
      (c) => (action === "grant" ? c.grantRole(ORGANIZER_ROLE, walletAddress) : c.revokeRole(ORGANIZER_ROLE, walletAddress)),
      (txHash) =>
        api.post<TxRecordResponse>(`/api/organizations/${org.organization.id}/members/${userId}/organizer-role`, {
          action,
          txHash,
        }),
    );
    await qc.invalidateQueries({ queryKey: qk.org(org.organization.id) });
  };

  return (
    <>
      {isAdmin && (
        <div className="mb-4 space-y-2">
          <p className="text-sm text-slate-400">
            As administrator you grant or revoke ORGANIZER_ROLE on the contract with your own wallet; the backend verifies the
            RoleGranted/RoleRevoked event before updating the off-chain role. Auditors cannot become organizers (separation of
            duties).
          </p>
          {!wallet.ready && <p className="text-xs text-amber-300">Connect your wallet to change roles.</p>}
          <TxStatusPanel state={tx.state} onRetryRecord={tx.retryRecord} />
        </div>
      )}
      <Table>
        <thead>
          <tr>
            <th className={th}>Member (fictional)</th>
            <th className={th}>Roles</th>
            <th className={th}>Shares</th>
            <th className={th}>Test wallet</th>
            <th className={th}>On-chain organizer</th>
            {isAdmin && <th className={th}>Action</th>}
          </tr>
        </thead>
        <tbody>
          {org.members.map((m) => {
            const isOrganizer = m.roles.includes("ORGANIZER");
            const mismatch = m.onChainOrganizer !== null && m.onChainOrganizer !== isOrganizer;
            return (
              <tr key={m.userId}>
                <td className={td}>
                  {m.displayName}
                  {m.email && <p className="text-xs text-slate-500">{m.email}</p>}
                </td>
                <td className={td}>
                  <div className="flex flex-wrap gap-1">
                    {m.roles.map((r) => (
                      <Badge key={r}>{r.toLowerCase()}</Badge>
                    ))}
                  </div>
                </td>
                <td className={td}>{m.shareCount ? formatWeight(m.shareCount) : "—"}</td>
                <td className={td}>
                  {m.walletAddress && <Mono value={m.walletAddress} display={shortAddress(m.walletAddress)} />}
                </td>
                <td className={td}>
                  {m.onChainOrganizer === null ? "—" : m.onChainOrganizer ? <Badge tone="violet">yes</Badge> : "no"}
                  {mismatch && <p className="text-xs text-amber-300">differs from database role</p>}
                </td>
                {isAdmin && (
                  <td className={td}>
                    {m.walletAddress && !m.roles.includes("ADMIN") && (
                      <Button
                        size="sm"
                        variant={isOrganizer ? "danger" : "secondary"}
                        disabled={!wallet.ready || tx.busy || (!isOrganizer && m.roles.includes("AUDITOR"))}
                        title={
                          !isOrganizer && m.roles.includes("AUDITOR")
                            ? "Separation of duties: auditors cannot organize"
                            : undefined
                        }
                        onClick={() => void change(m.userId, m.walletAddress!, isOrganizer ? "revoke" : "grant")}
                      >
                        {isOrganizer ? "Revoke organizer" : "Grant organizer"}
                      </Button>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </Table>
    </>
  );
}

interface SystemInfo {
  server: { nodeVersion: string; uptimeSeconds: number; env: string };
  database: Record<string, number | boolean>;
  chain: {
    reachable: boolean;
    chainId: number | null;
    blockNumber: number | null;
    contractAddress: string | null;
    contractDeployed: boolean;
    adminWalletHasAdminRole: boolean | null;
  };
}

function SystemPanel() {
  const { data, isLoading, isError } = useQuery({ queryKey: qk.system, queryFn: () => api.get<SystemInfo>("/api/admin/system") });
  if (isLoading) return <Spinner />;
  if (isError || !data) return <Alert tone="red">System information unavailable.</Alert>;
  return (
    <dl className="grid gap-3 text-sm sm:grid-cols-2">
      {Object.entries(data.database).map(([k, v]) => (
        <div key={k} className="flex justify-between gap-2 border-b border-navy-800 pb-1">
          <dt className="text-slate-400">db.{k}</dt>
          <dd className="text-slate-200">{String(v)}</dd>
        </div>
      ))}
      <div className="flex justify-between gap-2 border-b border-navy-800 pb-1">
        <dt className="text-slate-400">Your wallet holds DEFAULT_ADMIN_ROLE</dt>
        <dd className="text-slate-200">{String(data.chain.adminWalletHasAdminRole)}</dd>
      </div>
      <div className="flex justify-between gap-2 border-b border-navy-800 pb-1">
        <dt className="text-slate-400">API runtime</dt>
        <dd className="text-slate-200">
          Node {data.server.nodeVersion} · up {Math.round(data.server.uptimeSeconds / 60)} min
        </dd>
      </div>
    </dl>
  );
}

export function SettingsPage() {
  const { me, hasRole } = useAuth();
  const [orgId, setOrgId] = useState(me?.memberships[0]?.organizationId);
  const org = useOrg(orgId);
  const health = useHealth();
  const config = useConfig();
  const wallet = useWallet();

  return (
    <>
      <PageHeader title="Organization & settings" subtitle="Demo organization, memberships, roles and local network status." />
      {(me?.memberships.length ?? 0) > 1 && (
        <div className="mb-4 max-w-sm">
          <label htmlFor="org-select" className="mb-1 block text-sm text-slate-300">
            Organization
          </label>
          <Select id="org-select" value={orgId} onChange={(e) => setOrgId(e.target.value)}>
            {me?.memberships.map((m) => (
              <option key={m.organizationId} value={m.organizationId}>
                {m.organizationName}
              </option>
            ))}
          </Select>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Organization (fictional)" className="lg:col-span-2">
          {org.isLoading && <Spinner />}
          {org.data && (
            <>
              <dl className="mb-5 grid gap-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-slate-400">Name</dt>
                  <dd className="text-white">{org.data.organization.name}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-400">Registration no. (synthetic)</dt>
                  <dd className="text-white">{org.data.organization.registrationNumber}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-400">Total voting units</dt>
                  <dd className="text-white">{formatWeight(org.data.organization.totalShares)}</dd>
                </div>
                <div className="sm:col-span-3">
                  <dt className="text-xs text-slate-400">Description</dt>
                  <dd className="text-slate-300">{org.data.organization.description}</dd>
                </div>
              </dl>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400">
                {org.data.members.length > 1 ? "Members and roles" : "Your membership"}
              </h3>
              <MemberDirectory org={org.data} />
            </>
          )}
        </Card>

        <div className="space-y-6">
          <Card title="Network status">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-400">API / database</dt>
                <dd>
                  {health.data ? (
                    <Badge tone={health.data.database === "ok" ? "green" : "red"}>{health.data.database}</Badge>
                  ) : (
                    "…"
                  )}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">Blockchain node</dt>
                <dd>
                  {health.data ? (
                    <Badge tone={health.data.blockchain.reachable ? "green" : "red"}>
                      {health.data.blockchain.reachable ? "reachable" : "offline"}
                    </Badge>
                  ) : (
                    "…"
                  )}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">Chain id</dt>
                <dd className="text-slate-200">{health.data?.blockchain.chainId ?? "—"} (Hardhat local)</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">Latest block</dt>
                <dd className="text-slate-200">{health.data?.blockchain.blockNumber ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-400">Contract</dt>
                <dd>
                  {config.data?.contractAddress ? (
                    <Mono value={config.data.contractAddress} display={shortAddress(config.data.contractAddress)} />
                  ) : (
                    "not deployed"
                  )}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">RPC endpoint</dt>
                <dd className="font-mono text-xs text-slate-300">{config.data?.rpcUrl}</dd>
              </div>
            </dl>
            {health.data?.blockchain.message && (
              <div className="mt-3">
                <Alert tone="amber">{health.data.blockchain.message}</Alert>
              </div>
            )}
          </Card>
          <Card title="Your local test wallet">
            <p className="mb-3 text-sm text-slate-400">
              Linked address: <span className="font-mono text-slate-200">{shortAddress(wallet.expectedAddress)}</span> (a public
              Hardhat test account — never send real funds to it).
            </p>
            <WalletControl compact />
          </Card>
          {hasRole("ADMIN") && (
            <Card title="System health (admin)">
              <SystemPanel />
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
