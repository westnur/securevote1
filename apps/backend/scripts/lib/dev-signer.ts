import { Contract, JsonRpcProvider } from "ethers";
import { secureVoteAbi } from "@securevote/contracts";

/**
 * DEVELOPMENT ONLY: returns the SecureVote contract connected to an UNLOCKED account of
 * the local Hardhat node. The node signs with its built-in public test keys; no private
 * key is handled by this code. This mirrors the frontend's "Hardhat dev account" signer.
 *
 * cacheTimeout: -1 disables ethers' 250 ms de-duplication of identical requests, which
 * would otherwise replay a stale failed gas estimate when an action is retried quickly.
 */
export async function signerContract(rpcUrl: string, contractAddress: string, account: string) {
  const provider = new JsonRpcProvider(rpcUrl, 31337, { staticNetwork: true, cacheTimeout: -1 });
  const signer = await provider.getSigner(account);
  return new Contract(contractAddress, secureVoteAbi, signer);
}
