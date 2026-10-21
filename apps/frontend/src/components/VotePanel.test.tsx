import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Election, Eligibility } from "../lib/types";
import { VotePanel } from "./VotePanel";

const run = vi.fn();
const wallet = { ready: true };
vi.mock("../lib/wallet", () => ({ useWallet: () => wallet }));
vi.mock("../lib/useTxFlow", () => ({
  useTxFlow: () => ({
    state: { phase: "idle", txHash: null, blockNumber: null, message: null, result: null },
    run,
    retryRecord: vi.fn(),
    reset: vi.fn(),
    busy: false,
  }),
}));

const election = {
  id: "e1",
  title: "Dividend policy",
  options: [
    { index: 0, label: "Approve" },
    { index: 1, label: "Reject" },
  ],
  status: "ACTIVE",
  chain: { sessionId: "3" },
} as unknown as Election;

const eligible: Eligibility = {
  electionId: "e1",
  status: "ACTIVE",
  eligible: true,
  weight: 4000,
  walletAddress: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  onChain: { registered: true, weight: "4000", hasVoted: false },
  voteTransaction: null,
  canVote: true,
  reason: null,
};

function renderPanel(e: Eligibility) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <VotePanel election={election} eligibility={e} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("VotePanel", () => {
  beforeEach(() => {
    run.mockReset();
    wallet.ready = true;
  });

  it("shows the voter's weight and requires choosing an option before signing", async () => {
    renderPanel(eligible);
    expect(screen.getByText("4,000")).toBeInTheDocument();
    const review = screen.getByRole("button", { name: "Review and sign vote" });
    expect(review).toBeDisabled();
    await userEvent.click(screen.getByRole("radio", { name: "Reject" }));
    expect(review).toBeEnabled();
  });

  it("asks for confirmation, warns about the transparent ballot, then signs castVote", async () => {
    renderPanel(eligible);
    await userEvent.click(screen.getByRole("radio", { name: "Reject" }));
    await userEvent.click(screen.getByRole("button", { name: "Review and sign vote" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Reject");
    expect(dialog).toHaveTextContent(/publicly visible/);
    await userEvent.click(screen.getByRole("button", { name: "Sign and submit" }));
    expect(run).toHaveBeenCalledOnce();
    const castVote = vi.fn();
    run.mock.calls[0]![0]({ castVote });
    expect(castVote).toHaveBeenCalledWith("3", 1);
  });

  it("does not allow signing without a connected wallet", async () => {
    wallet.ready = false;
    renderPanel(eligible);
    await userEvent.click(screen.getByRole("radio", { name: "Approve" }));
    expect(screen.getByRole("button", { name: "Review and sign vote" })).toBeDisabled();
    expect(screen.getByText(/Connect your local test wallet/)).toBeInTheDocument();
  });

  it.each([
    ["NOT_ELIGIBLE", /not on the eligibility list/],
    ["NOT_STARTED", /has not started yet/],
    ["CLOSED", /This election is closed/],
  ] as const)("explains why voting is unavailable (%s)", (reason, text) => {
    renderPanel({ ...eligible, canVote: false, reason });
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  it("shows the recorded vote and offers the duplicate-vote security demo", () => {
    renderPanel({
      ...eligible,
      canVote: false,
      reason: "ALREADY_VOTED",
      onChain: { registered: true, weight: "4000", hasVoted: true },
      voteTransaction: { txHash: "0x" + "ab".repeat(32), status: "CONFIRMED", blockNumber: 9, createdAt: "" },
    });
    expect(screen.getByText("Your vote is recorded on-chain")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try to vote again" })).toBeEnabled();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });
});
