import type { Election, ElectionOption, Organization, PrismaClient } from "@prisma/client";
import { AppError, notFound } from "../lib/errors.js";
import type { ChainGateway, ChainSession } from "../lib/chain.js";
import type { AuthContext } from "../types/express.js";
import { canCloseElection, canViewAudit, canViewElection, canViewVoterList, isElectionOwner } from "./access.js";
import { compareConfig, deriveStatus, type ElectionStatus } from "./verification.js";

export const electionInclude = {
  options: { orderBy: { index: "asc" } },
  organization: true,
  createdBy: { select: { id: true, displayName: true, walletAddress: true } },
  _count: { select: { eligibility: true } },
} as const;

export type ElectionRecord = Election & {
  options: ElectionOption[];
  organization: Organization;
  createdBy: { id: string; displayName: string; walletAddress: string | null };
  _count: { eligibility: number };
};

export interface ChainView {
  session: ChainSession | null;
  error?: "CHAIN_UNAVAILABLE" | "CHAIN_SESSION_MISSING" | "CONTRACT_CHANGED" | "CONTRACT_NOT_DEPLOYED";
}

/** Read the authoritative lifecycle state for a published election from the contract. */
export async function loadChainView(chain: ChainGateway, e: Election): Promise<ChainView> {
  if (e.status !== "PUBLISHED" || !e.chainSessionId) return { session: null };
  try {
    const contract = await chain.requireContractAddress();
    if (e.contractAddress && e.contractAddress.toLowerCase() !== contract.toLowerCase()) {
      return { session: null, error: "CONTRACT_CHANGED" };
    }
    const session = await chain.getSession(e.chainSessionId);
    return session ? { session } : { session: null, error: "CHAIN_SESSION_MISSING" };
  } catch (err) {
    if (err instanceof AppError && err.code === "CONTRACT_NOT_DEPLOYED") return { session: null, error: "CONTRACT_NOT_DEPLOYED" };
    if (err instanceof AppError && err.status === 503) return { session: null, error: "CHAIN_UNAVAILABLE" };
    throw err;
  }
}

export function electionStatus(e: Election, view: ChainView): ElectionStatus {
  const unavailable = view.error === "CHAIN_UNAVAILABLE" || view.error === "CONTRACT_NOT_DEPLOYED";
  return deriveStatus(e.status, view.session, unavailable ? "CHAIN_UNAVAILABLE" : undefined, Math.floor(Date.now() / 1000));
}

export function toElectionDto(e: ElectionRecord, view: ChainView, auth: AuthContext, myWeight: number | null) {
  const status = electionStatus(e, view);
  const s = view.session;
  return {
    id: e.id,
    organization: { id: e.organization.id, name: e.organization.name },
    title: e.title,
    description: e.description,
    options: e.options.map((o) => ({ index: o.index, label: o.label })),
    startTime: e.startTime.toISOString(),
    endTime: e.endTime.toISOString(),
    quorumBps: e.quorumBps,
    status,
    dbStatus: e.status,
    createdBy: { id: e.createdBy.id, displayName: e.createdBy.displayName },
    createdAt: e.createdAt.toISOString(),
    publishedAt: e.publishedAt?.toISOString() ?? null,
    eligibleVoterCount: e._count.eligibility,
    myWeight,
    chain: e.chainSessionId
      ? {
          sessionId: e.chainSessionId,
          contractAddress: e.contractAddress,
          chainId: e.chainId,
          error: view.error ?? null,
          state: s?.state ?? null,
          organizer: s?.organizer ?? null,
          voterCount: s?.voterCount ?? null,
          votesCast: s?.votesCast ?? null,
          totalEligibleWeight: s?.totalEligibleWeight ?? null,
          totalVotedWeight: s?.totalVotedWeight ?? null,
          configMatchesDatabase: s
            ? compareConfig(
                {
                  title: e.title,
                  options: e.options.map((o) => o.label),
                  startTime: e.startTime,
                  endTime: e.endTime,
                  quorumBps: e.quorumBps,
                },
                s,
              ).allMatch
            : null,
        }
      : null,
    permissions: {
      canEditDraft: e.status === "DRAFT" && isElectionOwner(auth, e),
      canManage: isElectionOwner(auth, e),
      canClose: canCloseElection(auth, e),
      canViewVoters: canViewVoterList(auth, e),
      canViewAudit: canViewAudit(auth, e),
    },
  };
}

/** Load an election the current user is allowed to see. Unknown and hidden elections both return 404. */
export async function loadVisibleElection(prisma: PrismaClient, auth: AuthContext, id: string) {
  const election = (await prisma.election.findUnique({ where: { id }, include: electionInclude })) as ElectionRecord | null;
  if (!election) throw notFound("Election");
  const eligibility = await prisma.voterEligibility.findUnique({
    where: { electionId_userId: { electionId: id, userId: auth.user.id } },
  });
  if (!canViewElection(auth, election, !!eligibility)) throw notFound("Election");
  return { election, eligibility };
}
