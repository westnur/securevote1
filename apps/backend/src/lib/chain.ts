import fs from "node:fs";
import { Contract, Interface, JsonRpcProvider, Network, getAddress, id, type Log } from "ethers";
import { secureVoteAbi } from "@securevote/contracts";
import { AppError, chainUnavailable } from "./errors.js";
import { logger } from "./logger.js";

/**
 * Read-only access to the SecureVote contract on the LOCAL Hardhat node.
 *
 * The backend holds NO private keys and never signs transactions. It only reads
 * contract state and inspects receipts of transactions that users signed with their
 * own local test wallets.
 */

export type ChainState = "Created" | "Open" | "Closed";
const STATE_NAMES: Record<number, ChainState | undefined> = { 1: "Created", 2: "Open", 3: "Closed" };

export interface ChainSession {
  id: string;
  organizer: string;
  title: string;
  optionLabels: string[];
  startTime: number; // unix seconds
  endTime: number;
  quorumBps: number;
  state: ChainState;
  voterCount: number;
  votesCast: number;
  totalEligibleWeight: string; // uint256 as decimal string
  totalVotedWeight: string;
}

export interface ChainVoter {
  registered: boolean;
  weight: string;
  hasVoted: boolean;
}

export interface ChainResults {
  optionWeights: string[];
  optionVotes: string[];
  totalVotedWeight: string;
  totalEligibleWeight: string;
  quorumReached: boolean;
}

export interface ChainEvent {
  name: string;
  blockNumber: number;
  transactionHash: string;
  logIndex: number;
  timestamp: number | null;
  args: Record<string, string | string[] | number | boolean>;
}

export type TxInspection =
  | { found: false }
  | {
      found: true;
      from: string;
      to: string | null;
      receipt: null | { status: number; blockNumber: number; events: ChainEvent[] };
    };

export interface ChainStatus {
  reachable: boolean;
  chainId: number | null;
  blockNumber: number | null;
  contractAddress: string | null;
  contractDeployed: boolean;
  message?: string;
}

export interface ChainGateway {
  readonly chainId: number;
  status(): Promise<ChainStatus>;
  /** Throws AppError 503 if the contract is not configured or the node is unreachable. */
  requireContractAddress(): Promise<string>;
  getSession(sessionId: string): Promise<ChainSession | null>;
  getVoter(sessionId: string, address: string): Promise<ChainVoter>;
  getResults(sessionId: string): Promise<ChainResults>;
  getSessionEvents(sessionId: string): Promise<ChainEvent[]>;
  hasOrganizerRole(address: string): Promise<boolean>;
  isAdmin(address: string): Promise<boolean>;
  inspectTransaction(txHash: string): Promise<TxInspection>;
}

interface DeploymentInfo {
  address: string;
  deployBlock: number;
}

const iface = new Interface(secureVoteAbi);

/** Convert ethers Result args to JSON-safe primitives (bigint -> decimal string). */
function plainArgs(parsed: ReturnType<Interface["parseLog"]>): Record<string, string | string[] | number | boolean> {
  const out: Record<string, string | string[] | number | boolean> = {};
  if (!parsed) return out;
  parsed.fragment.inputs.forEach((input, i) => {
    const v = parsed.args[i];
    if (typeof v === "bigint") out[input.name] = v.toString();
    else if (Array.isArray(v) || (v && typeof v === "object" && "toArray" in v)) {
      out[input.name] = Array.from(v as Iterable<unknown>).map(String);
    } else if (typeof v === "boolean") out[input.name] = v;
    else out[input.name] = String(v);
  });
  return out;
}

function isConnectionError(err: unknown): boolean {
  const e = err as { code?: string; message?: string; error?: { code?: string } };
  const msg = String(e?.message ?? "");
  return (
    e?.code === "ECONNREFUSED" ||
    e?.error?.code === "ECONNREFUSED" ||
    msg.includes("ECONNREFUSED") ||
    msg.includes("fetch failed") ||
    e?.code === "TIMEOUT" ||
    (e?.code === "UNKNOWN_ERROR" && msg.includes("connect"))
  );
}

