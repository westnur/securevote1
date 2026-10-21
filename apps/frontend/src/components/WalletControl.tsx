import { useState } from "react";
import { useWallet } from "../lib/wallet";
import { shortAddress } from "../lib/format";
import { Badge, Button, cx } from "./ui";

/** Wallet connect menu shown in the top bar. */
export function WalletControl({ compact }: { compact?: boolean }) {
  const w = useWallet();
  const [open, setOpen] = useState(false);

  if (w.address) {
    return (
      <div className="flex items-center gap-2">
        <Badge tone="green">
          <span aria-hidden="true">●</span> {w.kind === "dev" ? "Dev account" : "Browser wallet"} {shortAddress(w.address)}
        </Badge>
        <Button size="sm" variant="ghost" onClick={w.disconnect}>
          Disconnect
        </Button>
      </div>
    );
  }
  return (
    <div className="relative">
      <Button size="sm" variant="secondary" onClick={() => setOpen((o) => !o)} aria-expanded={open} loading={w.connecting}>
        Connect wallet
      </Button>
      {open && (
        <div
          className={cx(
            "absolute right-0 z-40 mt-2 w-80 rounded-lg border border-navy-600 bg-navy-900 p-3 shadow-xl",
            compact && "w-72",
          )}
        >
          <p className="mb-2 text-xs text-slate-400">
            Linked test wallet: <span className="font-mono">{shortAddress(w.expectedAddress)}</span>. Only the local chain 31337
            is accepted.
          </p>
          <div className="space-y-2">
            <Button
              className="w-full"
              size="sm"
              disabled={!w.devSignerEnabled}
              title={w.devSignerEnabled ? undefined : "Disabled: set VITE_ENABLE_DEV_SIGNER=true for local demos"}
              onClick={() => {
                setOpen(false);
                void w.connect("dev");
              }}
            >
              Use Hardhat dev account (local demo)
            </Button>
            <Button
              className="w-full"
              size="sm"
              variant="secondary"
              disabled={!w.injectedAvailable}
              title={w.injectedAvailable ? undefined : "No browser wallet detected"}
              onClick={() => {
                setOpen(false);
                void w.connect("injected");
              }}
            >
              Use browser wallet (MetaMask)
            </Button>
          </div>
          <p className="mt-2 text-[11px] leading-snug text-slate-500">
            The dev account is signed by the local Hardhat node; no private key enters the browser. Never import a real wallet or
            real funds.
          </p>
        </div>
      )}
      {w.error && (
        <p
          role="alert"
          className="absolute right-0 mt-2 w-80 rounded-md border border-rose-500/40 bg-navy-900 p-2 text-xs text-rose-200"
        >
          {w.error}
        </p>
      )}
    </div>
  );
}
