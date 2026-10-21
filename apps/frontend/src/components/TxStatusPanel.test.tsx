import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TxStatusPanel } from "./TxStatusPanel";
import type { TxState } from "../lib/useTxFlow";

const base: TxState = { phase: "idle", txHash: null, blockNumber: null, message: null, result: null };
const hash = "0x" + "ab".repeat(32);

describe("TxStatusPanel", () => {
  it("renders nothing while idle", () => {
    const { container } = render(<TxStatusPanel state={base} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("never shows success while the transaction is still being mined", () => {
    render(<TxStatusPanel state={{ ...base, phase: "mining", txHash: hash, message: "Waiting for the block…" }} />);
    expect(screen.getByText("Waiting for the block…")).toBeInTheDocument();
    expect(screen.queryByText("Transaction confirmed")).not.toBeInTheDocument();
  });

  it("shows the decoded failure reason", () => {
    render(<TxStatusPanel state={{ ...base, phase: "failed", message: "Duplicate vote rejected: already voted." }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Duplicate vote rejected");
  });

  it("distinguishes 'on-chain but not recorded' and offers a retry", async () => {
    const retry = vi.fn();
    render(
      <TxStatusPanel state={{ ...base, phase: "recordFailed", txHash: hash, message: "backend down" }} onRetryRecord={retry} />,
    );
    expect(screen.getByText("Confirmed on-chain — not yet recorded")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry recording" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("shows confirmation with block number only in the confirmed phase", () => {
    render(<TxStatusPanel state={{ ...base, phase: "confirmed", txHash: hash, blockNumber: 42, message: "ok" }} />);
    expect(screen.getByText("Transaction confirmed")).toBeInTheDocument();
    expect(screen.getByText(/block 42/)).toBeInTheDocument();
  });
});
