# Ebadsave VSLA Remote Passbook — integration notes

## Included implementation

- src/services/remotePassbook.ts: Cloudflare login, secure token
  storage, remote retrieval, logout, member account creation,
  and local snapshot upload.

- src/screens/MemberPassbookLoginScreen.tsx: remote
  member-number + 6–12 digit PIN login.

- src/screens/MemberPassbookScreen.tsx: personal passbook
  and the agreed group position fields.

- src/database/database.ts: builds the group/member snapshot
  from the existing SQLite financial ledger and helper calculations.

- Cloudflare-worker/src/index.ts: login, failed-PIN lockout,
  token verification/revocation, personal passbook retrieval,
  admin-only sync and backup routes.

- Cloudflare-worker/migrations/0004_group_passbook_summary.sql:
  group aggregate summary and one-time bootstrap tracking.

## Cloudflare configuration

The existing Worker URL and D1/R2 bindings are retained in
Cloudflare-worker/wrangler.toml.

Set the two Worker secrets (never put them in the mobile app
or source control):

cd Cloudflare-worker

npx wrangler secret put JWT_HS256_SECRET

npx wrangler secret put ADMIN_BOOTSTRAP_SECRET

Both secrets must be long random values. Keep the bootstrap
secret with the trusted Ebadsave operator; it is not a member PIN.

Apply the migrations to the existing D1 database:

npx wrangler d1 migrations apply ebadsave-vsla-db --remote

Then deploy:

npm install

npm run typecheck

npx wrangler deploy

## First group administrator

The first group administrator is provisioned once per group
using POST /v1/auth/bootstrap-admin.

The request requires the x-admin-bootstrap-secret header
and JSON:

{
  "groupId": "<local SQLite group id>",
  "memberNumber": "KYA 2010001",
  "pin": "<6-12 digits>"
}

This endpoint is protected by the server-only bootstrap secret
and can only claim a group once. Never share the bootstrap
secret with members.

After the first admin signs in, that admin can create member
and executive remote credentials through POST /v1/auth/users
using each member's chosen private PIN.

Each member must have a remote auth account before the group
snapshot sync accepts their passbook record.

## Synchronisation and data semantics

The snapshot builder uses existing local SQLite calculations
for savings, loan balances, loan due dates, loan fund cash
balance, insurance and fines.

Expenditure is reported for the current calendar month and
the immediately preceding calendar month, based on
non-reversed rows in financial_transactions with
account_type = 'expenditure_fund'.

The sync endpoint is admin-only. It uploads all active-member
passbooks plus the group summary. The admin must have an
active Cloudflare passbook session.

The app service exports syncLocalGroupPassbooks(groupId)
for the authenticated admin sync action.

## Important deployment/verification boundary

This source archive does not deploy itself and cannot provision
your Cloudflare secrets or modify the live D1 database.

Before members can use remote passbooks, the migrations and
Worker must be deployed, the first group admin bootstrapped,
each member's remote account/PIN created, and the initial
admin sync completed.

Live end-to-end behavior must then be verified against the
real D1 data.

Do not describe a health response alone as proof that login,
sync, group totals, or passbook retrieval work.

Back4App configuration and code are retained unchanged.
