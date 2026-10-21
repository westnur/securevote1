/**
 * Wallet connection for the LOCAL Hardhat network (chain id 31337).
 *
 * Two connectors:
 *  - "injected": a browser wallet such as MetaMask (EIP-1193). The private key stays in
 *    the wallet; the user confirms each transaction there.
 *  - "dev": DEVELOPMENT ONLY. Uses an unlocked account of the local Hardhat node via
 *    eth_sendTransaction, so no private key ever exists in the browser. It is only
 *    available when VITE_ENABLE_DEV_SIGNER=true and the node reports chain 31337.
 *
 * In both cases the connected address must equal the wallet linked to the user's
 * account; the backend and the contract re-check this independently.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { BrowserProvider, Contract, JsonRpcProvider, getAddress, type Signer } from "ethers";
import { secureVoteAbi } from "@securevote/contracts";
import { useAuth } from "./auth";
import { useConfig } from "./queries";

export const LOCAL_CHAIN_ID = 31337;
export type ConnectorKind = "dev" | "injected";

interface WalletValue {
  kind: ConnectorKind | null;
  address: string | null;
  expectedAddress: string | null;
  connecting: boolean;
  error: string | null;
  devSignerEnabled: boolean;
  injectedAvailable: boolean;
  ready: boolean;
  connect: (kind: ConnectorKind) => Promise<void>;
  disconnect: () => void;
  /** SecureVote contract bound to the connected signer. Throws if not ready. */
  getWriteContract: () => Contract;
}

const WalletContext = createContext<WalletValue | null>(null);
const STORAGE_KEY = "securevote.wallet.kind"; // only the connector TYPE is remembered, never keys

export function WalletProvider({ children }: { children: ReactNode }) {
  const { me } = useAuth();
  const { data: config } = useConfig();
  const [kind, setKind] = useState<ConnectorKind | null>(null);
  const [signer, setSigner] = useState<Signer | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const devSignerEnabled = import.meta.env.VITE_ENABLE_DEV_SIGNER === "true";
  const injectedAvailable = typeof window !== "undefined" && !!window.ethereum;
  const expectedAddress = me?.user.walletAddress ? getAddress(me.user.walletAddress) : null;

  const resetState = useCallback(() => {
    setKind(null);
    setSigner(null);
    setAddress(null);
    setError(null);
  }, []);

  /** Explicit user action: also forget the remembered connector type. */
  const disconnect = useCallback(() => {
    resetState();
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, [resetState]);

  const connect = useCallback(
    async (k: ConnectorKind) => {
      setConnecting(true);
      setError(null);
      try {
        if (!config) throw new Error("Configuration not loaded yet");
        if (!expectedAddress) throw new Error("No local test wallet is linked to your account.");
        let s: Signer;
        if (k === "dev") {
          if (!devSignerEnabled) throw new Error("The development signer is disabled (VITE_ENABLE_DEV_SIGNER).");
          // cacheTimeout -1: never reuse a de-duplicated (possibly stale) RPC response
          const provider = new JsonRpcProvider(config.rpcUrl, undefined, { cacheTimeout: -1 });
          const net = await provider.getNetwork().catch(() => {
            throw new Error(`Cannot reach the local blockchain at ${config.rpcUrl}. Is \`npm run chain:node\` running?`);
          });
          if (Number(net.chainId) !== LOCAL_CHAIN_ID) {
            throw new Error(`Refusing to use the dev signer on chain ${net.chainId}; only the local chain 31337 is allowed.`);
          }
          const accounts = (await provider.send("eth_accounts", [])) as string[];
          if (!accounts.map((a) => a.toLowerCase()).includes(expectedAddress.toLowerCase())) {
            throw new Error("Your linked test account is not unlocked on this local node.");
          }
          s = await provider.getSigner(expectedAddress);
        } else {
          if (!window.ethereum) throw new Error("No browser wallet (e.g. MetaMask) detected.");
          const provider = new BrowserProvider(window.ethereum, "any");
          await provider.send("eth_requestAccounts", []);
          const net = await provider.getNetwork();
          if (Number(net.chainId) !== LOCAL_CHAIN_ID) {
            throw new Error(
              `Your wallet is on chain ${net.chainId}. Switch it to the local Hardhat network (chain id 31337, RPC ${config.rpcUrl}).`,
            );
          }
          s = await provider.getSigner();
        }
        const addr = getAddress(await s.getAddress());
        if (addr !== expectedAddress) {
          throw new Error(`Connected wallet ${addr} does not match the wallet linked to your account (${expectedAddress}).`);
        }
        setSigner(s);
        setAddress(addr);
        setKind(k);
        try {
          localStorage.setItem(STORAGE_KEY, k);
        } catch {
          /* ignore */
        }
      } catch (err) {
        setSigner(null);
        setAddress(null);
        setKind(null);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setConnecting(false);
      }
    },
    [config, expectedAddress, devSignerEnabled],
  );

  // Reset on user change; auto-reconnect the previously chosen connector type
  // (only the dev connector, which needs no wallet pop-up).
  useEffect(() => {
    resetState();
    if (!me || !config) return;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    if (saved === "dev" && devSignerEnabled) void connect("dev");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.user.id, config?.contractAddress]);

  // React to account/network changes in browser wallets.
  useEffect(() => {
    if (kind !== "injected" || !window.ethereum?.on) return;
    const handler = () => resetState();
    window.ethereum.on("accountsChanged", handler);
    window.ethereum.on("chainChanged", handler);
    return () => {
      window.ethereum?.removeListener?.("accountsChanged", handler);
      window.ethereum?.removeListener?.("chainChanged", handler);
    };
  }, [kind, resetState]);

  const value = useMemo<WalletValue>(
    () => ({
      kind,
      address,
      expectedAddress,
      connecting,
      error,
      devSignerEnabled,
      injectedAvailable,
      ready: !!signer && !!config?.contractAddress,
      connect,
      disconnect,
      getWriteContract: () => {
        if (!signer) throw new Error("Connect your local test wallet first.");
        if (!config?.contractAddress) throw new Error("The SecureVote contract is not deployed. Run `npm run chain:deploy`.");
        return new Contract(config.contractAddress, secureVoteAbi, signer);
      },
    }),
    [kind, address, expectedAddress, connecting, error, devSignerEnabled, injectedAvailable, signer, config, connect, disconnect],
  );
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside WalletProvider");
  return ctx;
}
