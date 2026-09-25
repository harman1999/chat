import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddMemberDialog } from "@/components/admin/add-member-dialog";
import { adminService } from "@/services";
import { renderWithProviders } from "./render";

/**
 * The server owns the rules; these cover the parts the client decides on its
 * own — what it derives, when it will let you submit, and what it does with a
 * refusal.
 */
describe("AddMemberDialog", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(adminService, "listRoles").mockResolvedValue([
      { id: "role_member", name: "Member", description: "", permissionIds: [], memberCount: 0, isSystem: true },
      { id: "role_admin", name: "Administrator", description: "", permissionIds: [], memberCount: 0, isSystem: true },
    ]);
  });

  const open = () => renderWithProviders(<AddMemberDialog open onOpenChange={() => {}} />);

  const type = (label: RegExp, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });

  it("cannot be submitted until a name and email are present", () => {
    open();
    const submit = screen.getByRole("button", { name: /create account/i });
    expect(submit).toBeDisabled();

    type(/full name/i, "Ada Lovelace");
    expect(submit).toBeDisabled();

    type(/email/i, "ada@northwind.io");
    expect(submit).toBeEnabled();
  });

  it("derives the username from the name, without committing to it", () => {
    open();
    type(/full name/i, "Ada Lovelace");

    const username = screen.getByLabelText(/username/i) as HTMLInputElement;
    // Shown as a placeholder rather than filled in, so the field stays the
    // administrator's to override.
    expect(username.placeholder).toBe("ada.lovelace");
    expect(username.value).toBe("");
  });

  it("rejects a username outside the server's grammar before submitting", () => {
    open();
    type(/full name/i, "Ada Lovelace");
    type(/email/i, "ada@northwind.io");
    type(/username/i, "Ada Lovelace!");

    expect(screen.getByText(/lowercase letters, numbers, dots/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create account/i })).toBeDisabled();
  });

  it("generates a password long enough for the server to accept", () => {
    open();
    const password = screen.getByLabelText(/first password/i) as HTMLInputElement;
    expect(password.value.length).toBeGreaterThanOrEqual(12);
  });

  it("blocks a password the server would reject", () => {
    open();
    type(/full name/i, "Ada Lovelace");
    type(/email/i, "ada@northwind.io");
    type(/first password/i, "short");

    expect(screen.getByText(/at least 12 characters/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create account/i })).toBeDisabled();
  });

  it("shows the server's own refusal rather than a generic message", async () => {
    vi.spyOn(adminService, "createUser").mockRejectedValue({
      code: "email_taken",
      message: "Someone in this workspace already uses that address",
      status: 409,
    });

    open();
    type(/full name/i, "Bob Again");
    type(/email/i, "bob.smith@northwind.io");
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/already uses that address/i),
    );
  });
});
