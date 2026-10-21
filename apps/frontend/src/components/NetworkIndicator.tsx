import { useHealth } from "../lib/queries";

export function NetworkIndicator() {
  const { data, isError } = useHealth();
  const ok = data?.status === "ok";
  const label = isError
    ? "API unreachable"
    : !data
      ? "Checking…"
      : ok
        ? `Hardhat local · #${data.blockchain.blockNumber}`
        : (data.blockchain.message ?? "Degraded");
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-400" title={data?.blockchain.message ?? undefined}>
      <span className={ok ? "text-emerald-400" : isError || data ? "text-rose-400" : "text-slate-500"} aria-hidden="true">
        ●
      </span>
      <span className="max-w-56 truncate">{label}</span>
    </span>
  );
}
