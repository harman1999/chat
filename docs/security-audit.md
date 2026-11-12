# Security audit — 2026-11-13

Scope: the whole application (Next.js API and pages, WebSocket gateway, Postgres,
Redis, configuration, dependencies, git history). Method: code review, a sweep of
every API route as anonymous / member / administrator / owner / a user of another
workspace, hostile-input fuzzing of every route, targeted attacks, and a stress
test of a production build. Every finding below was **reproduced against the
running app before it was fixed, and re-tested after**.

No test files were added to the repository (by request); the attack scripts were
run from a scratch folder.

## Findings

| # | Severity | Finding | How it was shown | Fix |
|---|---|---|---|---|
| 1 | **Critical** | Any Administrator could make themselves Owner, demote the Owner, deactivate the Owner (ending their sessions), or create a new Owner account. The role, status and create-user routes checked the permission but not *rank*. | An administrator changed their own role to Owner (204) and deactivated the real Owner. | `server/lib/rank.ts`: act only on people below you, assign only roles below yours, nobody changes their own role, only the Owner edits the Administrator role, nobody grants a permission they do not hold. 24 attack/allowed cases re-tested. |
| 2 | **High** | Stored XSS through file uploads. Files were served with the *uploader's* content type and `inline`; an HTML or SVG attachment ran as the app, with the opener's session. | An uploaded `evil.html` came back as `text/html; inline` to another channel member. | Inline only if the bytes really are PNG/JPEG/WebP/GIF; everything else `application/octet-stream` + `attachment`; `nosniff`, sandbox CSP, `Cross-Origin-Resource-Policy`. |
| 3 | **High** | The WebSocket gateway could be crashed by one malformed or oversized frame (unhandled `error` event), cutting realtime for every user. Also: no `Origin` check, 100 MB default frame size, no message-rate or connection limits, sockets outlived sign-out, unreachable cleanup for sockets that closed during setup. | A 5 MB frame killed the process. | Error handlers first; `maxPayload` 4 KB; `Origin` allow-list; 20 frames/s; 10 sockets per person; sessions re-checked every 30 s; listeners attached before any `await`; `/health` reveals nothing. 13 hostile-frame cases survived. |
| 4 | **High** | Session token exposure: the cookie value was the stored session id, returned in the login response body and listed by `/users/me/sessions`; also used verbatim in Redis rate-limit key names. | Login response had `accessToken` equal to the cookie; the sessions list contained the live id. | Cookie is a random 256-bit token; only its SHA-256 is stored, keyed on, listed, or used in Redis keys; the body no longer carries it. (Everyone is signed out once on deploy.) |
| 5 | **High** | Request-size limits could be skipped: they trusted `Content-Length`, so a chunked body had no limit. | A 60 MB chunked "JSON" body was fully buffered and parsed against a 1 MB limit. | `readBytes()` counts bytes as they arrive; used for JSON, images, logos, file uploads and OAuth token requests. Refused bodies are drained so the connection stays usable. |
| 6 | **High** | Production dependencies: Next.js 16.3.5 (RCE paths in image optimisation and `use cache`, SSRF, cache poisoning), `zod`, `sharp`, `source-map-js`. | `npm audit`: 1 critical, 3 high. | Next 16.4.6 and patched versions. `npm audit --omit=dev`: 0. (7 moderate remain, all in ESLint tooling, never shipped.) |
| 7 | **High** | Production would start with the **publicly known default** `ENCRYPTION_SECRET` (and default database password, http `PUBLIC_URL`), encrypting stored credentials with a key printed in the source. | Read of `server/env.ts`. | `server/lib/production-check.ts`, run at server start: refuses missing, placeholder or short secrets, the default DB password, missing Redis, non-https public URL. |
| 8 | **Medium** | Client address taken from the client-controlled left of `X-Forwarded-For`: per-IP rate limits could be dodged by rotating a made-up address, and false addresses were written to the audit log and session list. | 40 forgot-password requests with 40 forged addresses all passed a limit of 20; the session recorded `6.6.6.6`. | `TRUSTED_PROXY_HOPS`: read from the right by the number of trusted proxies; ignored when 0. |
| 9 | **Medium** | DNS rebinding could bypass the SSRF guard (the name was checked, then resolved again by `fetch`). | Simulated hostile DNS answered public, then 127.0.0.1. | `safeFetch` validates the address the connection actually uses; no redirects; response capped. Used by webhooks, slash commands, OAuth and single sign-on. |
| 10 | **Medium** | A flood of sign-ins starved Node's worker-thread pool, which also does the DNS lookups database connections need: 24 of 300 requests failed with 500 and queued for 7 s. | 100 concurrent bad logins. | At most 3 hashes at once, short queue, fast 503 beyond it. After: 0 errors; normal requests stayed at ~40 ms. |
| 11 | **Medium** | Cross-origin state-changing requests accepted from other origins on the same site (e.g. another port on localhost). | Login accepted from `http://localhost:4000`. | Origin check in `handler()`; `evil.example`, `null` and other ports now 403. |
| 12 | **Medium** | No security headers: no CSP, clickjacking protection, `nosniff`, referrer policy, HSTS; `X-Powered-By` revealed the framework. | Response headers. | `next.config.ts`: CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP, HSTS (production), `no-store` + sandbox CSP on `/api`. |
| 13 | **Low** | Password hashing at Node's default scrypt cost (16 MiB, ~40 ms) with the parameters not stored, so it could never be raised. | Measured. | N=2^16, r=8, p=2 (OWASP), parameters stored in each hash, upgraded at next sign-in, timing equalised for unknown/old accounts. |
| 14 | **Low** | A NUL character in any text reached Postgres and produced a 500 (16 routes). | Fuzzing. | Rejected with 400 centrally (body, path, query). |

