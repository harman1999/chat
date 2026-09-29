import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { ConfirmDialog, type ConfirmOptions } from "@/components/ui/confirm-dialog";

function Harness({ onConfirm }: { onConfirm: ConfirmOptions["onConfirm"] }) {
  const [options, setOptions] = useState<ConfirmOptions | null>({
    title: "Delete Reviewer?",
    description: "3 people will be moved to Member.",
    destructive: true,
    onConfirm,
  });
  return (
    <>
      <ConfirmDialog options={options} onClose={() => setOptions(null)} />
      {!options && <p>closed</p>}
    </>
  );
}

describe("ConfirmDialog", () => {
  it("does nothing when you answer No", async () => {
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: "No" }));
    await waitFor(() => expect(screen.getByText("closed")).toBeInTheDocument());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("runs the action when you answer Yes, then closes", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<Harness onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    await waitFor(() => expect(screen.getByText("closed")).toBeInTheDocument());
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("puts focus on No, so Enter cancels rather than deletes", () => {
    render(<Harness onConfirm={vi.fn()} />);
    expect(screen.getByRole("button", { name: "No" })).toHaveFocus();
  });

  it("stays open when the action fails, so it cannot read as success", async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error("nope"));
    render(<Harness onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    // Give the rejection a tick to settle.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByText("closed")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Yes" })).toBeEnabled();
  });

  it("cannot be confirmed twice while the action is running", async () => {
    let finish: () => void = () => {};
    const onConfirm = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    render(<Harness onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Yes" })).toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    finish();
    await waitFor(() => expect(screen.getByText("closed")).toBeInTheDocument());
  });
});
