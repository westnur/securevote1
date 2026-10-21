import type { TxState } from "../lib/useTxFlow";
import { shortHash } from "../lib/format";
import { Alert, Button, Mono, Spinner } from "./ui";

const STEPS: { phase: TxState["phase"]; label: string }[] = [
  { phase: "signing", label: "Sign" },
  { phase: "mining", label: "Mined" },
  { phase: "recording", label: "Verified" },
  { phase: "confirmed", label: "Done" },
];

/** Shows the real state of a transaction. Success is displayed only after backend verification. */
export function TxStatusPanel({ state, onRetryRecord }: { state: TxState; onRetryRecord?: () => void }) {
  if (state.phase === "idle") return null;
  const current = STEPS.findIndex((s) => s.phase === state.phase);
  const tx = state.txHash && (
    <p className="mt-2 text-xs text-slate-400">
      Tx: <Mono value={state.txHash} display={shortHash(state.txHash)} />
      {state.blockNumber !== null && <span> · block {state.blockNumber}</span>}
    </p>
  );

  if (state.phase === "failed") {
    return (
      <Alert tone="red" title="Transaction failed">
        {state.message}
        {tx}
      </Alert>
    );
  }
  if (state.phase === "recordFailed") {
    return (
      <Alert tone="amber" title="Confirmed on-chain — not yet recorded">
        {state.message}
        {tx}
        {onRetryRecord && (
          <Button size="sm" variant="secondary" className="mt-2" onClick={onRetryRecord}>
            Retry recording
          </Button>
        )}
      </Alert>
    );
  }
  if (state.phase === "confirmed") {
    return (
      <Alert tone="green" title="Transaction confirmed">
        {state.message}
        {tx}
      </Alert>
    );
  }
  return (
    <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm text-blue-100" aria-live="polite">
      <div className="flex items-center gap-2">
        <Spinner className="h-4 w-4" />
        <span>{state.message}</span>
      </div>
      <ol className="mt-3 flex gap-2 text-xs">
        {STEPS.map((s, i) => (
          <li
            key={s.phase}
            className={i < current ? "text-emerald-300" : i === current ? "font-semibold text-white" : "text-slate-500"}
          >
            {i + 1}. {s.label}
          </li>
        ))}
      </ol>
      {tx}
      {state.phase === "recording" && onRetryRecord && state.message?.includes("pending") && (
        <Button size="sm" variant="secondary" className="mt-2" onClick={onRetryRecord}>
          Check again
        </Button>
      )}
    </div>
  );
}
