#!/usr/bin/env bash
#
# Start and stop Helix.
#
# `npm run dev:all` runs both processes in the foreground under `concurrently`,
# which is fine while you watch it and useless when you want to close the
# terminal. This runs them detached, records their process groups, and can stop
# exactly what it started.
#
#   ./scripts/helix.sh start     web + gateway, with Docker and migrations
#   ./scripts/helix.sh stop      stop both (add --docker to stop the containers)
#   ./scripts/helix.sh restart
#   ./scripts/helix.sh status
#   ./scripts/helix.sh logs [web|ws]
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

RUN_DIR="$ROOT/.run"
WEB_PORT=3000
WS_PORT=3101

mkdir -p "$RUN_DIR"

# Colour only when a terminal is attached, so piped output stays clean.
if [ -t 1 ]; then
  BOLD=$'\e[1m'; DIM=$'\e[2m'; RED=$'\e[31m'; GREEN=$'\e[32m'; YELLOW=$'\e[33m'; RESET=$'\e[0m'
else
  BOLD=""; DIM=""; RED=""; GREEN=""; YELLOW=""; RESET=""
fi

say()  { printf '%s\n' "$*"; }
ok()   { printf '  %s✓%s %s\n' "$GREEN" "$RESET" "$*"; }
warn() { printf '  %s!%s %s\n' "$YELLOW" "$RESET" "$*"; }
bad()  { printf '  %s✗%s %s\n' "$RED" "$RESET" "$*"; }
die()  { printf '\n%s✗%s %s\n\n' "$RED" "$RESET" "$*" >&2; exit 1; }

# --- process bookkeeping ---------------------------------------------------
#
# Each service gets its own process group via setsid, because `next dev` and
# `tsx watch` both spawn children: killing the parent alone orphans them and
# leaves the port held.

pgid_file() { echo "$RUN_DIR/$1.pgid"; }
log_file()  { echo "$RUN_DIR/$1.log"; }

# Echoes the recorded process group if it is still alive, else nothing.
live_pgid() {
  local file; file="$(pgid_file "$1")"
  [ -f "$file" ] || return 1
  local pgid; pgid="$(cat "$file" 2>/dev/null)"
  [ -n "$pgid" ] || return 1
  # A process group is alive if any member is.
  if kill -0 "-$pgid" 2>/dev/null; then echo "$pgid"; return 0; fi
  # Stale file from a crash or a reboot — clean it up rather than trust it.
  rm -f "$file"
  return 1
}

port_busy() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

start_service() {
  local name="$1" command="$2"
  if live_pgid "$name" >/dev/null; then
    warn "$name is already running (pgid $(live_pgid "$name"))"
    return 0
  fi

  # setsid detaches into a new session and process group; the pgid equals the
  # pid of the leader, which is what we record.
  setsid bash -c "$command" >"$(log_file "$name")" 2>&1 &
  local pid=$!
  echo "$pid" > "$(pgid_file "$name")"
  ok "$name started (pgid $pid)"
}

stop_service() {
  local name="$1" pgid
  if ! pgid="$(live_pgid "$name")"; then
    say "  $DIM$name is not running$RESET"
    rm -f "$(pgid_file "$name")"
    return 0
  fi

  # Ask politely first: next dev flushes its build state on SIGTERM.
  kill -TERM "-$pgid" 2>/dev/null
  for _ in $(seq 1 20); do
    kill -0 "-$pgid" 2>/dev/null || break
    sleep 0.25
  done

  if kill -0 "-$pgid" 2>/dev/null; then
    warn "$name ignored SIGTERM, sending SIGKILL"
    kill -KILL "-$pgid" 2>/dev/null
    sleep 0.5
  fi

  rm -f "$(pgid_file "$name")"
  ok "$name stopped"
}

wait_for_port() {
  local port="$1" label="$2" limit="${3:-90}"
  for _ in $(seq 1 "$limit"); do
    port_busy "$port" && { ok "$label is answering on :$port"; return 0; }
    sleep 1
  done
  bad "$label did not come up on :$port within ${limit}s"
  say "    last lines of its log:"
  tail -n 15 "$(log_file "$2")" 2>/dev/null | sed 's/^/      /'
  return 1
}

# --- commands --------------------------------------------------------------

