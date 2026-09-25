# Helix

Team communication for engineering organisations — a workspace / channel /
thread product with a real backend: PostgreSQL, Redis, a WebSocket gateway,
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
- [Testing](#testing) · [CI](#continuous-integration) · [Observability](#observability)
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

Every seeded account shares that password. `alice.johnson@northwind.io` is an
administrator and `bob.smith@northwind.io` an ordinary member — useful for
seeing the permission boundaries from both sides.

### Prerequisites

| Need | Version | Why |
|---|---|---|
| Node.js | 22+ | The app; CI pins 22 |
| Docker + Compose | any current | Runs Postgres 16 and Redis 7 |
| Free ports 3000, 3101, 5434, 6381 | — | Web, gateway, database, cache |

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
| `ENCRYPTION_SECRET` | dev fallback | AES-256-GCM key for outgoing OAuth credentials |
| `PUBLIC_URL` | `http://localhost:3000` | Builds the webhook URLs shown to admins |
| `OUTBOUND_ALLOW_PRIVATE` | `false` (`true` locally) | Lets integrations reach private addresses |
| `NEXT_PUBLIC_USE_MOCK` | `false` | `true` serves fixtures with no backend at all |
| `NEXT_PUBLIC_API_URL` | `/api/v1` | Where the client sends REST calls |
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:3101` | Where the client opens its socket |

Two deserve more than a table row:

**`ENCRYPTION_SECRET`** has a development fallback so a clean checkout runs, but
set a real value before storing any real credential. Rotating it makes existing
outgoing-OAuth connections undecryptable — which is the correct failure, since
the alternative is silently trusting a default.

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
| `npx tsc --noEmit` | Typecheck — **Vitest does not typecheck**, so run this |
| `npm test` / `test:watch` | Vitest, both suites |
| `npm run db:up` / `db:down` | Start / stop Postgres and Redis |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:seed` | Load the demo workspace (idempotent) |
| `npm run db:reset` | Destroy the volume and rebuild from scratch |
| `npm run create-user -- --email … --name … --password …` | Add a person from the shell |

Run `tsc`, `lint`, `test` and `build` before calling anything done. They catch
different things: the missing-field errors `tsc` finds never reach Vitest, and
`next build` compiles route types the dev server does not.

---

## Project map

### Root

| Path | Job |
|---|---|
| `docker-compose.yml` | Postgres 16 + Redis 7, project `helix`, offset ports, healthchecks |
| `vitest.config.mts` | Two test projects — `integration` (real services) and `component` (jsdom) |
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
| `app/api/v1/**/route.ts` | The REST API — 99 handlers across 81 files, each authorising independently |
| `app/login`, `app/workspace` | Sign-in and the main three-column application |
| `app/settings/*` | Profile, preferences, appearance, notifications, account |
| `app/admin/*` | Dashboard, users, roles, permissions, channels, storage, audit, integrations |
| `app/design-system` | Live token, type-scale and component reference |
| `app/globals.css` | **Every design token.** Colour, radius, elevation, type, density |

### `src/` — the client

| Path | Job |
|---|---|
| `components/ui/` | Primitives — button, dialog, dropdown, popover, sheet, tabs, tooltip |
| `components/common/` | Avatar, presence, badges, empty / loading / error states |
| `components/layout/` | App shell, top bar, right panel, mobile tab bar |
| `components/sidebar/` | Workspace sidebar, channel and DM rows, switcher |
| `components/chat/` | Channel header, message list, dividers, composer (+ autocomplete) |
| `components/messages/` | Message row, body renderer, reactions, actions, attachments |
| `components/threads/`, `search/`, `notifications/`, `saved/` | Feature areas |
| `components/settings/`, `components/admin/` | Settings sections; the admin surface |
| `hooks/` | One hook per concern, all TanStack Query — `useMessages`, `useThread`, `useUsers`, `useSlashCommands`, `useRealtimeBridge`, … |
| `services/` | The transport seam — one module per domain, plus `http.ts` and `realtimeClient.ts` |
| `store/` | Zustand: UI state, workspace selection, message cache, preferences |
| `config/` | Genuine build-time constants — languages, time zones, status presets |
| `data/` | Mock-transport fixtures **only**; no component imports these |
| `lib/` | Formatters, tokenizer, message grouping, keyboard registry, `cn` |
| `types/index.ts` | The domain model shared by server, services and UI |

### `tests/`

| Path | Job |
|---|---|
| `integration/helpers.ts` | `signIn`, `db()`, `cache()`, `clearRateLimit`, the demo accounts |
| `integration/global-setup.ts` | Applies the schema and clears rate-limit buckets once |
| `integration/route-surface.test.ts` | Walks the app directory and asserts every route's auth |
| `integration/*.test.ts` | Messaging, threads, search, account, admin, integrations, performance |
| `component/render.tsx` | `renderWithProviders`, `makeUser`, `makeMessage`, `resetMessageStore` |
| `component/*.test.tsx` | Identity-dependent UI, the add-member form, slash commands |

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

## Testing

`npm test` runs Vitest against **real** Postgres and Redis, not mocks, so the
assertions cover what actually ships — routing, cookies, SQL and all. The
harness pins `NEXT_PUBLIC_USE_MOCK=false`; without it a test would pass while
exercising fixtures.

The integration suite needs the app running (`npm run db:up` and `npm run dev`).

- **integration** — authorization boundaries, body validation, jsonb
  allow-lists, rate limiting, audit writes, upload reconciliation, the
  message / reaction / thread / search contracts, account security (a password
  change must revoke other sessions *in Redis*, not only in Postgres), and all
  six integration types end to end.
- **component** — React in jsdom with the query cache seeded directly, so a test
  states who the viewer is rather than mocking the network.

### The route-surface test

`tests/integration/route-surface.test.ts` walks `src/app/api/v1`, derives the
route table from the filesystem, and asserts that every route refuses an
anonymous caller with 401 and every `/admin` route refuses an ordinary member
with 403.

Discovering routes rather than listing them means a route added tomorrow is
covered without anyone remembering — the check cannot quietly fall behind the
code. Status codes are asserted exactly: a 400 would mean the body was parsed
before the session was checked, a 404 would confirm an id exists. Four routes
are exempt and say why — sign-in, idempotent sign-out, and the two endpoints
authenticated by something other than a session.

---

## Continuous integration

`.github/workflows/ci.yml` runs lint → typecheck → migrate → seed → build →
start the production server → test, with Postgres and Redis as job services.

Typecheck runs *before* the build, because a production build writes
`.next/types` that a later `tsc` would read as though they were source.

> Not yet proven in Actions — the workflow has never run, because the repository
> has no remote. The sequence was verified locally against a freshly created
> database.

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

### Everything else

Messages, threads, search, notifications, settings and administration are all
built out — message grouping and day dividers, thread panels and a Threads
inbox, full-text search scoped to the caller's channels, mentions, saved items
and drafts, per-user preferences, and a ten-page admin surface with charts that
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

**Tests fail with "No server at http://localhost:3000".** The integration suite
drives the real API over HTTP. Start `npm run db:up` and `npm run dev` first.

**A test account is locked out.** A suite that exercises the login limiter
leaves the window spent. `global-setup.ts` clears `ratelimit:*` at the start of
every run; to clear one by hand:

```bash
docker exec helix-redis redis-cli --scan --pattern 'ratelimit:*' \
  | xargs -r docker exec -i helix-redis redis-cli del
```

**Realtime events stop arriving.** The gateway is a separate process and does
not hot-reload with `next dev`. Restart `npm run ws` after changing anything
under `server/`.

**Ports already in use.** 5434 and 6381 are already offset to avoid host
installs; change them in `docker-compose.yml` and `.env.local` together.

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
