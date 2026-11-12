# Helix

Team communication for engineering organisations — a workspace / channel /
thread product (with teams inside one workspace) with a real backend: PostgreSQL, Redis, a WebSocket gateway,
session auth, an administration surface, and six kinds of integration.

Built with Next.js (App Router), TypeScript, Tailwind CSS v4, Zustand and
TanStack Query.

---

## Contents

- [Quick start](#quick-start) · [Prerequisites](#prerequisites) · [Environment](#environment-variables)
- [What runs where](#what-runs-where) · [Everyday commands](#everyday-commands)
- [Project map](#project-map) — which file does which job
- [How a request flows](#how-a-request-flows)
- [Architecture decisions](#architecture-decisions)
- [Security](#security) · [Observability](#observability)
- [Feature notes](#feature-notes) · [Design system](#design-system)
- [Troubleshooting](#troubleshooting)

---

## Quick start

```bash
git clone <repo> && cd chat
npm install
cp .env.example .env.local     # defaults work as-is for local development
npm run db:up                  # Postgres + Redis in Docker, waits for health
npm run db:migrate             # applies server/db/migrations/*.sql in order
npm run db:seed                # loads the demo workspace
npm run dev:all                # web on :3000, WebSocket gateway on :3101
```

Open <http://localhost:3000> and sign in:

| | |
|---|---|
| Email | `harman.singh@northwind.io` |
| Password | `helix-demo-password` |

Every seeded account shares that password. Wiping the database leaves only the
owner account, which is the way to try a fresh setup. `alice.johnson@northwind.io` is an
administrator and `bob.smith@northwind.io` an ordinary member — useful for
seeing the permission boundaries from both sides.

### Prerequisites

| Need | Version | Why |
|---|---|---|
| Node.js | 22+ | The app |
| Docker + Compose | any current | Runs Postgres 16, Redis 7 and Mailpit |
| Free ports 3000, 3101, 5434, 6381, 1026, 8026 | — | Web, gateway, database, cache, mail (SMTP and inbox) |

Nothing else is installed globally. `tsx` runs the TypeScript scripts and is a
dev dependency.

The database ports are **deliberately offset** (5434 → 5432, 6381 → 6379) so
they never collide with a Postgres or Redis already installed on the machine,
and the Compose project is named `helix` so its containers stay separate from
any other stack.

### Environment variables

`cp .env.example .env.local`. Every variable has a working development default,
so the copy is enough to start. What each one does:

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgresql://helix:helix@localhost:5434/helix` | Postgres connection |
| `REDIS_URL` | `redis://localhost:6381` | Sessions, presence, pub/sub, rate limits |
| `STORAGE_DIR` | `./.storage` | Uploaded files on disk |
| `WS_PORT` | `3101` | The WebSocket gateway's own port |
| `ENCRYPTION_SECRET` | dev fallback; **required in production** | AES-256-GCM key for stored credentials (outgoing OAuth, single sign-on secret) |
| `PUBLIC_URL` | `http://localhost:3000`; **https required in production** | Webhook URLs, invite and reset links, single sign-on addresses |
| `TRUSTED_PROXY_HOPS` | `0` in development, `1` in production | How many reverse proxies sit in front; see Security |
| `SMTP_HOST` / `SMTP_PORT` | empty / `587` (`localhost` / `1026` locally) | Outgoing mail. No host means no mail |
| `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASSWORD` | `false` / empty / empty | Implicit TLS and login, if your provider needs them |
| `MAIL_FROM` | `Helix <no-reply@helix.local>` | The sender shown on every email |
| `OUTBOUND_ALLOW_PRIVATE` | `false` (`true` locally) | Lets integrations reach private addresses |
| `NEXT_PUBLIC_USE_MOCK` | `false` | `true` serves fixtures with no backend at all |
| `NEXT_PUBLIC_API_URL` | `/api/v1` | Where the client sends REST calls |
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:3101` | Where the client opens its socket |

Two deserve more than a table row:

**`ENCRYPTION_SECRET`** has a development fallback so a clean checkout runs, but
a **production server refuses to start** without a real one (at least 32 random
characters: `openssl rand -base64 32`), and also refuses the default database
password, a missing `REDIS_URL`, and a `PUBLIC_URL` that is not `https://`.
Rotating the secret makes existing stored credentials undecryptable — which is the
correct failure, since the alternative is silently trusting a default.

**`OUTBOUND_ALLOW_PRIVATE`** is off by default because a URL box that can reach
the internal network is server-side request forgery with a form around it. Local
integrations run on localhost, so `.env.local` turns it on deliberately. Leave
it off in production unless your integrations genuinely live on the same private
network.

### Running without a backend

`NEXT_PUBLIC_USE_MOCK=true` serves the whole UI from in-memory fixtures — no
Docker, no database, no migration. Useful for UI work. Integrations are the
exception: they have no fixtures, because a slash command's behaviour *is* an
external endpoint and a fixture would be pretending to be one.

---

## What runs where

Three processes, on purpose:

```
┌──────────────────┐   HTTP    ┌──────────────────┐
│  Browser         │ ────────► │  Next.js :3000   │  pages + /api/v1 routes
│                  │ ◄──────── │                  │
│                  │           └────────┬─────────┘
│                  │                    │
│                  │   WebSocket        │ publishes
│                  │ ◄──────────────────┼──────────────┐
└──────────────────┘                    ▼              │
                              ┌──────────────────┐     │
                              │ Postgres :5434   │     │  Redis pub/sub
                              └──────────────────┘     │
                              ┌──────────────────┐     │
                              │ Redis :6381      │ ◄───┘
                              └────────┬─────────┘
                                       │ subscribes
                              ┌────────▼─────────┐
                              │ WS gateway :3101 │  server/ws/server.ts
                              └──────────────────┘
```

**Why the gateway is a separate process:** Next route handlers cannot take an
HTTP upgrade, so a WebSocket server cannot live inside them. It runs as its own
Node process and subscribes to Redis pub/sub — which also means any number of
gateway processes can serve clients and all of them see every event. The API
never needs to know which socket a user is on.

`npm run dev:all` starts Docker, migrates, and runs both processes together. To
run them separately:

```bash
npm run dev     # Next.js
npm run ws      # gateway  (npm run dev:ws for watch mode)
```

---

## Everyday commands

### Running it

```bash
./scripts/helix.sh start      # or: npm run app:start
./scripts/helix.sh stop       #     npm run app:stop
./scripts/helix.sh status     #     npm run app:status
./scripts/helix.sh logs web   # follow a log (web | ws)
```

`start` brings up Docker (waiting for health), applies migrations, **seeds if the
database is empty**, and runs both processes detached — so the terminal is yours
again. `stop` leaves Postgres and Redis up, because they hold the database and
keeping them makes the next start seconds; `stop --docker` takes them down too.

Each service runs in its own process group, recorded in `.run/`. `next dev` and
`tsx watch` both spawn children, so killing the parent alone would orphan them
and leave the port held — the group is what gets signalled.

`npm run dev:all` still exists and does the same thing in the foreground, which
is what you want when you are watching the output.

**`scripts/README.md`** has the full walkthrough: first-run setup, what each
status line means, the log files, and a troubleshooting table.

### The rest

| Command | What it does |
|---|---|
| `npm run dev` | Next.js dev server on :3000, foreground |
| `npm run ws` / `dev:ws` | WebSocket gateway on :3101 (watch mode) |
| `npm run dev:all` | Docker + migrate + both processes together |
| `npm run build` / `start` | Production build / serve it |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | Typecheck |
| `npm run db:up` / `db:down` | Start / stop Postgres and Redis |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:seed` | Load the demo workspace (idempotent) |
| `npm run db:reset` | Destroy the volume and rebuild from scratch |
| `npm run create-user -- --email … --name … --password …` | Add a person from the shell |

Run `tsc`, `lint` and `build` before calling anything done. They catch
different things: the missing-field errors `tsc` finds are not caught by the dev server, and
`next build` compiles route types the dev server does not.

---

## Project map

### Root

| Path | Job |
|---|---|
| `docker-compose.yml` | Postgres 16, Redis 7 and Mailpit (a development inbox), project `helix`, offset ports, healthchecks |
| `next.config.ts`, `tsconfig.json` | Framework config; `@/*` → `src`, `@server/*` → `server` |
| `.env.example` | Every variable with a working default — copy to `.env.local` |
| `scripts/helix.sh` | Start / stop / status for the running app — see `scripts/README.md` |
| `scripts/create-user.ts` | Adds a member from the shell; same repo call the admin form makes |
| `docs/control-decisions.md` | Per-control record of build / wire / keep / delete, with reasons |
| `docs/integrations.md` | Integration design and the security reasoning behind it |

### `server/` — everything that touches the database

| Path | Job |
|---|---|
| `env.ts` | Typed configuration with defaults; the only place `process.env` is read |
| **`db/`** | |
| `db/client.ts` | `pg` pool plus `query`, `queryOne`, `transaction` helpers |
| `db/migrate.ts` | Migration runner — journalled, transactional, checksum-verified |
| `db/migrations/*.sql` | Numbered, applied in order, never edited once applied |
| `db/seed.ts` | Loads `src/data` fixtures into Postgres; idempotent |
| **`lib/`** — cross-cutting concerns | |
| `lib/http.ts` | **The highest-leverage file.** `handler()` wraps every route: error boundary, rate-limit chokepoint. Plus `parseBody` (zod), `json`, `problem`, `noContent` |
| `lib/session.ts` | Session cookies, bearer tokens, `requireSession` / `requireUserSession` |
| `lib/permissions.ts` | `requirePermission` — and where integration tokens are refused admin access |
| `lib/schemas.ts` | Every zod schema for request bodies, in one place |
| `lib/password.ts` | scrypt hashing for people's passwords |
| `lib/secrets.ts` | Token hashing (SHA-256), AES-256-GCM encryption, HMAC signing |
| `lib/outbound.ts` | The only way out to an admin-supplied URL — SSRF guard, signed delivery |
| `lib/dispatch.ts` | Fans a new message out to matching outgoing webhooks, detached |
| `lib/rate-limit.ts` | Fixed-window Redis counters and the per-route rules |
| `lib/audit.ts` | Appends to `audit_log`; never throws, always counted |
| `lib/metrics.ts` | In-process counters for the things that fail quietly |
| `lib/events.ts` | Publishes realtime events onto Redis pub/sub |
| `lib/redis.ts` | Redis clients and key builders |
| `lib/mail.ts`, `lib/mail-templates.ts` | `sendMail` (never throws, counted in metrics) and the email wording |
| `lib/oidc.ts`, `lib/sso-state.ts`, `repo/sso.ts` | Single sign-on: discovery, token exchange, ID-token checks; the settings and identity links |
| `lib/rank.ts` | Who may act on whom: Owner > Administrator > everyone else |
| `lib/session-token.ts`, `lib/client-ip.ts`, `lib/busy.ts` | Session token hashing; the trusted-proxy client address; "too busy" for work that must not pile up |
| `lib/outbound.ts` | `assertSafeUrl` and `safeFetch` — the only way out to an administrator-supplied URL |
| `lib/production-check.ts` | Refuses to start production on missing or default secrets (run from `src/instrumentation.ts`) |
| `lib/notify-email.ts` | When a mention or direct message becomes an email (`shouldEmail`) |
| `lib/storage.ts` | Object storage behind a narrow interface — swap for S3 |
| `lib/guard.ts` | Page-level redirect for signed-out visitors (routes authorise separately) |
| **`repo/`** — SQL in, domain types out. No SQL exists outside this directory. | |
| `repo/users.ts` | Directory, profile, preferences, sessions, `create` |
| `repo/channels.ts` | Channels, membership, archive, favourites |
| `repo/messages.ts` | Messages, reactions, attachments, pins, saves, pagination |
| `repo/threads.ts` | Follows, read cursors, the batched inbox |
| `repo/notifications.ts`, `repo/search.ts`, `repo/admin.ts` | Notifications, full-text search, admin reads |
| `repo/integrations.ts` | Bots, tokens, webhooks, commands, OAuth apps and connections |
| **`ws/server.ts`** | The gateway: authenticates the socket, caches channel membership, fans out |

### `src/app/` — routes

| Path | Job |
|---|---|
| `app/api/v1/**/route.ts` | The REST API — 130 handlers across 101 files, each authorising independently |
| `app/login`, `app/workspace` | Sign-in and the main three-column application |
| `app/settings/*` | Profile, preferences, appearance, notifications, account |
| `app/admin/*` | Dashboard, users, teams, roles, permissions, channels, storage, audit, integrations |
| `app/design-system` | Live token, type-scale and component reference |
| `app/globals.css` | **Every design token.** Colour, radius, elevation, type, density |

### `src/` — the client

| Path | Job |
|---|---|
| `components/ui/` | Primitives — button, dialog, dropdown, popover, sheet, tabs, tooltip |
| `components/common/` | Avatar, presence, badges, empty / loading / error states |
| `components/layout/` | App shell, top bar, right panel, mobile tab bar, the app menu (`app-menu.tsx`) |
| `components/sidebar/` | Workspace sidebar, team column (`team-rail.tsx`), channel and DM rows, invite dialog |
| `components/chat/` | Channel header, message list, dividers, composer (+ autocomplete) |
| `components/messages/` | Message row, body renderer, reactions, actions, attachments |
| `components/threads/`, `search/`, `notifications/`, `saved/` | Feature areas |
| `components/settings/`, `components/admin/` | Settings sections; the admin surface |
| `hooks/` | One hook per concern, all TanStack Query — `useMessages`, `useThread`, `useUsers`, `useTeams`, `useSlashCommands`, `useRealtimeBridge`, … |
| `services/` | The transport seam — one module per domain, plus `http.ts` and `realtimeClient.ts` |
| `store/` | Zustand: UI state, workspace selection, message cache, preferences |
| `config/` | Genuine build-time constants — languages, time zones, status presets |
| `data/` | Mock-transport fixtures **only**; no component imports these |
| `lib/` | Formatters, tokenizer, message grouping, keyboard registry, `cn` |
| `types/index.ts` | The domain model shared by server, services and UI |

---

## How a request flows

**Reading a channel:**

```
MessageList → useMessages() → messageService.list()
  → http.ts → GET /api/v1/channels/:id/messages
    → handler()          error boundary + rate limit
    → requireSession()   cookie or bearer token → SessionContext
    → isMember()         authorise
    → messagesRepo.list()  SQL → Message[]
```

**Sending one, and everyone else seeing it:**

```
composer → messageService.send() → POST .../messages
  → messagesRepo.create()
  → publish("message.created") ──► Redis pub/sub ──► ws/server.ts ──► sockets
  → dispatchOutgoing()  detached; matching webhooks, never awaited
  → 201 with the saved message
```

The optimistic message the composer inserted is reconciled with the server's id
when the response lands — without that, every sent message renders twice.

---

## Architecture decisions

**Components never import `src/data`.** That directory belongs to the mock
transport alone. Identity comes from `useCurrentUserId()`, people from
`useUserMap()` — both backed by the session. `src/config` holds the static
values that genuinely are part of the build.

```
component → hook (TanStack Query) → service → http.ts → mock | REST
```

**All SQL lives in `server/repo`.** Routes authorise and shape responses; repos
own the queries and map rows to domain types. No route writes SQL.

**`handler()` wraps every route**, which makes it the one place to put the error
boundary, validation and rate limiting. Rate limiting cannot be Edge middleware
— `ioredis` will not run there.

**Every route authorises independently.** `requirePage` only stops signed-out
visitors landing on an empty shell; it is not a security boundary.

**A bot is a `users` row** with `is_bot`, not a parallel actor type — so it has
channel memberships and an author identity, and every existing route works for
it unchanged. The consequence is that a bot must be a channel member to post
there; there is no privileged write.

**Denormalised counters are maintained by triggers, not application code.**
`channels.member_count` drifted twice while two code paths were responsible for
it; migration `0003` made it structural.

---

## Security

A full audit was done on 2026-11-13 — see `docs/security-audit.md` for what was
found and fixed. What protects the app, and what a deployment must do:

- **Sessions.** The browser holds a random 256-bit token (`HttpOnly`,
  `SameSite=Lax`, `Secure` in production). Only its SHA-256 is stored, keyed on
  and listed, so a copy of Postgres, Redis or the "active sessions" screen holds
  nothing that can be replayed. Sign-out, a password change and deactivation end
  sessions at once — including live WebSockets.
- **Who may act on whom.** The Owner outranks Administrators, who outrank everyone
  else. You may act only on people below you and hand out only roles below yours;
  nobody changes their own role; only the Owner edits the Administrator role, and
  nobody grants a permission they do not hold (`server/lib/rank.ts`).
- **Cross-site requests.** Changes made from another origin are refused
  (`server/lib/http.ts`); webhook and OAuth-token endpoints, which other servers
  call, are exempt by name. Pages send a Content-Security-Policy,
  `X-Frame-Options: DENY`, `nosniff`, a referrer policy and (in production) HSTS;
  API responses are `no-store` and sandboxed.
- **Uploads.** A file is shown inline only if its bytes really are a PNG, JPEG,
  WebP or GIF. Everything else downloads as an opaque attachment under a sandbox
  CSP, whatever type the uploader claimed — an uploaded HTML page cannot run as the
  app. Bodies are size-limited as they arrive, not by trusting `Content-Length`.
- **Outbound requests** (webhooks, slash commands, OAuth, single sign-on) go
  through `safeFetch`, which refuses private addresses at *connection* time, so
  DNS rebinding cannot slip past the check, and never follows redirects.
- **Passwords** use scrypt N=2^16, r=8, p=2 (OWASP), with the parameters stored in
  each hash. Older hashes keep working and are upgraded at next sign-in. At most
  three hash at once; beyond a short queue a sign-in gets a quick 503, so a flood
  cannot starve the database connections that share Node's thread pool.
- **The gateway** checks the cookie and the `Origin`, limits frame size (4 KB),
  message rate and sockets per person, survives malformed frames, and cuts off a
  socket when its session ends.
- **Secrets.** Nothing sensitive is returned by the API or reaches the browser
  bundle; stored credentials are encrypted or hashed; logs hold no tokens.
  Production refuses to start on a missing, default or short `ENCRYPTION_SECRET`.

**Deploying safely**

1. Put the app behind a TLS-terminating reverse proxy that **appends** the client
   address to `X-Forwarded-For`, and set `TRUSTED_PROXY_HOPS` to the number of
   proxies. Without it the header is ignored (all callers share one address-scoped
   rate-limit bucket); never set it higher than the truth, or clients can pick
   their own address.
2. Set `ENCRYPTION_SECRET`, `DATABASE_URL`, `REDIS_URL`, `PUBLIC_URL` (https) and
   `NEXT_PUBLIC_WS_URL` (`wss://…`); the gateway's `Origin` check uses `PUBLIC_URL`.
3. Leave `OUTBOUND_ALLOW_PRIVATE` off unless integrations live on your own network.
4. Consider `UV_THREADPOOL_SIZE=8`, and rate-limit `/api/v1/auth/*` at the proxy
   too: password checks are deliberately expensive.

**Known limits.** `script-src` still allows inline scripts (Next.js needs per-request
nonces to remove that); there is no CAPTCHA or lockout beyond rate limits; and
until each person signs in once after the hashing upgrade, an account with an old
hash answers a wrong password about 40 ms slower than one without.

---

## Observability

Two things fail quietly on purpose: the rate limiter fails open when Redis is
unreachable, so an outage cannot take the API down with it, and an audit write
that throws is swallowed, so it cannot roll back the action it describes. Both
are the right call and both leave no trace.

`server/lib/metrics.ts` counts them. `GET /api/v1/admin/metrics` exposes the
counters plus a live Redis check and the last audit timestamp, and the admin
dashboard renders a **System health** panel that states outright whether rate
limiting is in effect.

The counters are in-process by design: the first thing they must report is that
Redis is unreachable, which a counter stored in Redis could not do. They reset
on restart, and the panel says so. The audit timestamp is read from Postgres, so
it survives one.

---

## Feature notes

### Adding a person

**Admin → Users → Add member**, or `POST /api/v1/admin/users`. This creates the
account outright rather than inviting one into existence — there is no mail
transport here, so the administrator sets the first password and passes it on.
The password is generated from a look-alike-free alphabet, never echoed back by
the API, and shown once.

From a shell — useful before anyone can sign in to use the form:

```bash
npm run create-user -- --email ada@northwind.io --name "Ada Lovelace" --password "s3cret!"
```

Both go through `usersRepo.create`, so they cannot drift apart.

### Integrations

**Admin → Integrations** covers bot accounts, incoming webhooks, outgoing
webhooks, slash commands, OAuth 2.0 applications and outgoing OAuth connections.
`docs/integrations.md` has the full design. In short: every credential is shown
once and stored as a hash; a bearer token can neither administer the workspace
nor change the account it acts as; and every outbound call goes through the SSRF
guard in `server/lib/outbound.ts`.

Typing `/` at the start of the composer opens the command list. Sending **runs**
the command rather than posting it as text.

`/oauth/authorize` is the consent screen a third-party application sends people
to; it renders scopes in plain English and names the redirect target. Every
integration can be disabled without being deleted. An outgoing webhook or slash
command may authenticate with a stored OAuth connection, whose token is
refreshed on demand.

### Email and password reset

Helix sends mail over SMTP (`SMTP_*` in `.env.local`). Locally that goes to
**Mailpit**, a catch-all inbox started by `npm run db:up`: nothing leaves the
machine, and everything the app sends can be read at <http://localhost:8026>.
In production, point `SMTP_HOST` at your provider. With no host set, features
that need mail say so instead of pretending to send.

**Forgot password** on the sign-in page emails a link to
`/reset-password?token=…`. The link works once and expires after an hour, only
its hash is stored, and asking again replaces the earlier link. Every address
gets the same answer, so the page cannot be used to find out who has an account;
requests are limited per address and per IP. Choosing a new password ends every
session that person had, records an audit entry, and sends a "your password was
changed" notice. Administrators can still reset someone's password by hand under
**Administration → Users**.

### Notification emails

**Settings → Notifications → Email** switches on emails about mentions and direct
messages (on by default). An email is sent only when all of these hold: the
setting is on; the person is away or offline (not at the app, not on Do not
disturb); it is outside their quiet hours, in their own time zone; and their
channel or direct-message level is not "Nothing" (direct messages need "All
messages"). There is at most one email per person per conversation every 10
minutes. Nobody is emailed about a channel they are not in. The rules are in
`server/lib/notify-email.ts`, in one readable function.

### Single sign-on

**Administration → Authentication → Single sign-on** connects an OpenID Connect
provider (Google, Microsoft Entra, Okta, Auth0, Keycloak …). Enter the provider's
issuer address, client ID and client secret (stored encrypted, never shown
again), and add the **redirect address** shown there to the provider. The sign-in
page then offers "Sign in with {name}".

- **Who gets in.** A person already linked to the provider identity (by its
  stable id, not their email); else the account whose email the provider has
  *verified*; else — only if "Create accounts for new people" is on — a new
  Member. Allowed email domains limit who can be linked or created; creating
  accounts needs at least one domain, so a public provider cannot let in
  everyone.
- **Requiring it.** Turns passwords off for everyone except the owner, who can
  always use one if the provider is down. You must have signed in through single
  sign-on yourself first. Members of a workspace that requires it get no
  password-reset emails.
- **What is checked.** Authorization-code flow with PKCE, a one-time `state`
  bound to the browser by a cookie, a nonce, and the ID token's signature,
  issuer, audience and expiry (asymmetric algorithms only). The provider's
  address goes through the same private-address guard as webhooks.
- **Not included.** SAML, LDAP / Active Directory, and automatic provisioning or
  removal of people (SCIM).

To try it locally without a real provider: `docker compose --profile sso up -d
mock-oidc`, then use issuer `http://localhost:8099/helix`, any client ID and
secret, and sign in with whatever username and email claims you type into its
form. Stop it with `docker compose --profile sso stop mock-oidc`.

### Inviting people

**Invite people** (app menu) makes a link that expires after 1, 7 or 30 days and
can be used by 1 person, 10, or without limit. Type email addresses into the box
and the link is emailed to each (up to 20 at a time); leave it empty to share the
link yourself. People who already have an account here are listed instead of
emailed, and addresses the mail server rejects are listed so you can send those
by hand. The full link is shown once. Creating invites is limited to 10 an hour
per person. If mail is not set up, asking to email people is refused before any
link is made.

### Teams

A team is a group of people with channels of their own, inside the one fixed
workspace. **Administration → Teams** (owners and administrators) creates teams,
adds members and files channels under them. Access still comes from channel
membership: adding someone to a team puts them in the team's channels, and
removing them takes them out. The sidebar has a team column to filter channels by
team, showing unread counts for the teams you are not looking at.

### The app menu

Click the workspace name at the top left of the chat. The menu lists Channels,
Administration and Integrations (only for people allowed to use them), Invite
people, About and Sign out, with your current place ticked. It appears only in
the chat workspace; Settings and Administration have their own navigation.

### Status and availability

Availability (Online, Away, Do not disturb) and a custom status ("Lunch", with an
emoji and an optional expiry) are separate. Both are set from the profile menu,
saved on the account and shown to colleagues.

### Everything else

Messages, threads, search, notifications, settings and administration are all
built out — message grouping and day dividers, thread panels and a Threads
inbox, full-text search scoped to the caller's channels, mentions, saved items
and drafts, per-user preferences, and a twelve-page admin surface with charts that
follow a validated categorical palette.

---

## Design system

All colour, radius, elevation and type values live as tokens in
`src/app/globals.css`. Components consume semantic names (`bg-surface`,
`text-fg-muted`, `border-border`, `bg-accent`) and never hardcode a colour.
Light and dark are two token sets behind the same names.

`/design-system` renders the tokens, type scale, button matrix, presence
treatments, form controls and the shared empty / loading / error states.

| Breakpoint | Sidebar | Details panel | Bottom nav |
|---|---|---|---|
| ≥ 1280px | Inline, collapsible to a 64px rail | Inline column | — |
| 1024–1279px | Inline, collapsible | Right slide-over | — |
| 768–1023px | Left drawer | Right slide-over | — |
| < 768px | Left drawer | Right slide-over | Visible |

---

## Troubleshooting

**`formatCompact is not a function`, or a module that clearly exists appears
undefined.** Stale Turbopack state, usually from running `npm run build` while
the dev server was running — they share `.next`. Stop the dev server,
`rm -rf .next`, start it again. Do not run a build against a live dev server.

**`tsc` fails on files in `.next/types` you did not write.** A previous
production build left route types behind. `rm -rf .next/types` and re-run.

**Realtime events stop arriving.** The gateway is a separate process and does
not hot-reload with `next dev`. Restart `npm run ws` after changing anything
under `server/`.

**Ports already in use.** 5434 and 6381 are already offset to avoid host
installs; change them in `docker-compose.yml` and `.env.local` together.

**Single sign-on says "could not be completed".** The server log (`./scripts/helix.sh
logs web`) has the reason: an unreachable issuer, a wrong client secret, or an
ID token that failed a check. Redirect address mismatches show up at the provider.
If you are locked out after requiring it, the owner can still sign in with a
password.

**No email arrives.** Check `SMTP_HOST` is set in `.env.local` and restart the app
(`./scripts/helix.sh restart`) — environment is read at start. Locally, make sure
the Mailpit container is up (`docker ps`) and look in <http://localhost:8026>.
The `mail.sent` / `mail.failed` counters in the admin metrics show what happened.

**A working app with nobody to sign in as.** The database was migrated but not
seeded. `./scripts/helix.sh start` checks for this and seeds automatically;
`npm run dev:all` does not — it migrates only. Run `npm run db:seed`.

**Starting completely over.** `npm run db:reset` destroys the volume and
rebuilds — schema, migrations and seed.

---

## Build history

Each phase was completed and verified before the next began.

| Phase | Scope | State |
| --- | --- | --- |
| 1 | Design tokens, typography, shell, sidebar, top bar, responsive layout | **Done** |
| 2 | Channel header, message list, reactions, composer, attachments | **Done** |
| 3 | Threads | **Done** |
| 4 | Global search, notifications, mentions | **Done** |
| 5 | Profile, preferences, appearance, account settings | **Done** |
| 6 | Admin: dashboard, users, channels, roles, permissions, audit logs | **Done** |
| 7 | Backend integration: auth, REST, WebSocket, PostgreSQL, Redis, storage | **Done** |
| 8 | Hardening: API test harness, authorization, validation, rate limiting, audit | **Done** |
| 9 | Identity decoupling, workspace directory, component test harness | **Done** |
| 10 | Versioned migrations, bounded queries, N+1 removal | **Done** |
| 11 | Channel membership (create, add, leave, archive), non-functional controls resolved | **Done** |
| 12 | Test coverage, CI, rate-limiter and audit observability | **Done** |
| 13 | Integrations: bots, webhooks, slash commands, OAuth 2.0 | **Done** |
| 14 | Slash command autocomplete in the composer | **Done** |
| 15 | OAuth consent screen, integration enable/disable, connection consumer | **Done** |
| 16 | Teams inside one workspace, team column and filter; create/switch workspace retired | **Done** |
| 17 | Blue sidebar and top bar, app menu, working status and availability | **Done** |
| 18 | Email: SMTP module, Mailpit inbox, reset-password by email | **Done** |
| 19 | Invite by email; email notifications for mentions and direct messages | **Done** |
| 20 | Single sign-on (OpenID Connect) | **Done** |
| 21 | Security audit and hardening (`docs/security-audit.md`) | **Done** |