cmd_start() {
  say ""
  say "${BOLD}Starting Helix${RESET}"

  # Someone else on the port is a different problem from our own service
  # running, and deserves a different message.
  for pair in "$WEB_PORT:web" "$WS_PORT:ws"; do
    local port="${pair%%:*}" name="${pair##*:}"
    if port_busy "$port" && ! live_pgid "$name" >/dev/null; then
      die "Port $port is held by something this script did not start. Free it, or run 'stop' first."
    fi
  done

  say "${DIM}Infrastructure${RESET}"
  # --wait, not a bare `up -d`: without it the migration below races a Postgres
  # that has been created but is not yet accepting connections.
  docker compose up -d --wait >/dev/null 2>&1 || die "Docker failed to start Postgres and Redis."
  ok "Postgres and Redis are healthy"

  say "${DIM}Database${RESET}"
  npm run --silent db:migrate >/dev/null 2>&1 || die "Migrations failed. Run 'npm run db:migrate' to see why."
  ok "migrations applied"

  # A migrated but unseeded database gives a working app with nobody to sign in
  # as — the exact papercut that makes a fresh checkout look broken.
  local users
  users="$(docker compose exec -T postgres psql -U helix -d helix -tA -c 'SELECT count(*) FROM users' 2>/dev/null || echo 0)"
  if [ "${users:-0}" -eq 0 ]; then
    warn "no accounts found — seeding the demo workspace"
    npm run --silent db:seed >/dev/null 2>&1 || die "Seeding failed. Run 'npm run db:seed' to see why."
    ok "seeded"
  else
    ok "$users accounts present"
  fi

  say "${DIM}Processes${RESET}"
  start_service web "npm run dev"
  start_service ws  "npm run dev:ws"

  say "${DIM}Readiness${RESET}"
  wait_for_port "$WEB_PORT" web || exit 1
  wait_for_port "$WS_PORT" ws 30 || exit 1

  say ""
  say "  ${BOLD}http://localhost:$WEB_PORT${RESET}"
  say "  ${DIM}sign in with harman.singh@northwind.io / helix-demo-password${RESET}"
  say "  ${DIM}logs: ./scripts/helix.sh logs web${RESET}"
  say ""
}

cmd_stop() {
  say ""
  say "${BOLD}Stopping Helix${RESET}"
  stop_service web
  stop_service ws

  # Containers stay up by default: they hold the database, and leaving them
  # running makes the next start seconds rather than a re-migration.
  if [ "${1:-}" = "--docker" ]; then
    docker compose stop >/dev/null 2>&1 && ok "Postgres and Redis stopped"
  else
    say "  ${DIM}Postgres and Redis left running (--docker also stops them)${RESET}"
  fi
  say ""
}

cmd_status() {
  say ""
  say "${BOLD}Helix status${RESET}"

  for pair in "web:$WEB_PORT" "ws:$WS_PORT"; do
    local name="${pair%%:*}" port="${pair##*:}" pgid
    if pgid="$(live_pgid "$name")"; then
      ok "$name  running (pgid $pgid), port $port $(port_busy "$port" && echo open || echo "${YELLOW}not yet open${RESET}")"
    elif port_busy "$port"; then
      warn "$name  not started by this script, but something holds :$port"
    else
      say "  ${DIM}·${RESET} $name  stopped"
    fi
  done

  local containers
  containers="$(docker compose ps --services --filter status=running 2>/dev/null | tr '\n' ' ')"
  if [ -n "${containers// /}" ]; then
    ok "containers  ${containers}"
  else
    say "  ${DIM}·${RESET} containers  stopped"
  fi
  say ""
}

cmd_logs() {
  local which="${1:-web}"
  local file; file="$(log_file "$which")"
  [ -f "$file" ] || die "No log for '$which'. Expected $file"
  tail -n 60 -f "$file"
}

case "${1:-}" in
  start)   cmd_start ;;
  stop)    cmd_stop "${2:-}" ;;
  restart) cmd_stop "${2:-}"; cmd_start ;;
  status)  cmd_status ;;
  logs)    cmd_logs "${2:-web}" ;;
  *)
    say ""
    say "${BOLD}Usage${RESET}  ./scripts/helix.sh <command>"
    say ""
    say "  start              Docker, migrations, seed if empty, web + gateway"
    say "  stop [--docker]    stop web + gateway; --docker also stops containers"
    say "  restart            stop then start"
    say "  status             what is running"
    say "  logs [web|ws]      follow a service's log"
    say ""
    exit 1
    ;;
esac
