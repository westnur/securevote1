import { getAddress } from "ethers";
import type { PrismaClient, TxKind, TxStatus } from "@prisma/client";
import type { ChainEvent, ChainGateway } from "../lib/chain.js";
import { AppError, badRequest, conflict } from "../lib/errors.js";

/**
 * Verification of user-signed transactions.
 *
 * The frontend submits only a transaction HASH. The backend fetches the transaction and
 * its receipt from the node itself and checks: target contract, sender = the user's
 * registered wallet, success status, and (in the route) the expected event. Nothing in
 * the request body is trusted beyond the hash.
 */

export type TxCheck =
  | { status: "PENDING"; from: string }
  | { status: "FAILED"; from: string; blockNumber: number }
  | { status: "CONFIRMED"; from: string; blockNumber: number; events: ChainEvent[] };

export async function verifyUserTransaction(
  chain: ChainGateway,
  txHash: string,
  expectedFrom: string | readonly string[],
): Promise<TxCheck> {
  const inspection = await chain.inspectTransaction(txHash);
  if (!inspection.found) {
    throw badRequest("TX_NOT_FOUND", "Transaction not found on the local blockchain");
  }
  const contract = await chain.requireContractAddress();
  if (inspection.to !== contract) {
    throw badRequest("TX_WRONG_CONTRACT", "Transaction was not sent to the SecureVote contract");
  }
  const allowed = (Array.isArray(expectedFrom) ? expectedFrom : [expectedFrom]).map((a) => getAddress(a));
  if (!allowed.includes(inspection.from)) {
    throw new AppError(403, "TX_SENDER_MISMATCH", "Transaction was not sent from your registered wallet");
  }
  if (!inspection.receipt) return { status: "PENDING", from: inspection.from };
  if (inspection.receipt.status !== 1) {
    return { status: "FAILED", from: inspection.from, blockNumber: inspection.receipt.blockNumber };
  }
  return {
    status: "CONFIRMED",
    from: inspection.from,
    blockNumber: inspection.receipt.blockNumber,
    events: inspection.receipt.events,
  };
}

export interface RecordTxInput {
  txHash: string;
  kind: TxKind;
  status: TxStatus;
  chainId: number;
  fromAddress: string;
  userId: string;
  electionId?: string | null;
  blockNumber?: number | null;
  error?: string | null;
}

/**
 * Store a transaction reference. A hash can only belong to one (user, kind, election):
 * re-submitting the same hash is idempotent, re-using someone else's hash is rejected.
 */
export async function recordTransaction(prisma: PrismaClient, input: RecordTxInput) {
  const txHash = input.txHash.toLowerCase();
  const existing = await prisma.transactionReference.findUnique({ where: { txHash } });
  if (
    existing &&
    (existing.userId !== input.userId || existing.kind !== input.kind || existing.electionId !== (input.electionId ?? null))
  ) {
    throw conflict("TX_ALREADY_RECORDED", "This transaction has already been recorded for a different action");
  }
  const data = {
    status: input.status,
    blockNumber: input.blockNumber ?? null,
    error: input.error ?? null,
    fromAddress: input.fromAddress.toLowerCase(),
  };
  return prisma.transactionReference.upsert({
    where: { txHash },
    update: data,
    create: {
      ...data,
      txHash,
      kind: input.kind,
      chainId: input.chainId,
      userId: input.userId,
      electionId: input.electionId ?? null,
    },
  });
}
