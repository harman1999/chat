import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppMenu } from "@/components/layout/app-menu";
import { makeUser, renderWithProviders } from "./render";

const push = vi.fn();
const signOut = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const reloadAs = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => "/workspace" }));
vi.mock("@/services", async (original) => ({ ...(await original<object>()), authService: { signOut } }));
vi.mock("@/lib/navigation", () => ({ reloadAs }));
vi.mock("@/hooks", () => ({
  useActiveWorkspace: () => ({ id: "ws", name: "Northwind", plan: "business", memberCount: 3 }),
  useCurrentUser: () => ({ data: makeUser({ displayName: "Harman" }) }),
  useCanAdminister: () => true,
  usePermission: () => true,
}));

/** One open per file: Radix menus will not reopen cleanly within one jsdom file. */
describe("the app menu, for an administrator", () => {
  it("offers every place and action, ticks where you are, and signs out", async () => {
    renderWithProviders(<AppMenu />);
    await userEvent.click(screen.getByRole("button", { name: "App menu" }));

    const names = (await screen.findAllByRole("menuitem")).map((item) => item.textContent?.trim());
    expect(names).toEqual([
      "Channels",
      "Administration",
      "Integrations",
      "Invite people to Northwind",
      "About Northwind",
      "Sign out",
    ]);
    // You are in the workspace, so only Channels carries the tick.
    expect(screen.getAllByLabelText("You are here")).toHaveLength(1);

    fireEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
    await waitFor(() => expect(reloadAs).toHaveBeenCalledWith("/login"));
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
