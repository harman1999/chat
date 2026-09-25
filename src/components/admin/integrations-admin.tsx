"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminPage } from "./admin-page";
import { BotsPanel } from "./integrations/bots-panel";
import {
  CommandsPanel,
  OAuthAppsPanel,
  OAuthConnectionsPanel,
} from "./integrations/commands-and-oauth-panels";
import { SecretRevealDialog, type RevealedSecret } from "./integrations/secret-reveal";
import { IncomingWebhooksPanel, OutgoingWebhooksPanel } from "./integrations/webhooks-panel";

const TABS = [
  { value: "bots", label: "Bots" },
  { value: "incoming", label: "Incoming" },
  { value: "outgoing", label: "Outgoing" },
  { value: "commands", label: "Commands" },
  { value: "apps", label: "OAuth apps" },
  { value: "connections", label: "Connections" },
] as const;

/**
 * Six integration types on one page.
 *
 * They share a single concern — a credential that exists in plaintext once — so
 * the reveal dialog is owned here and handed down, rather than each panel
 * growing its own.
 */
export function IntegrationsAdmin() {
  const [revealed, setRevealed] = useState<RevealedSecret | null>(null);

  return (
    <AdminPage
      title="Integrations"
      description="Connect Northwind Technologies to the systems around it."
    >
      <SecretRevealDialog secret={revealed} onClose={() => setRevealed(null)} />

      <Tabs defaultValue="bots">
        <TabsList className="mb-4">
          {TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="bots">
          <BotsPanel onReveal={setRevealed} />
        </TabsContent>
        <TabsContent value="incoming">
          <IncomingWebhooksPanel onReveal={setRevealed} />
        </TabsContent>
        <TabsContent value="outgoing">
          <OutgoingWebhooksPanel onReveal={setRevealed} />
        </TabsContent>
        <TabsContent value="commands">
          <CommandsPanel onReveal={setRevealed} />
        </TabsContent>
        <TabsContent value="apps">
          <OAuthAppsPanel onReveal={setRevealed} />
        </TabsContent>
        <TabsContent value="connections">
          <OAuthConnectionsPanel />
        </TabsContent>
      </Tabs>
    </AdminPage>
  );
}
