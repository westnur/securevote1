import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { defaultElectionValues, ElectionForm } from "./ElectionForm";

function setup() {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(<ElectionForm initial={defaultElectionValues()} submitLabel="Create draft" onSubmit={onSubmit} />);
  return { onSubmit, user: userEvent.setup() };
}

describe("ElectionForm validation", () => {
  it("requires a title", async () => {
    const { onSubmit, user } = setup();
    await user.click(screen.getByRole("button", { name: "Create draft" }));
    expect(await screen.findByText("Title must have at least 3 characters")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("keeps at least two options (remove buttons disabled)", () => {
    setup();
    expect(screen.getByRole("button", { name: "Remove option 1" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove option 2" })).toBeDisabled();
  });

  it("rejects duplicate option labels", async () => {
    const { onSubmit, user } = setup();
    await user.type(screen.getByLabelText("Title"), "Board vote");
    await user.clear(screen.getByLabelText("Option 2"));
    await user.type(screen.getByLabelText("Option 2"), "approve");
    await user.click(screen.getByRole("button", { name: "Create draft" }));
    expect(await screen.findByText("Option labels must be unique")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("rejects an end time before the start time", async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText("Title"), "Board vote");
    await user.clear(screen.getByLabelText("Voting ends"));
    await user.type(screen.getByLabelText("Voting ends"), "2020-01-01T10:00");
    await user.click(screen.getByRole("button", { name: "Create draft" }));
    expect(await screen.findByText("End time must be after start time")).toBeInTheDocument();
  });

  it("submits a normalised payload with quorum converted to basis points", async () => {
    const { onSubmit, user } = setup();
    await user.type(screen.getByLabelText("Title"), "  Board vote  ");
    await user.click(screen.getByRole("button", { name: "Add option" }));
    await user.type(screen.getByLabelText("Option 3"), "Abstain");
    await user.clear(screen.getByLabelText("Quorum (% of eligible weight)"));
    await user.type(screen.getByLabelText("Quorum (% of eligible weight)"), "33.5");
    await user.click(screen.getByRole("button", { name: "Create draft" }));
    expect(onSubmit).toHaveBeenCalledOnce();
    const payload = onSubmit.mock.calls[0]![0];
    expect(payload).toMatchObject({ title: "Board vote", options: ["Approve", "Reject", "Abstain"], quorumBps: 3350 });
    expect(Date.parse(payload.endTime)).toBeGreaterThan(Date.parse(payload.startTime));
  });
});
