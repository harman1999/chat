import type { InviteLink, InvitePreview } from "@/types";
import { request } from "./http";

/** Invite links. The full URL is returned once, at creation, and never again. */
export const inviteService = {
  listActive(): Promise<InviteLink[]> {
    return request<InviteLink[]>("/invites");
  },

  create(input: { expiresInDays: 1 | 7 | 30; maxUses: number | null }) {
    return request<{ link: InviteLink; url: string }>("/invites", { method: "POST", body: input });
  },

  revoke(id: string): Promise<void> {
    return request<void>(`/invites/${id}`, { method: "DELETE" });
  },

  preview(token: string): Promise<InvitePreview> {
    return request<InvitePreview>(`/join/${encodeURIComponent(token)}`);
  },

  accept(token: string, input: { fullName: string; email: string; password: string }) {
    return request<{ ok: true }>(`/join/${encodeURIComponent(token)}`, { method: "POST", body: input });
  },
};
