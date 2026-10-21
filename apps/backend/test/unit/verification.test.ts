import { describe, expect, it } from "vitest";
import type { ChainEvent } from "../../src/lib/chain.js";
import { compareConfig, computeOutcome, deriveStatus, percent, recountFromEvents } from "../../src/services/verification.js";

const ev = (name: string, args: ChainEvent["args"]): ChainEvent => ({
  name,
  args,
  blockNumber: 1,
  logIndex: 0,
  transactionHash: "0x",
  timestamp: 0,
});

const session = (state: "Created" | "Open" | "Closed") => ({
  id: "1",
  organizer: "0x0",
  title: "t",
  optionLabels: ["A", "B"],
  startTime: 100,
  endTime: 200,
  quorumBps: 0,
  state,
  voterCount: 0,
  votesCast: 0,
  totalEligibleWeight: "0",
  totalVotedWeight: "0",
});

describe("deriveStatus", () => {
  it("maps database and on-chain state to a display status", () => {
    expect(deriveStatus("DRAFT", null, undefined, 150)).toBe("DRAFT");
    expect(deriveStatus("PUBLISHED", null, "CHAIN_UNAVAILABLE", 150)).toBe("CHAIN_UNAVAILABLE");
    expect(deriveStatus("PUBLISHED", null, undefined, 150)).toBe("CHAIN_MISSING");
    expect(deriveStatus("PUBLISHED", session("Created"), undefined, 150)).toBe("REGISTRATION");
    expect(deriveStatus("PUBLISHED", session("Open"), undefined, 50)).toBe("SCHEDULED");
    expect(deriveStatus("PUBLISHED", session("Open"), undefined, 150)).toBe("ACTIVE");
    expect(deriveStatus("PUBLISHED", session("Open"), undefined, 200)).toBe("ENDED");
    expect(deriveStatus("PUBLISHED", session("Closed"), undefined, 150)).toBe("CLOSED");
  });
});

describe("recountFromEvents", () => {
  it("recomputes weighted totals from public events", () => {
    const r = recountFromEvents(
      [
        ev("VoterRegistered", { voter: "0xA", weight: "600" }),
        ev("VoterRegistered", { voter: "0xB", weight: "400" }),
        ev("VoteCast", { voter: "0xA", optionIndex: "1", weight: "600" }),
        ev("VoteCast", { voter: "0xB", optionIndex: "0", weight: "400" }),
      ],
      2,
    );
    expect(r.optionWeights).toEqual(["400", "600"]);
    expect(r.optionVotes).toEqual(["1", "1"]);
    expect(r.totalVotedWeight).toBe("1000");
    expect(r.totalEligibleWeight).toBe("1000");
    expect(r.duplicateVoters).toEqual([]);
  });

  it("flags duplicate voters if the event log ever contained them", () => {
    const r = recountFromEvents(
      [ev("VoteCast", { voter: "0xA", optionIndex: "0", weight: "1" }), ev("VoteCast", { voter: "0xa", optionIndex: "1", weight: "1" })],
      2,
    );
    expect(r.duplicateVoters).toEqual(["0xa"]);
  });
});

describe("computeOutcome", () => {
  it("declares the option with the largest weight when quorum is reached", () => {
    const o = computeOutcome(["Approve", "Reject"], ["300", "700"], true);
    expect(o).toMatchObject({ decided: true, leaders: [1], tie: false });
  });
  it("does not declare a winner on a tie, without quorum, or without votes", () => {
    expect(computeOutcome(["A", "B"], ["5", "5"], true)).toMatchObject({ decided: false, tie: true, leaders: [0, 1] });
    expect(computeOutcome(["A", "B"], ["9", "1"], false).decided).toBe(false);
    expect(computeOutcome(["A", "B"], ["0", "0"], true)).toMatchObject({ decided: false, leaders: [] });
  });
});

describe("compareConfig and percent", () => {
  it("detects any difference between database metadata and on-chain configuration", () => {
    const db = { title: "t", options: ["A", "B"], startTime: new Date(100_000), endTime: new Date(200_000), quorumBps: 0 };
    expect(compareConfig(db, session("Created")).allMatch).toBe(true);
    expect(compareConfig({ ...db, options: ["A", "C"] }, session("Created"))).toMatchObject({ options: false, allMatch: false });
  });
  it("computes percentages with bigint-safe arithmetic", () => {
    expect(percent("1", "3")).toBe(33.33);
    expect(percent("5", "0")).toBe(0);
    expect(percent("123456789012345678901234567890", "123456789012345678901234567890")).toBe(100);
  });
});
