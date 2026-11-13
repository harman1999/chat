# Pending tasks — what Helix lacks (compared with Mattermost / Slack)

Written 2026-11-12. Not every item was re-checked against the code, so confirm
before starting one.

## Sign-in and security
- [x] Single sign-on with OpenID Connect (Google, Entra, Okta, Auth0…) — done 2026-11-13
- [ ] Single sign-on: SAML
- [ ] Directory sign-in: LDAP / Active Directory
- [ ] Automatic provisioning and removal of people (SCIM)
- [x] Two-factor login with authenticator-app codes and recovery codes; can be required per workspace — done 2026-11-14
- [ ] Two-factor: hardware keys / passkeys (WebAuthn)
- [ ] Two-factor: email the person when a recovery code is used or two-factor is turned off
- [x] Security audit and hardening — done 2026-11-13 (`docs/security-audit.md`)
- [ ] Remove `'unsafe-inline'` from `script-src` (needs per-request CSP nonces)
- [ ] Notify people of repeated failed sign-ins / lock an account after many failures
- [ ] Automated security regression tests (the audit's attack scripts were run by hand, not kept in the repo)

## Email and push
- [x] Mail server (SMTP + Mailpit) and password-reset emails — done 2026-11-12
- [x] Email the invite link when an admin invites someone — done 2026-11-12
- [x] Email notifications for mentions and direct messages, with an on/off setting — done 2026-11-12
- [ ] Email for thread replies and keywords (only mentions and direct messages are emailed today)
- [x] Saved preferences load from the account on a new browser — done 2026-11-13
- [ ] Mobile push notifications

## Apps
- [ ] Native mobile apps
- [ ] Native desktop apps (today there is only the responsive web page)

## Calls
- [ ] Voice and video calls
- [ ] Huddles
- [ ] Screen sharing

## Messaging extras
- [ ] Scheduled messages
- [ ] Reminders
- [ ] Custom emoji
- [ ] Link previews
- [ ] Sidebar categories
- [ ] Guest accounts
- [ ] External shared channels

## Beyond chat
- [ ] Workflow builder
- [ ] Task boards and playbooks
- [ ] App marketplace

## Enterprise
- [ ] Compliance export
- [ ] Legal hold
- [ ] Multi-server setup (high availability)
- [ ] Data-loss-prevention tools

## Quality
- [ ] Automated tests (all tests were deleted on 2026-11-12)
- [ ] CI pipeline (removed on 2026-11-12)

## Suggested order
1. Single sign-on
2. Email and push notifications
3. Mobile apps
4. Calls
5. Workflows
