import { describe, expect, it } from "vitest";
import { Interface } from "ethers";
import { secureVoteAbi } from "@securevote/contracts";
import { decodeTxError } from "./contractErrors";

const iface = new Interface(secureVoteAbi);

describe("decodeTxError", () => {
  it("decodes a duplicate-vote custom error from raw revert data", () => {
    const data = iface.encodeErrorResult("AlreadyVoted", [1n, "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"]);
    const d = decodeTxError({ code: "CALL_EXCEPTION", data, message: "execution reverted (unknown custom error)" });
    expect(d).toMatchObject({ kind: "contract", name: "AlreadyVoted" });
    expect(d.message).toMatch(/Duplicate vote rejected/);
  });

  it("finds revert data nested inside provider errors", () => {
    const data = iface.encodeErrorResult("NotEligible", [3n, "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"]);
    expect(decodeTxError({ info: { error: { data } } }).name).toBe("NotEligible");
  });

  it("recognises a user rejection in the wallet", () => {
    expect(decodeTxError({ code: "ACTION_REJECTED" }).kind).toBe("rejected");
    expect(decodeTxError({ code: 4001 }).kind).toBe("rejected");
  });

  it("explains RPC connection failures", () => {
    expect(decodeTxError(new Error("Failed to fetch")).kind).toBe("network");
  });
});