function isCallException(err: unknown): boolean {
  return (err as { code?: string })?.code === "CALL_EXCEPTION";
}

export class EthersChainGateway implements ChainGateway {
  private readonly provider: JsonRpcProvider;
  private deployment: DeploymentInfo | null = null;

  constructor(
    rpcUrl: string,
    public readonly chainId: number,
    private readonly opts: { contractAddress?: string; deploymentFile?: string } = {},
  ) {
    // staticNetwork: never auto-detect (avoids endless retry loops when the node is down)
    this.provider = new JsonRpcProvider(rpcUrl, chainId, {
      staticNetwork: Network.from(chainId),
      batchMaxCount: 1,
      cacheTimeout: -1, // always ask the node; never serve a de-duplicated stale response
    });
  }

  /** Resolve the contract address from env or from the deployment file (re-read lazily). */
  private resolveDeployment(): DeploymentInfo | null {
    if (this.opts.contractAddress) {
      return { address: getAddress(this.opts.contractAddress), deployBlock: 0 };
    }
    const file = this.opts.deploymentFile;
    if (!file || !fs.existsSync(file)) return null;
    try {
      const json = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<DeploymentInfo> & { chainId?: number };
      if (!json.address || json.chainId !== this.chainId) return null;
      return { address: getAddress(json.address), deployBlock: Number(json.deployBlock ?? 0) };
    } catch (err) {
      logger.warn("Could not read deployment file", { error: String(err) });
      return null;
    }
  }

