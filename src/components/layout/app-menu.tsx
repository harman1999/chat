"use client";

import { Blocks, Check, Info, LayoutGrid, MessagesSquare, LogOut, ShieldCheck, UserPlus, type LucideIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InvitePeopleDialog } from "@/components/sidebar/invite-people-dialog";
import { Hint } from "@/components/ui/tooltip";
import { useActiveWorkspace, useCanAdminister, useCurrentUser, usePermission } from "@/hooks";
import { APP } from "@/lib/constants";
import { formatMembers } from "@/lib/format";
import { reloadAs } from "@/lib/navigation";
import { authService } from "@/services";
import { cn } from "@/lib/utils";

const PLAN_LABEL = { free: "Free", business: "Business", enterprise: "Enterprise" } as const;

export interface AppMenuEntry {
  id: "channels" | "administration" | "integrations";
  label: string;
  href: string;
  /** Whether it is the place you are in. */
  current: boolean;
}

/**
 * Which places the menu offers, and which one you are in. Pure, so the rules are
 * easy to test: a member is offered only the chat, and the administrator's tools
 * appear only for people allowed to use them.
 */
export function appMenuEntries(input: {
  pathname: string;
  canAdminister: boolean;
  canChangeSettings: boolean;
}): { places: AppMenuEntry[]; tools: AppMenuEntry[] } {
  const inIntegrations = input.pathname.startsWith("/admin/integrations");
  const inAdmin = input.pathname.startsWith("/admin");
  const tools: AppMenuEntry[] = [];
  if (input.canAdminister) {
    tools.push({ id: "administration", label: "Administration", href: "/admin", current: inAdmin && !inIntegrations });
  }
  if (input.canChangeSettings) {
    tools.push({ id: "integrations", label: "Integrations", href: "/admin/integrations", current: inIntegrations });
  }
  return {
    places: [{ id: "channels", label: "Channels", href: "/workspace", current: input.pathname.startsWith("/workspace") }],
    tools,
  };
}

const ICONS: Record<AppMenuEntry["id"], LucideIcon> = {
  channels: MessagesSquare,
  administration: ShieldCheck,
  integrations: Blocks,
};

function Entry({
  icon: Icon,
  label,
  current,
  accent,
  onSelect,
}: {
  icon: LucideIcon;
  label: string;
  current?: boolean;
  /** The main places get the accent colour; the tools below them stay neutral. */
  accent?: boolean;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem onSelect={onSelect} className="gap-3 py-2">
      <Icon className={cn("size-[18px] shrink-0", accent ? "!text-accent" : "!text-fg-subtle")} aria-hidden />
      <span className={cn("min-w-0 flex-1 truncate", accent && "font-semibold")}>{label}</span>
      {current && <Check className="size-4 shrink-0 !text-accent" aria-label="You are here" />}
    </DropdownMenuItem>
  );
}

/**
 * The app menu: a grid button (or whatever trigger it is given) that lists the places in the app, with the current
 * one ticked, then the administrator's tools, then About.
 *
 * It is where Administration lives. Inviting people and signing out live here too; the
 * workspace menu only shows which workspace this is.
 */
export function AppMenu({ trigger }: { trigger?: ReactNode } = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const workspace = useActiveWorkspace();
  const { data: user } = useCurrentUser();
  const canAdminister = useCanAdminister();
  const canChangeSettings = usePermission("p_admin_settings");
  const canInvite = usePermission("p_user_invite");
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);

  const { places, tools } = appMenuEntries({ pathname, canAdminister, canChangeSettings });

  return (
    <>
      <DropdownMenu>
        {trigger ? (
          <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        ) : (
          <Hint label="Menu" side="bottom">
            <DropdownMenuTrigger
              aria-label="App menu"
              className="grid size-8 shrink-0 place-items-center rounded-md text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg data-[state=open]:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
            >
              <LayoutGrid className="size-[18px]" aria-hidden />
            </DropdownMenuTrigger>
          </Hint>
        )}

        <DropdownMenuContent align="start" className="w-72" sideOffset={6}>
          {places.map((entry) => (
            <Entry
              key={entry.id}
              icon={ICONS[entry.id]}
              label={entry.label}
              accent
              current={entry.current}
              onSelect={() => router.push(entry.href)}
            />
          ))}

          {tools.length > 0 && (
            <>
              <DropdownMenuSeparator />
              {tools.map((entry) => (
                <Entry
                  key={entry.id}
                  icon={ICONS[entry.id]}
                  label={entry.label}
                  current={entry.current}
                  onSelect={() => router.push(entry.href)}
                />
              ))}
            </>
          )}

          {canInvite && (
            <>
              <DropdownMenuSeparator />
              <Entry
                icon={UserPlus}
                label={`Invite people to ${workspace?.name ?? APP.name}`}
                onSelect={() => setIsInviteOpen(true)}
              />
            </>
          )}

          <DropdownMenuSeparator />
          <Entry icon={Info} label={`About ${workspace?.name ?? APP.name}`} onSelect={() => setIsAboutOpen(true)} />

          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="danger"
            className="gap-3 py-2"
            onSelect={async () => {
              await authService.signOut();
              reloadAs("/login");
            }}
          >
            <LogOut className="size-[18px] shrink-0" aria-hidden />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <InvitePeopleDialog
        open={isInviteOpen}
        onOpenChange={setIsInviteOpen}
        workspaceName={workspace?.name ?? APP.name}
      />

      <Dialog open={isAboutOpen} onOpenChange={setIsAboutOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>About {workspace?.name ?? APP.name}</DialogTitle>
            <DialogDescription>{APP.name} — {APP.tagline.toLowerCase()}.</DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2 px-5 py-4 text-sm">
            <dt className="text-fg-subtle">Workspace</dt>
            <dd className="text-fg">{workspace?.name ?? "—"}</dd>
            <dt className="text-fg-subtle">Plan</dt>
            <dd className="text-fg">{workspace ? PLAN_LABEL[workspace.plan] : "—"}</dd>
            <dt className="text-fg-subtle">People</dt>
            <dd className="text-fg">{workspace ? formatMembers(workspace.memberCount) : "—"}</dd>
            <dt className="text-fg-subtle">Signed in as</dt>
            <dd className="min-w-0 truncate text-fg">{user ? `${user.displayName} (${user.email})` : "—"}</dd>
            <dt className="text-fg-subtle">Version</dt>
            <dd className="text-fg">
              {APP.name} {APP.version}
            </dd>
          </dl>
        </DialogContent>
      </Dialog>
    </>
  );
}
