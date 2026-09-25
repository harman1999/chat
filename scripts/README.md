# scripts/

Two scripts. One runs the application, one adds a person to it.

| Script | What it is for |
|---|---|
| `helix.sh` | Start, stop and inspect the running application |
| `create-user.ts` | Create a workspace member from the shell |

---

## helix.sh — running the application

```bash
./scripts/helix.sh start      # or: npm run app:start
./scripts/helix.sh stop       #     npm run app:stop
./scripts/helix.sh restart    #     npm run app:restart
./scripts/helix.sh status     #     npm run app:status
./scripts/helix.sh logs web   # follow a log — web or ws
```

### First run on a machine

```bash
npm install
cp .env.example .env.local     # the defaults work as-is for local development
./scripts/helix.sh start
```

That is the whole setup. `start` does the rest:

1. `docker compose up -d --wait` — Postgres and Redis, **waiting for health**
2. `npm run db:migrate` — applies any pending migration
3. **seeds if the `users` table is empty** — see below
4. starts `next dev` (:3000) and the WebSocket gateway (:3101), detached
5. waits for both ports to answer before telling you it worked

Then open <http://localhost:3000> and sign in:

| | |
|---|---|
| Owner | `harman.singh@northwind.io` |
| Admin | `alice.johnson@northwind.io` |
| Member | `bob.smith@northwind.io` |
| Password (all) | `helix-demo-password` |

Signing in as the admin and the member is the quickest way to see the
permission boundaries from both sides.

### Every run after that

```bash
./scripts/helix.sh start
```

Same command. Migrations and the seed check are cheap no-ops when there is
nothing to do.

### Stopping

```bash
./scripts/helix.sh stop            # stops web + gateway
./scripts/helix.sh stop --docker   # also stops Postgres and Redis
```

Containers are left running by default. They hold the database, and keeping
them makes the next start take seconds rather than a full re-migration. Use
`--docker` when you are done for the day or need the ports back.

### Reading the output

```
$ ./scripts/helix.sh status

Helix status
  ✓ web  running (pgid 55757), port 3000 open
  ✓ ws  running (pgid 55761), port 3101 open
  ✓ containers  postgres redis
```

Three states per service, and they mean different things:

| Line | Meaning |
|---|---|
| `running (pgid …)` | This script started it and it is alive |
| `not started by this script, but something holds :3000` | A stray process, or one you started yourself with `npm run dev` |
| `stopped` | Nothing there |

That middle case is why `start` refuses rather than racing: it will not fight
something it did not start.

### Why it is a script and not just `npm run dev:all`

`npm run dev:all` runs both processes in the foreground under `concurrently`.
That is the right thing while you are watching the output, and useless when you
want your terminal back. Both still exist; use whichever fits.

The script also handles three things `dev:all` does not:

**It seeds an empty database.** A migrated but unseeded database gives you a
working application with nobody to sign in as, which looks exactly like a broken
build. `dev:all` migrates only.

**It kills the whole process tree.** `next dev` and `tsx watch` each spawn
children. Killing the parent alone orphans them and leaves the port held, so
every service runs in its own process group (`setsid`) and the *group* is what
gets signalled — SIGTERM, five seconds of grace, then SIGKILL.

**It survives crashes.** Process ids live in `.run/` (gitignored). A stale file
left by a crash or a reboot is detected and cleaned rather than believed.

### When something goes wrong

```bash
./scripts/helix.sh logs web    # Next.js
./scripts/helix.sh logs ws     # the gateway
```

Logs are plain files in `.run/`, so `cat`, `grep` and an editor all work too.

| Symptom | Cause |
|---|---|
| `Port 3000 is held by something this script did not start` | A `npm run dev` you started by hand, or a stray from a crash. Find it with `lsof -i :3000`. |
| `Migrations failed` | Run `npm run db:migrate` directly — the script hides output, that does not |
| `Docker failed to start Postgres and Redis` | `docker compose ps` and `docker compose logs postgres` |
| Realtime events stop arriving | The gateway does not hot-reload. `./scripts/helix.sh restart` after changing anything in `server/` |
| Everything is strange after a build | `next build` and `next dev` share `.next`. Stop, `rm -rf .next`, start. |

To wipe and rebuild the database completely:

```bash
npm run db:reset      # destroys the volume, re-migrates, re-seeds
```

---

## create-user.ts — adding a person

```bash
npm run create-user -- --email ada@northwind.io --name "Ada Lovelace" --password "a-long-password"
```

| Flag | Required | Default |
|---|---|---|
| `--email` | yes | |
| `--name` | yes | |
| `--password` | yes | at least 12 characters |
| `--username` | no | derived from the name (`ada.lovelace`) |
| `--role` | no | `role_member` — also `role_admin`, `role_owner`, `role_moderator`, `role_guest` |
| `--title` | no | empty |
| `--department` | no | empty |
| `--timezone` | no | `UTC` |
| `--channels` | no | `general` — comma separated, public channels only |

```bash
npm run create-user -- \
  --email ada@northwind.io \
  --name "Ada Lovelace" \
  --password "a-long-password" \
  --role role_admin \
  --title "Principal Engineer" \
  --channels general,backend
```

### Why a script rather than SQL

Passwords are stored as `scrypt$<salt>$<derived>`. Postgres cannot produce that,
so an `INSERT` by hand creates an account nobody can sign in to.

### It is the same code as the admin form

**Admin → Users → Add member** does exactly this. Both call `usersRepo.create`,
so the validation and the resulting row are identical either way — they cannot
drift apart.

The script exists for the case the form cannot cover: the first administrator,
before anyone can sign in to use the form. After that, prefer the form.

### What it refuses, and why it says which

Each refusal names a different field to fix:

| Message | Fix |
|---|---|
| `… already has an account` | The email is taken |
| `The username "…" is taken` | Pass `--username` |
| `Unknown role "…"` | Use one of the roles listed above |
| `No public channel named: …` | Check `--channels`; private channels are not allowed |

Nothing is written when it refuses — the account, its preferences and its
channel memberships are one transaction.
