import { useCallback, useState } from "react";
import type { Contract, ContractTransactionResponse } from "ethers";
import { ApiError } from "./api";
import { decodeTxError } from "./contractErrors";
import type { TxRecordResponse } from "./types";
import { useWallet } from "./wallet";

/**
 * Lifecycle of a user-signed transaction, shown honestly in the UI:
 *
 *   idle -> signing -> mining -> recording -> confirmed
 *                  \-> failed (rejected / reverted / RPC error / backend error)
 *
 * "confirmed" is only reached after BOTH the node returned a successful receipt AND
 * the backend verified the receipt and the expected event. If the chain confirms but
 * the backend cannot record it, the phase is "recordFailed" (with a retry), never success.
 */
export type TxPhase = "idle" | "signing" | "mining" | "recording" | "confirmed" | "failed" | "recordFailed";

export interface TxState {
  phase: TxPhase;
  txHash: string | null;
  blockNumber: number | null;
  message: string | null;
  result: TxRecordResponse | null;
}

const initial: TxState = { phase: "idle", txHash: null, blockNumber: null, message: null, result: null };

export function useTxFlow() {
  const wallet = useWallet();
  const [state, setState] = useState<TxState>(initial);
  const [lastRecord, setLastRecord] = useState<((hash: string) => Promise<TxRecordResponse>) | null>(null);

  const record = useCallback(async (hash: string, recordFn: (hash: string) => Promise<TxRecordResponse>) => {
    setState((s) => ({ ...s, phase: "recording", message: "Verifying the receipt with the SecureVote backend…" }));
    try {
      const result = await recordFn(hash);
      if (result.status === "PENDING") {
        setState((s) => ({ ...s, phase: "recording", message: "Backend sees the transaction as pending. Retry in a moment." }));
        return null;
      }
      setState((s) => ({
        ...s,
        phase: "confirmed",
        result,
        message: "Transaction confirmed on-chain and verified by the backend.",
      }));
      return result;
    } catch (err) {
      const msg = err instanceof ApiError ? `${err.message} (${err.code})` : String(err);
      setState((s) => ({
        ...s,
        phase: "recordFailed",
        message: `The transaction is on-chain, but the backend could not record it: ${msg}`,
      }));
      return null;
    }
  }, []);

  const run = useCallback(
    async (
      send: (contract: Contract) => Promise<ContractTransactionResponse>,
      recordFn: (hash: string) => Promise<TxRecordResponse>,
    ) => {
      setState({ ...initial, phase: "signing", message: "Confirm the transaction in your wallet…" });
      setLastRecord(() => recordFn);
      let hash: string;
      try {
        const contract = wallet.getWriteContract();
        const tx = await send(contract);
        hash = tx.hash;
        setState((s) => ({ ...s, phase: "mining", txHash: hash, message: "Transaction submitted. Waiting for the block…" }));
        const receipt = await tx.wait();
        if (!receipt || receipt.status !== 1) {
          setState((s) => ({ ...s, phase: "failed", message: "The transaction was reverted by the smart contract." }));
          return null;
        }
        setState((s) => ({ ...s, blockNumber: receipt.blockNumber }));
      } catch (err) {
        const decoded = decodeTxError(err);
        setState((s) => ({ ...s, phase: "failed", message: decoded.message }));
        return null;
      }
      return record(hash, recordFn);
    },
    [wallet, record],
  );

  const retryRecord = useCallback(async () => {
    if (state.txHash && lastRecord) await record(state.txHash, lastRecord);
  }, [state.txHash, lastRecord, record]);

  const reset = useCallback(() => setState(initial), []);
  const busy = state.phase === "signing" || state.phase === "mining" || state.phase === "recording";
  return { state, run, retryRecord, reset, busy };
}
