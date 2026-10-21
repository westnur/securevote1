import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBadge } from "./StatusBadge";

describe("StatusBadge", () => {
  it("renders a human readable label with an explanation", () => {
    render(<StatusBadge status="ENDED" />);
    expect(screen.getByText("Ended — awaiting close")).toBeInTheDocument();
    expect(screen.getByTitle(/organizer must close it/)).toBeInTheDocument();
  });

  it("flags blockchain problems clearly", () => {
    render(<StatusBadge status="CHAIN_MISSING" />);
    expect(screen.getByText("Not on chain")).toBeInTheDocument();
  });
});
