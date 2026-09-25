# Integrations

Six ways to connect Helix to the systems around it, administered at
**Admin → Integrations**.

## The decision everything rests on

**A bot is a `users` row with `is_bot = true`, not a parallel actor type.**

That choice carries the whole feature. A bot already has a workspace, channel
memberships, a display name, an avatar and an author identity, so every existing
route, permission check and message query works for it unchanged. Authenticating
a bot is then only a matter of resolving a token to a user id — and the rest of
the codebase never learns that bots exist.

The visible consequence: a bot must be a member of a channel to post in it.
There is no privileged write that skips membership, because there is no separate
write path at all.

## Credentials

Every secret here is generated server-side, returned exactly once, and stored
only as a SHA-256 hash. Losing one means reissuing it, not recovering it.

SHA-256 rather than scrypt is deliberate. A password is low-entropy and needs a
slow hash; these are 256-bit random values where a slow hash buys nothing
against guessing and costs a scrypt on the authentication path of every bot
request.

The one exception is an outgoing OAuth connection's client secret and tokens.
Those must be *read back* to authenticate to the provider, so they cannot be
hashed — they are AES-256-GCM encrypted instead, and the column names say `_enc`
so nobody mistakes them for hashes.

### What a token may not do

A bearer token resolves to an ordinary user, which would otherwise let it reach
everything that user can. Two boundaries exist:

- `requirePermission` refuses integration tokens outright, so no administrative
  route can be driven by one regardless of the bot's role.
- `requireUserSession` guards password changes, email changes and session
  revocation. A leaked token must not be able to take the account over.

An OAuth access token is also `actor: "integration"` for this reason: an
application acting on someone's behalf must not be able to seize their account.

## Outbound requests and SSRF

Outgoing webhooks, slash commands and OAuth token exchange all make **this
server** fetch a URL someone typed into a form. That is server-side request
forgery by construction — the request originates inside the network, so it
reaches whatever the server can reach: a cloud metadata endpoint, an
unauthenticated admin port, a database.

`server/lib/outbound.ts` is the only way out. It:

- allows only `http`/`https`, and rejects credentials embedded in the URL;
- resolves the hostname and checks **every** address it answers with, so a host
  returning one public and one private address does not pass;
- rejects loopback, RFC1918, link-local (including `169.254.169.254`),
  carrier-grade NAT, multicast, IPv6 unique-local, and IPv4-mapped IPv6 forms;
- treats anything it cannot classify as private — failing closed;
- re-checks at send time, not only at save time, because DNS can be re-pointed
  after a URL was accepted;
- uses `redirect: "manual"`, because a redirect is how a validated public URL
  becomes an internal one;
- times out at 5s and caps the response it reads.

`OUTBOUND_ALLOW_PRIVATE=true` disables the address check. Self-hosted
deployments whose integrations genuinely live on the same private network need
it; turning it on means anyone who can create a webhook can make this server
talk to anything it can reach. It is off by default.

## Delivery signatures

Every outgoing delivery carries:

```
X-Helix-Timestamp: 1758300000
X-Helix-Signature: v0=<hmac-sha256>
```

The HMAC covers `v0:<timestamp>:<body>`. The timestamp is inside the signed
material rather than merely alongside it — otherwise a captured delivery replays
forever with its own headers intact.

## OAuth 2.0 (inbound)

Authorization code flow. **PKCE with S256 is required, not optional** — without
it an intercepted code is redeemable by whoever holds it.

- Redirect URIs are matched **exactly**. A prefix or wildcard match is how an
  authorization code ends up delivered somewhere the app never intended.
- Codes live 60 seconds and are claimed atomically (`used_at IS NULL` in the
  `UPDATE`), so two simultaneous redemptions cannot both succeed.
- A code is bound to the client it was issued to and to its redirect URI; both
  are re-checked at exchange.
- Refresh tokens rotate: redeeming one revokes it, so a stolen refresh token
  stops working the moment the legitimate client uses theirs.
- An unknown client and a wrong secret get the same `invalid_client` answer.

## Outgoing webhook dispatch

Fan-out is **not awaited** by the route that posts the message. A slow or broken
external endpoint must not delay the sender, and a failed delivery must not fail
the message — the message is the product, the webhook is a side effect.

Failures are recorded against the webhook (`last_status`, `last_error`,
`failure_count`) and surfaced in the admin list, so a broken endpoint is visible
rather than silent. A bot's own posts never trigger outgoing webhooks, which
would otherwise be a loop that fills a channel until someone notices.

## Slash commands in the composer

Typing `/` at the **start** of a draft opens the command list; a slash anywhere
else is just a slash, so "and/or" opens nothing. The list narrows as the command
is typed, and Enter or Tab completes it, leaving the caret after a trailing
space so an argument can follow.

The composer already had @-mention autocomplete. Rather than a second copy of
the same keyboard handling, both menus now resolve to one `openMenu` shape —
they are mutually exclusive by construction, since a mention needs an `@` and a
command needs a `/` in the first position, so arrow, Enter, Tab and Escape are
handled once.

**Sending runs the command rather than posting it.** Offering `/weather` in a
menu and then posting "/weather London" as plain text would be exactly the kind
of control Phase 11 removed. An *unregistered* slash word is still ordinary
text, so nothing changes for people who start a sentence with a slash.

A reply marked `ephemeral` appears above the composer labelled **Only you**,
dismissible, and is never stored or sent — it is not a message. An `in_channel`
reply is not echoed there, because the server already posted it and it arrives
over the socket like any other message.

## The consent screen

`/oauth/authorize` is where an application sends someone to approve access. The
API returns the consent details as data; `src/components/auth/oauth-consent.tsx`
turns them into a decision.

It renders scopes in plain English rather than raw strings — a screen showing
`messages:write` is asking someone to approve something they cannot read — and
an unrecognised scope is shown by name and flagged, because approving something
unnamed is worse than approving something ugly. The redirect target is printed,
which is the one fact that makes a consent screen checkable rather than a
formality.

Signing in from here returns here. `/login` accepts a `next` parameter, rejecting
anything that is not a same-origin path so it cannot become an open redirect.
Cancelling reports `error=access_denied` back to the application rather than
silently dropping the person somewhere.

## Enabling and disabling

Every integration can be disabled without being deleted — they are different
acts. A noisy webhook should be silenceable without losing its history, its
delivery record, or the secret the receiver already trusts.

A disabled incoming webhook answers exactly as an unknown secret does, so the
endpoint still reveals nothing about which secrets exist. A disabled command
disappears from the composer *and* refuses to run if typed. A disabled OAuth
application is refused at the authorize endpoint.

`integrationsRepo.setEnabled` takes the table name from a fixed map rather than
from the caller, so a crafted path segment cannot turn it into an arbitrary
UPDATE.

## What an outgoing OAuth connection is for

For a while this feature stored an access token that nothing ever read — a
credential store with an OAuth dance in front of it. `server/lib/oauth-client.ts`
is the consumer.

An outgoing webhook or a slash command may name a connection. When it does, the
delivery carries `Authorization: Bearer <that connection's token>` alongside the
usual signature: the signature proves the delivery came from here, the bearer
token proves *who it is acting as*.

Tokens are refreshed a minute before expiry rather than after it, so one does
not die mid-request. Providers that rotate refresh tokens have the new one
stored; those that do not keep the existing one. A connection that cannot
produce a token records the reason and the delivery still goes out
unauthenticated — a broken connection must not silently swallow the webhook.

The foreign key is `ON DELETE SET NULL`, not `CASCADE`: deleting a connection
must not silently delete the webhooks that used it.
