import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StatusControl } from "@/components/settings/status-control";
import type { UserStatus } from "@/types";
import { makeUser, renderWithProviders } from "./render";

const setCustomStatus = vi.fn<(status: UserStatus | null) => Promise<void>>();
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("@/services", () => ({ userService: { setCustomStatus: (s: UserStatus | null) => setCustomStatus(s) } }));
vi.mock("sonner", () => ({ toast }));

/**
 * The status control used to start from a hardcoded "Heads down" whatever the
 * account held, and kept changes only in its own state. These pin that it shows
 * the real status and that a change reaches the server.
 */
describe("the status control", () => {
  beforeEach(() => {
    setCustomStatus.mockReset().mockResolvedValue(undefined);
  });

  it("shows no status when the account has none, rather than an invented one", () => {
    renderWithProviders(<StatusControl />, { currentUser: makeUser({ customStatus: null }) });
    expect(screen.getByText("Set a status")).toBeInTheDocument();
    expect(screen.queryByText("Heads down")).toBeNull();
    expect(screen.queryByRole("button", { name: /clear/i })).toBeNull();
  });

  it("shows the status the account really holds", () => {
    renderWithProviders(<StatusControl />, {
      currentUser: makeUser({ customStatus: { emoji: "🍽", text: "Lunch", expiresAt: null } }),
    });
    expect(screen.getByText("Lunch")).toBeInTheDocument();
    expect(screen.queryByText("Set a status")).toBeNull();
  });

  it("clears the status on the server and says so", async () => {
    renderWithProviders(<StatusControl />, {
      currentUser: makeUser({ customStatus: { emoji: "🍽", text: "Lunch", expiresAt: null } }),
    });
    fireEvent.click(screen.getByRole("button", { name: /clear/i }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Status cleared"));
    expect(setCustomStatus).toHaveBeenCalledWith(null);
  });

  it("tells the person when clearing fails, instead of pretending it worked", async () => {
    setCustomStatus.mockRejectedValue(new Error("down"));
    renderWithProviders(<StatusControl />, {
      currentUser: makeUser({ customStatus: { emoji: "🍽", text: "Lunch", expiresAt: null } }),
    });
    fireEvent.click(screen.getByRole("button", { name: /clear/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("saves a typed status with its emoji and no expiry", async () => {
    renderWithProviders(<StatusControl />, { currentUser: makeUser({ customStatus: null }) });
    fireEvent.click(screen.getByText("Set a status"));
    fireEvent.change(await screen.findByLabelText("Status message"), { target: { value: "  In a meeting " } });
    fireEvent.click(screen.getByRole("button", { name: "Save status" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Status updated"));
    expect(setCustomStatus).toHaveBeenCalledWith({ emoji: "💬", text: "In a meeting", expiresAt: null });
  });
});