## Checked and found sound

- **Secrets:** none in the working tree or the whole git history; `.env.local` never committed; no server variable or secret value in the browser bundle; no dotfile, source or `.env` reachable over HTTP; the API never returns hashes, secrets or full tokens (57 endpoints read as owner and scanned); logs contain no tokens, cookies or passwords. The one committed "capture" (`scripts/har`) was a screenshot.
- **Authentication boundary:** of 138 route/method pairs, 127 refuse anonymous callers with 401 and the other 11 are the public ones by design; 53/53 admin pairs refused to a member.
- **Tenant isolation:** 17/17 attempts by a real user of another workspace refused (read, write, search, DMs, admin, avatars, logos).
- **Private channels, DMs, other people's messages:** all refused to non-members.
- **SQL injection:** every query is parameterised; the only interpolations are constants and one fixed-map table name.
- **XSS in messages:** React rendering, no `dangerouslySetInnerHTML`, links only `http(s)` with `noopener`.
- **SSRF guard:** 34 bypass forms blocked (decimal/hex/octal IPs, IPv6-mapped, metadata addresses, `user@host` tricks, non-http schemes).
- **Single sign-on:** PKCE, one-time `state` bound to the browser, nonce, signature/issuer/audience/expiry checks; 13 forged-token cases refused (unsigned, wrong key, HS256 with the public key, wrong audience…).
- **One-time secrets:** a 1-use invite redeemed by 25 parallel requests created exactly 1 account; a reset link used 20 times at once succeeded once.
- **HTTP layer:** 100 KB URLs/headers → 431, request-smuggling probe → 400, 1,500 stalled connections cost nothing.
- **Logout:** a copied cookie is dead after sign-out.

## Stress test (production build, 8 cores)

| Scenario | Result |
|---|---|
| Mixed reads, 60 concurrent | 645 req/s, p99 141 ms, 0 errors |
| Writes, 50 concurrent | 583 req/s, p99 199 ms, 0 errors |
| Search, 80 concurrent | limited to 60/min per user as designed (429); latency unaffected |
| 100 concurrent bad sign-ins | ~10/s handled, the rest a fast 503; 0 errors; other requests unaffected |
| 1,500 stalled connections | normal requests 14 ms |
| WebSocket floods and malformed frames | all refused or cut off; gateway never down |

## Remaining risks / recommendations

- `script-src` allows inline scripts (Next.js needs per-request nonces to drop this). Output encoding is the real XSS defence today.
- Expensive password hashing means a distributed attacker can saturate sign-in capacity (~10/s) and delay legitimate sign-ins; rate-limit `/api/v1/auth/*` at the proxy too.
- Until each person signs in once after the hashing upgrade, an old-hash account answers a wrong password ~40 ms slower than an unknown address.
- No two-factor sign-in and no account-lockout notification (see `pendingtask.md`).
- Set `TRUSTED_PROXY_HOPS` correctly in production; too high lets clients choose their address.
- Re-run `npm audit --omit=dev` on every release.
