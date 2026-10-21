/** Types mirroring the backend REST API responses (see docs/API.md). */

export type Role = "ADMIN" | "ORGANIZER" | "SHAREHOLDER" | "AUDITOR";

export type ElectionStatus =
  "DRAFT" | "REGISTRATION" | "SCHEDULED" | "ACTIVE" | "ENDED" | "CLOSED" | "CHAIN_UNAVAILABLE" | "CHAIN_MISSING";

export interface Membership {
  organizationId: string;
  organizationName: string;
  roles: Role[];
  shareCount: number;
}

export interface Me {
  user: { id: string; email: string; displayName: string; walletAddress: string | null };
  memberships: Membership[];
}

export interface Election {
  id: string;
  organization: { id: string; name: string };
  title: string;
  description: string;
  options: { index: number; label: string }[];
  startTime: string;
  endTime: string;
  quorumBps: number;
  status: ElectionStatus;
  dbStatus: "DRAFT" | "PUBLISHED";
  createdBy: { id: string; displayName: string };
  createdAt: string;
  publishedAt: string | null;
  eligibleVoterCount: number;
  myWeight: number | null;
  chain: null | {
    sessionId: string;
    contractAddress: string | null;
    chainId: number | null;
    error: string | null;
    state: "Created" | "Open" | "Closed" | null;
    organizer: string | null;
    voterCount: number | null;
    votesCast: number | null;
    totalEligibleWeight: string | null;
    totalVotedWeight: string | null;
    configMatchesDatabase: boolean | null;
  };
  permissions: {
    canEditDraft: boolean;
    canManage: boolean;
    canClose: boolean;
    canViewVoters: boolean;
    canViewAudit: boolean;
  };
}

export type IneligibilityReason =
  | "NOT_ELIGIBLE"
  | "NO_WALLET"
  | "CHAIN_UNAVAILABLE"
  | "CHAIN_MISSING"
  | "NOT_OPEN"
  | "NOT_STARTED"
  | "ENDED"
  | "CLOSED"
  | "NOT_REGISTERED_ON_CHAIN"
  | "ALREADY_VOTED";

export interface Eligibility {
  electionId: string;
  status: ElectionStatus;
  eligible: boolean;
  weight: number | null;
  walletAddress: string | null;
  onChain: { registered: boolean; weight: string; hasVoted: boolean } | null;
  voteTransaction: {
    txHash: string;
    status: "PENDING" | "CONFIRMED" | "FAILED";
    blockNumber: number | null;
    createdAt: string;
  } | null;
  canVote: boolean;
  reason: IneligibilityReason | null;
}

export interface VoterRow {
  userId: string;
  displayName: string;
  walletAddress: string | null;
  weight: number;
  registeredTxHash: string | null;
  onChain: { registered: boolean; weight: string; hasVoted: boolean } | null;
}

export interface Candidate {
  userId: string;
  displayName: string;
  walletAddress: string | null;
  shareCount: number;
}

export interface Results {
  electionId: string;
  sessionId: string;
  contractAddress: string | null;
  options: { index: number; label: string; weight: string; votes: string; weightPercent: number }[];
  totalVotedWeight: string;
  totalEligibleWeight: string;
  turnoutPercent: number;
  votesCast: number;
  voterCount: number;
  quorumBps: number;
  quorumReached: boolean;
  outcome: { decided: boolean; leaders: number[]; tie: boolean; summary: string };
  verification: { method: string; matchesContract: boolean; voteEvents: number; registeredVoters: number };
  closedBy: { txHash: string; blockNumber: number | null } | null;
}

export interface ChainEvent {
  name: string;
  blockNumber: number;
  transactionHash: string;
  logIndex: number;
  timestamp: number | null;
  args: Record<string, string | string[] | number | boolean>;
}

export interface AuditReport {
  election: Election;
  onChainConfig: null | {
    id: string;
    organizer: string;
    title: string;
    optionLabels: string[];
    startTime: number;
    endTime: number;
    quorumBps: number;
    state: string;
    voterCount: number;
    votesCast: number;
    totalEligibleWeight: string;
    totalVotedWeight: string;
  };
  chainEvents: ChainEvent[];
  appEvents: { id: string; action: string; actor: string | null; details: unknown; createdAt: string }[];
  transactions: {
    txHash: string;
    kind: string;
    status: "PENDING" | "CONFIRMED" | "FAILED";
    blockNumber: number | null;
    from: string;
    user: string;
    error: string | null;
    createdAt: string;
  }[];
  verification: {
    configMatchesDatabase: null | Record<"title" | "options" | "startTime" | "endTime" | "quorumBps" | "allMatch", boolean>;
    totals: null | {
      matches: boolean;
      contract: {
        votesCast: number;
        voterCount: number;
        totalVotedWeight: string;
        totalEligibleWeight: string;
        optionWeights: string[] | null;
      };
      recount: {
        optionWeights: string[];
        optionVotes: string[];
        totalVotedWeight: string;
        totalEligibleWeight: string;
        registeredVoters: number;
        voteEvents: number;
        duplicateVoters: string[];
      };
    };
    generatedAt: string;
  };
}

export interface AuditEventRow {
  id: string;
  action: string;
  actor: string | null;
  election: { id: string; title: string } | null;
  details: unknown;
  createdAt: string;
}

export interface Health {
  status: "ok" | "degraded";
  database: string;
  blockchain: {
    reachable: boolean;
    chainId: number | null;
    blockNumber: number | null;
    contractDeployed: boolean;
    message: string | null;
  };
  time: string;
}

export interface PublicConfig {
  chainId: number;
  rpcUrl: string;
  contractAddress: string | null;
  demoMode: boolean;
}

export interface OrgDetails {
  organization: {
    id: string;
    name: string;
    slug: string;
    description: string;
    registrationNumber: string;
    totalShares: number;
  };
  myRoles: Role[];
  members: {
    userId: string;
    displayName: string;
    email?: string;
    walletAddress: string | null;
    roles: Role[];
    shareCount: number;
    onChainOrganizer: boolean | null;
  }[];
}

/** Response of every endpoint that records a user-signed transaction. */
export interface TxRecordResponse {
  status: "PENDING" | "CONFIRMED";
  txHash: string;
  blockNumber?: number;
  [key: string]: unknown;
}
