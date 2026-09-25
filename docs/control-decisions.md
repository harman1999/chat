# Non-functional control decisions

Phase 6 shipped 43 controls that rendered but did nothing. This records what
happens to each and why, so "delete" is a decision on the record rather than an
omission.

A control that lies is worse than one that is absent. Where no feature is
planned, the control goes.

## Build — the feature is real and worth having

| Control | Where | Work |
|---|---|---|
| Add channels / Create channel | sidebar, admin | `POST /channels` + dialog |
| Add people to this channel | channel intro, details panel, admin | `POST /channels/:id/members` + picker |
| Manage members | admin channels | opens the details panel for that channel |
| Archive channel | channel header, admin | `PUT /channels/:id/archive` |
| Leave channel | channel header | `DELETE /channels/:id/members/me` |

## Wire — the capability already exists

| Control | Why it was dead | Fix |
|---|---|---|
| Download *file* | no `href` | anchor to `/api/v1/files/:id/content` with `download` |
| Change role | toast only | submenu calling the existing `PUT /admin/users/:id/role` |
| Copy URL (SCIM) | no handler | clipboard write |
| Export CSV (audit) | no handler | build the CSV client-side from loaded rows |
| Sign out of *workspace* | no handler | the same `authService.signOut` the profile menu uses |

## Keep, but made honest

| Control | Reason |
|---|---|
| Start a call / Start a video meeting | Explicitly specified as placeholders. Kept, but disabled with a tooltip saying calling is not available, rather than silently doing nothing. |

## Delete — no feature behind them, and none planned

| Control | Reason |
|---|---|
| Rotate token (SCIM) | Implies an API-token concept with no table, endpoint or roadmap. Building token rotation to justify a button is backwards. |
| Configure (auth provider) | Provider config lives in secret storage by design, not in this UI. |
| Request export (workspace) | Needs a job runner and object delivery. Out of scope; a button that queues nothing is a lie. |
| Create a workspace | The schema is one workspace per user. Multi-workspace is not modelled. |
| Set up two-factor | No enrolment flow, no TOTP secret storage. |
| Deactivate workspace | Irreversible, no endpoint, and no confirmation design. |
| Help centre / Help and resources | No documentation site exists to link to. |
| Upload photo / Remove (avatar) | Upload plumbing exists, but avatar storage, cropping and defaults do not. Deferred rather than faked. |
| Rename role, Create role | Role CRUD beyond permission toggling is not modelled. |
| Delete channel | Archive covers the real need; hard delete has no retention story. |
| Notification settings (bell popover gear) | Duplicates `/settings/notifications`, which is reachable and real. |
| Resend invitation / Send password reset | Both need outbound email. Deferred; see below. |
| Member rows in the details panel | A profile dialog is a feature in its own right, not a wiring gap. |
| Retry (failed message) | Send already retries optimistically; a manual retry needs a queue this does not have. |
| @mention pill | Opening a profile card — same dependency as member rows. |
| Mark unread | Needs a read-cursor rewind endpoint; the cursor is per-channel, not per-message. |

**Invitations and password reset** are deliberately not built. Both are
meaningful features, but both are fundamentally about sending email, and there
is no mail transport here. A copy-this-link workaround would be a different
feature wearing their labels.

## Addendum — a bug the wiring exposed

Wiring "Add people" made `channels.member_count` load-bearing for the first
time. Verifying the flow against the database showed the column was already
wrong everywhere it had been seeded: `#general` claimed **428** members in a
**58**-user workspace, `#random` 312, `#backend` 53 against 3 real rows.

The cause was in `server/db/seed.ts`, not in the new code — it wrote the
fixture's decorative `memberCount` into the column while inserting only the
memberships the fixture actually lists. The new repo methods maintain the
counter correctly, so the dialog would have incremented a false base.

Fixed by deriving the seeded count from the memberships inserted, and by
correcting the mock fixtures so mock mode does not show the same false number.
Two assertions in `tests/integration/channels.test.ts` now hold the invariant
across every channel, not only the ones a test creates: no count may disagree
with its membership rows, and none may exceed the workspace's user count.


## Addendum — two claims that were not controls

A control that lies is worse than one that is absent; so is a *statement* that
lies, and the Phase 11 pass only looked at things you could click.

The admin dashboard's "Needs attention" panel carried two:

- **"Two-factor authentication is not enforced"** was static text. It would have
  gone on saying that after someone enforced it. It now reads
  `systemSettings.requireTwoFactor` and states either case.
- **"Uptime 99.98% over 30 days"** was a literal in `adminRepo.stats`, with a
  comment noting that uptime comes from a monitoring system this deployment does
  not have. The row is gone and so is the `uptimePercent` field, so nothing can
  render it again. The System health panel reports what is genuinely known:
  process uptime, Redis reachability, and the last audit write.
