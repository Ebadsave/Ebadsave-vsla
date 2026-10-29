Ebadsave VSLA Cloudflare authentication and remote passbook files

Files:
- src/auth.ts: PIN hashing and JWT creation/verification.
- src/index.ts: login, admin account provisioning, passbook read/sync, existing encrypted backup endpoints.
- migrations/0003_remote_passbooks.sql: readable D1 passbook tables.

Important setup notes:
1. These files assume migrations 0001_initial.sql and 0002_authentication.sql have already been applied, creating backups, audit_events, auth_users, revoked_tokens, and auth_events.
2. Apply 0003_remote_passbooks.sql to the existing D1 database before deploying the Worker.
3. Keep JWT_HS256_SECRET as a Cloudflare Worker secret; never put it in the mobile app or GitHub source.
4. The first admin account must be provisioned through a trusted, private setup process before admin-only endpoints can be used. Do not expose a public bootstrap endpoint.
5. After an admin token exists, POST /v1/auth/users can create group users, and POST /v1/passbook/sync can upload passbook snapshots. Only admin can do these actions.
6. POST /v1/auth/login JSON: {"memberNumber":"KYA 2010001","pin":"123456"}
7. GET /v1/passbook/me requires Authorization: Bearer <accessToken>.
8. POST /v1/passbook/sync requires admin token and JSON {"members":[{"memberNumber":"KYA 2010001","memberName":"Member Name","totalSavingsUgx":100000,"loanBalanceUgx":0,"loanDueDate":null,"transactions":[{"transactionId":"tx-001","transactionType":"saving","amountUgx":10000,"description":"Weekly saving","transactionDate":"2026-10-29"}]}]}
9. POST /v1/auth/users requires admin token and JSON {"memberNumber":"KYA 2010001","pin":"123456","role":"member"}. Roles accepted: admin, executive, member. PIN must be 6–12 digits.

Security / completeness notes:
- Account lockout is enforced after 5 failed PIN attempts for 15 minutes.
- Access tokens expire after 15 minutes; this implementation does not yet provide refresh tokens or a logout endpoint. A logout/revoke endpoint should be added before production shared-phone use.
- Passbook fields are readable by the backend in D1; protect D1 access and only expose the Worker endpoints.
- The sync endpoint replaces each member's transaction list with the supplied snapshot. Send a complete, validated snapshot for each member.
- This code does not change Back4App or the mobile app. Mobile login and sync calls still need to be integrated and tested.
