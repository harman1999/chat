import type { Workspace } from "@/types";

export const workspaces: Workspace[] = [
  {
    id: "ws_northwind",
    name: "Northwind Technologies",
    slug: "northwind",
    initials: "NW",
    plan: "enterprise",
    memberCount: 428,
    unreadCount: 12,
    mentionCount: 3,
  },
  {
    id: "ws_atlas",
    name: "Atlas Partners",
    slug: "atlas",
    initials: "AP",
    plan: "business",
    memberCount: 64,
    unreadCount: 4,
    mentionCount: 0,
  },
  {
    id: "ws_helix_labs",
    name: "Helix Labs",
    slug: "helix-labs",
    initials: "HL",
    plan: "free",
    memberCount: 9,
    unreadCount: 0,
    mentionCount: 1,
  },
];

export const activeWorkspaceId = "ws_northwind";