  private async withChain<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof AppError) throw err;
      if (isConnectionError(err)) throw chainUnavailable();
      throw err;
    }
  }

  private contractFor(address: string) {
    return new Contract(address, secureVoteAbi, this.provider);
  }

  async status(): Promise<ChainStatus> {
    this.deployment = this.resolveDeployment();
    try {
      const [blockNumber, network] = await Promise.all([this.provider.getBlockNumber(), this.provider.send("eth_chainId", [])]);
      const chainId = Number(network);
      let contractDeployed = false;
      if (this.deployment) {
        const code = await this.provider.getCode(this.deployment.address);
        contractDeployed = code !== "0x";
      }
      return {
        reachable: true,
        chainId,
        blockNumber,
        contractAddress: this.deployment?.address ?? null,
        contractDeployed,
        message: !this.deployment
          ? "Contract not deployed yet. Run `npm run chain:deploy`."
          : !contractDeployed
            ? "No contract code at the configured address — the local node was probably restarted. Run `npm run chain:deploy` and `npm run db:reset`."
            : chainId !== this.chainId
              ? `Unexpected chain id ${chainId}`
              : undefined,
      };
    } catch (err) {
      if (!isConnectionError(err)) logger.warn("Chain status check failed", { error: String(err) });
      return {
        reachable: false,
        chainId: null,
        blockNumber: null,
        contractAddress: this.deployment?.address ?? null,
        contractDeployed: false,
        message: "Local blockchain node is not reachable. Start it with `npm run chain:node`.",
      };
    }
  }

  async requireContractAddress(): Promise<string> {
    if (!this.deployment) this.deployment = this.resolveDeployment();
    if (!this.deployment) {
      throw new AppError(503, "CONTRACT_NOT_DEPLOYED", "SecureVote contract is not deployed. Run `npm run chain:deploy`.");
    }
    return this.deployment.address;
  }

  async getSession(sessionId: string): Promise<ChainSession | null> {
    const address = await this.requireContractAddress();
    return this.withChain(async () => {
      try {
        const s = await this.contractFor(address).getSession(BigInt(sessionId));
        return {
          id: s.id.toString(),
          organizer: getAddress(s.organizer),
          title: s.title,
          optionLabels: Array.from(s.optionLabels as string[]),
          startTime: Number(s.startTime),
          endTime: Number(s.endTime),
          quorumBps: Number(s.quorumBps),
          state: STATE_NAMES[Number(s.state)] ?? "Created",
          voterCount: Number(s.voterCount),
          votesCast: Number(s.votesCast),
          totalEligibleWeight: s.totalEligibleWeight.toString(),
          totalVotedWeight: s.totalVotedWeight.toString(),
        };
      } catch (err) {
        // SessionNotFound revert, or no contract code at the address (BAD_DATA)
        if (isCallException(err) || (err as { code?: string })?.code === "BAD_DATA") return null;
        throw err;
      }
    });
  }

  async getVoter(sessionId: string, voter: string): Promise<ChainVoter> {
    const address = await this.requireContractAddress();
    return this.withChain(async () => {
      const [registered, weight, hasVoted] = await this.contractFor(address).getVoter(BigInt(sessionId), getAddress(voter));
      return { registered: Boolean(registered), weight: weight.toString(), hasVoted: Boolean(hasVoted) };
    });
  }

  async getResults(sessionId: string): Promise<ChainResults> {
    const address = await this.requireContractAddress();
    return this.withChain(async () => {
      const r = await this.contractFor(address).getResults(BigInt(sessionId));
      return {
        optionWeights: Array.from(r.optionWeights as bigint[]).map(String),
        optionVotes: Array.from(r.optionVotes as bigint[]).map(String),
        totalVotedWeight: r.totalVotedWeight.toString(),
        totalEligibleWeight: r.totalEligibleWeight.toString(),
        quorumReached: Boolean(r.quorumReached),
      };
    });
  }

  private async toEvents(logs: Log[]): Promise<ChainEvent[]> {
    const timestamps = new Map<number, number | null>();
    for (const bn of new Set(logs.map((l) => l.blockNumber))) {
      const block = await this.provider.getBlock(bn);
      timestamps.set(bn, block ? block.timestamp : null);
    }
    const events: ChainEvent[] = [];
    for (const log of logs) {
      const parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
      if (!parsed) continue;
      events.push({
        name: parsed.name,
        blockNumber: log.blockNumber,
        transactionHash: log.transactionHash,
        logIndex: log.index,
        timestamp: timestamps.get(log.blockNumber) ?? null,
        args: plainArgs(parsed),
      });
    }
    return events.sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);
  }

  async getSessionEvents(sessionId: string): Promise<ChainEvent[]> {
    const address = await this.requireContractAddress();
    return this.withChain(async () => {
      const topicId = "0x" + BigInt(sessionId).toString(16).padStart(64, "0");
      const logs = await this.provider.getLogs({
        address,
        fromBlock: this.deployment?.deployBlock ?? 0,
        toBlock: "latest",
        // every session-scoped event has sessionId as its first indexed topic
        topics: [null, topicId],
      });
      return this.toEvents(logs);
    });
  }

  async hasOrganizerRole(account: string): Promise<boolean> {
    const address = await this.requireContractAddress();
    return this.withChain(async () => {
      const c = this.contractFor(address);
      return Boolean(await c.hasRole(await c.ORGANIZER_ROLE(), getAddress(account)));
    });
  }

  async isAdmin(account: string): Promise<boolean> {
    const address = await this.requireContractAddress();
    return this.withChain(async () => {
      const c = this.contractFor(address);
      return Boolean(await c.hasRole(await c.DEFAULT_ADMIN_ROLE(), getAddress(account)));
    });
  }

  async inspectTransaction(txHash: string): Promise<TxInspection> {
    const address = await this.requireContractAddress();
    return this.withChain(async () => {
      const tx = await this.provider.getTransaction(txHash);
      if (!tx) return { found: false } as const;
      const receipt = await this.provider.getTransactionReceipt(txHash);
      const contractLogs = receipt ? receipt.logs.filter((l) => getAddress(l.address) === address) : [];
      return {
        found: true,
        from: getAddress(tx.from),
        to: tx.to ? getAddress(tx.to) : null,
        receipt: receipt
          ? { status: receipt.status ?? 0, blockNumber: receipt.blockNumber, events: await this.toEvents(contractLogs) }
          : null,
      };
    });
  }
}

/** keccak256("ORGANIZER_ROLE") — used to recognise RoleGranted/RoleRevoked events. */
export const ORGANIZER_ROLE_ID = id("ORGANIZER_ROLE");
