import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppMenu } from "@/components/layout/app-menu";
import { makeUser, renderWithProviders } from "./render";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/workspace" }));
vi.mock("@/hooks", () => ({
  useActiveWorkspace: () => ({ id: "ws", name: "Northwind", plan: "business", memberCount: 3 }),
  useCurrentUser: () => ({ data: makeUser() }),
  useCanAdminister: () => false,
  usePermission: () => false,
}));

describe("the app menu, for an ordinary member", () => {
  it("leaves out administration and inviting rather than offering what would be refused", async () => {
    renderWithProviders(<AppMenu />);
    await userEvent.click(screen.getByRole("button", { name: "App menu" }));

    const names = (await screen.findAllByRole("menuitem")).map((item) => item.textContent?.trim());
    expect(names).toEqual(["Channels", "About Northwind", "Sign out"]);
  });
});
