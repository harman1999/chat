"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Check, Loader2, ShieldCheck } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { request } from "@/services/http";
import { isApiError } from "@/services/http";

interface Consent {
  application: { name: string; clientId: string };
  scopes: string[];
  redirectUri: string;
  user: { id: string; displayName: string };
}

/**
 * Human-readable descriptions for the scopes this workspace issues.
 *
 * A consent screen that shows raw scope strings is asking someone to approve
 * something they cannot read. An unrecognised scope falls back to its own name
 * rather than being hidden — approving something unnamed is worse than
 * approving something ugly.
 */
const SCOPE_TEXT: Record<string, string> = {
  "messages:read": "Read messages in channels you belong to",
  "messages:write": "Post messages as you",
  "channels:read": "See which channels you are in",
  "channels:write": "Create channels and change their members",
  "users:read": "Read the workspace directory",
  "profile:read": "Read your name, photo and status",
};

export function OAuthConsent() {
  const router = useRouter();
  const params = useSearchParams();
  const [isDeciding, setIsDeciding] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  // Carried through untouched: `state` belongs to the application and is echoed
  // back so it can tell its own request apart from anyone else's.
  const state = params.get("state");
  const query = params.toString();

  const { data, isPending, error } = useQuery<Consent>({
    queryKey: ["oauth-consent", query],
    queryFn: () => request<Consent>(`/oauth/authorize?${query}`),
    retry: false,
  });

  /** Sends the browser back to the application, approved or not. */
  const returnToApp = (redirectUri: string, extra: Record<string, string>) => {
    const target = new URL(redirectUri);
    for (const [key, value] of Object.entries(extra)) target.searchParams.set(key, value);
    if (state) target.searchParams.set("state", state);
    // A full navigation, not a router push: the destination is another origin.
    window.location.href = target.toString();
  };

  const approve = async () => {
    if (!data) return;
    setIsDeciding(true);
    setFailure(null);
    try {
      const { code } = await request<{ code: string }>(`/oauth/authorize?${query}`, {
        method: "POST",
      });
      returnToApp(data.redirectUri, { code });
    } catch (caught) {
      setFailure(isApiError(caught) ? caught.message : "Could not complete the authorization.");
      setIsDeciding(false);
    }
  };

  const deny = () => {
    // Refusal is reported to the application rather than silently dropping the
    // person somewhere — RFC 6749 gives it a name, so use it.
    if (data) returnToApp(data.redirectUri, { error: "access_denied" });
    else router.push("/workspace");
  };

  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-4 py-10">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface shadow-sm">
        {isPending ? (
          <div className="flex items-center gap-2 px-6 py-10 text-sm text-fg-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Checking the application…
          </div>
        ) : error || !data ? (
          <div className="px-6 py-8">
            <AlertTriangle className="size-5 text-danger" aria-hidden />
            <h1 className="mt-2 text-md font-semibold text-fg">This request is not valid</h1>
            <p className="mt-1 text-sm text-fg-muted">
              {isApiError(error) ? error.message : "The application or redirect URI is unknown."}
            </p>
            <p className="mt-3 text-2xs text-fg-subtle">
              Nothing was approved. Go back to the application and start again.
            </p>
            <Button variant="secondary" size="sm" className="mt-4" onClick={() => router.push("/workspace")}>
              Back to Helix
            </Button>
          </div>
        ) : (
          <>
            <header className="border-b border-border px-6 py-5">
              <span className="grid size-9 place-items-center rounded-lg bg-accent-subtle text-accent">
                <ShieldCheck className="size-4.5" aria-hidden />
              </span>
              <h1 className="mt-3 text-lg font-semibold tracking-tight text-fg">
                Authorize {data.application.name}
              </h1>
              <p className="mt-1 text-sm text-fg-muted">
                It is asking to act as <strong className="font-medium text-fg">{data.user.displayName}</strong>{" "}
                in Northwind Technologies.
              </p>
            </header>

            <div className="px-6 py-5">
              <h2 className="text-2xs font-semibold uppercase tracking-[0.06em] text-fg-subtle">
                It will be able to
              </h2>
              <ul className="mt-2.5 space-y-2">
                {data.scopes.map((scope) => (
                  <li key={scope} className="flex items-start gap-2 text-sm text-fg">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />
                    <span className="min-w-0 flex-1">
                      {SCOPE_TEXT[scope] ?? scope}
                      {!SCOPE_TEXT[scope] && (
                        <span className="ml-1 text-2xs text-fg-subtle">(unrecognised scope)</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>

              {/* Where the code is about to be sent — the one fact that makes a
                  consent screen checkable rather than a formality. */}
              <p className="mt-4 break-all rounded-md bg-surface-raised px-2.5 py-2 text-2xs text-fg-subtle">
                You will be returned to <span className="text-fg-muted">{data.redirectUri}</span>
              </p>

              {failure && (
                <p role="alert" className="mt-3 rounded-md bg-danger-subtle px-2.5 py-2 text-xs text-danger">
                  {failure}
                </p>
              )}
            </div>

            <footer className="flex gap-2 border-t border-border px-6 py-4">
              <Button variant="secondary" size="sm" className="flex-1" onClick={deny} disabled={isDeciding}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                className="flex-1"
                onClick={() => void approve()}
                disabled={isDeciding}
              >
                {isDeciding && <Loader2 className="animate-spin" />}
                Authorize
              </Button>
            </footer>
          </>
        )}
      </div>
    </main>
  );
}
