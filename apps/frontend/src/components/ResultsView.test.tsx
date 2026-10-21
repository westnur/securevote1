import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ResultsView } from "./ResultsView";
import type { Results } from "../lib/types";

const results: Results = {
  electionId: "e1",
  sessionId: "7",
  contractAddress: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  options: [
    { index: 0, label: "Approve", weight: "5000", votes: "2", weightPercent: 55.55 },
    { index: 1, label: "Reject", weight: "4000", votes: "1", weightPercent: 44.44 },
  ],
  totalVotedWeight: "9000",
  totalEligibleWeight: "10000",
  turnoutPercent: 90,
  votesCast: 3,
  voterCount: 4,
  quorumBps: 5000,
  quorumReached: true,
  outcome: { decided: true, leaders: [0], tie: false, summary: '"Approve" received the largest voting weight.' },
  verification: { method: "recount", matchesContract: true, voteEvents: 3, registeredVoters: 4 },
  closedBy: { txHash: "0x" + "cd".repeat(32), blockNumber: 12 },
};

describe("ResultsView", () => {
  it("shows weighted totals, turnout, quorum and the outcome", () => {
    render(<ResultsView r={results} />);
    expect(screen.getByText("Decision adopted")).toBeInTheDocument();
    expect(screen.getByText("10,000")).toBeInTheDocument();
    expect(screen.getByText("9,000")).toBeInTheDocument();
    expect(screen.getByText("90%")).toBeInTheDocument();
    expect(screen.getByText("Reached")).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /Approve/ })).toHaveTextContent("5,000");
    expect(screen.getByText("match")).toBeInTheDocument();
  });

  it("makes a verification mismatch and missing quorum obvious", () => {
    render(
      <ResultsView
        r={{
          ...results,
          quorumReached: false,
          outcome: { decided: false, leaders: [0], tie: false, summary: "Quorum was not reached — no decision can be adopted." },
          verification: { ...results.verification, matchesContract: false },
        }}
      />,
    );
    expect(screen.getByText("No decision adopted")).toBeInTheDocument();
    expect(screen.getByText("Not reached")).toBeInTheDocument();
    expect(screen.getByText("MISMATCH")).toBeInTheDocument();
  });
});
