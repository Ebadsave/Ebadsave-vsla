# Ebadsave VSLA Member Passbook — Development Milestone 1

## Implemented in this milestone
- Added a Member Passbook entry on the Welcome screen.
- Added member-number + four-character passcode login screen.
- Reused the existing salted passcode hash and failed-attempt lockout in the local SQLite database.
- Added a read-only passbook dashboard with personal savings, loan amount and balance, loan issue/due dates, outstanding fines, insurance contributions, and member-only transaction history.
- Added group totals for savings, the available Group Loan Fund (cash currently available to issue as new loans), and insurance fund balance.
- Transaction history is queried by both group ID and authenticated member ID; the UI does not load other members' transaction rows.

## Important limitation
This milestone is a local-device implementation foundation. It verifies credentials and reads financial records from the SQLite database on the current phone. It does **not** yet allow a member to sign in on a different phone or synchronize current records over the internet. Do not advertise it as remote access until the online authentication/API and server-side authorization rules are implemented and tested. The existing unauthenticated Firestore REST helper must not be used to expose private member records.

## Next milestone
Implement a secure server-backed member login and passbook API, then synchronize only the signed-in member's own detailed records plus approved group summary figures. Enforce member/group access controls on the server, use rate limiting and secure PIN verification, and test with two separate member accounts on different phones.
