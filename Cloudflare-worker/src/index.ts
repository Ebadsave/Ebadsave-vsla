import {
  createPinVerifier,
  normalizeMemberNumber,
  verifyPin,
  issueAccessToken,
  verifyAccessToken,
  type AuthEnv,
  type AuthRole,
} from './auth';

interface R2ObjectBody {
  body: ReadableStream<Uint8Array> | null;
  writeHttpMetadata(headers: Headers): void;
}
interface R2Bucket {
  put(key: string, value: ArrayBuffer, options?: {
    httpMetadata?: { contentType?: string; cacheControl?: string };
    customMetadata?: Record<string, string>;
  }): Promise<unknown>;
  get(key: string): Promise<R2ObjectBody | null>;
}
interface D1Result<T = Record<string, unknown>> {
  results?: T[];
  success: boolean;
  meta?: Record<string, unknown>;
}
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  run(): Promise<D1Result>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  first<T = Record<string, unknown>>(columnName?: string): Promise<T | null>;
}
interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}
export interface Env extends AuthEnv {
  BACKUPS: R2Bucket;
  DB: D1Database;
  JWT_HS256_SECRET: string;
  ADMIN_BOOTSTRAP_SECRET: string;
  PIN_PEPPER: string;
}

type JwtRole = AuthRole;
type JwtClaims = {
  sub: string; groupId: string; role: JwtRole; exp: number; iat: number; jti: string;
};

const json = (data: unknown, status = 200): Response => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'vary': 'Origin',
  },
});

function cors(response: Response, request: Request): Response {
  const headers = new Headers(response.headers);
  const origin = request.headers.get('origin');
  // Configure a specific production app origin if the mobile/web client requires CORS.
  if (origin) headers.set('access-control-allow-origin', origin);
  headers.set('access-control-allow-methods', 'GET,POST,OPTIONS');
  headers.set('access-control-allow-headers', 'authorization,content-type,x-backup-id,x-backup-encrypted,x-group-id,x-group-number');
  headers.set('access-control-max-age', '86400');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function backupKey(groupId: string, backupId: string): string {
  return `groups/${groupId}/backups/${backupId}.enc`;
}
function validId(value: string): boolean { return /^[A-Za-z0-9_-]{1,80}$/.test(value); }
function validMemberNumber(value: string): boolean { return /^KYA\s?\d{7}$/.test(value); }
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('application/json')) return null;
    const body: unknown = await request.json();
    return isRecord(body) ? body : null;
  } catch { return null; }
}
async function audit(env: Env, actorId: string, groupId: string, action: string, result: string, backupId?: string) {
  await env.DB.prepare(
    `INSERT INTO audit_events (actor_id, group_id, action, result, backup_id, created_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`,
  ).bind(actorId, groupId, action, result, backupId ?? null).run();
}

/**
 * One-time, tightly scoped KYA 2000 administrator handover.
 * It requires the server-side bootstrap secret, verifies the existing member
 * identity, provisions/updates that member's authentication record, and
 * demotes the previous administrator in one D1 batch. No passbook or
 * transaction rows are modified.
 */
async function transferKya2000Admin(request: Request, env: Env): Promise<Response> {
  // One-time, group-scoped handover. The group owner has confirmed in the
  // local app that KYA2000217 is Twebaze Edwin's existing membership. D1 has
  // not yet received member/passbook sync, so this operation changes auth only.
  const suppliedSecret = request.headers.get('x-admin-bootstrap-secret') ?? '';
  const expectedSecret = env.ADMIN_BOOTSTRAP_SECRET ?? '';
  if (expectedSecret.length < 32) return json({ error: 'bootstrap_secret_missing_or_too_short' }, 500);
  if (!constantTimeSecretEqual(suppliedSecret, expectedSecret)) return json({ error: 'bootstrap_secret_mismatch' }, 401);
  if (!env.PIN_PEPPER || env.PIN_PEPPER.length < 32) return json({ error: 'server_pin_pepper_not_configured' }, 500);

  const body = await readJson(request);
  if (!body || body.groupId !== 'kya-2000' || body.groupNumber !== 'KYA 2000' ||
      body.previousAdminMemberNumber !== 'KYA2000001' ||
      body.newAdminMemberNumber !== 'KYA2000217' || body.newAdminName !== 'Twebaze Edwin' ||
      typeof body.newPin !== 'string' || !/^\d{6,12}$/.test(body.newPin)) {
    return json({ error: 'invalid_kya2000_admin_transfer_details' }, 400);
  }

  // The existing active admin record is the D1-side proof of this group.
  // Do not require D1 membership/passbook rows and do not fabricate them.
  const previousAdmin = await env.DB.prepare(
    `SELECT user_id AS userId FROM auth_users
     WHERE group_id = 'kya-2000'
       AND UPPER(REPLACE(member_number, ' ', '')) = 'KYA2000001'
       AND role = 'admin' AND status = 'active'
     LIMIT 1`,
  ).first<{ userId: string }>();
  if (!previousAdmin) return json({ error: 'previous_admin_account_not_found_or_not_active' }, 409);

  const existingTarget = await env.DB.prepare(
    `SELECT user_id AS userId FROM auth_users
     WHERE group_id = 'kya-2000'
       AND UPPER(REPLACE(member_number, ' ', '')) = 'KYA2000217'
     LIMIT 1`,
  ).first<{ userId: string }>();
  const targetUserId = existingTarget?.userId ?? crypto.randomUUID();
  const verifier = await createPinVerifier(body.newPin, env.PIN_PEPPER);

  try {
    // Atomic D1 batch. Only auth_users and auth_events are modified.
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO auth_users
         (user_id, group_id, member_number, role, pin_hash, pin_salt,
          failed_attempts, locked_until, status)
         VALUES (?, 'kya-2000', 'KYA2000217', 'admin', ?, ?, 0, NULL, 'active')
         ON CONFLICT(group_id, member_number) DO UPDATE SET
           role = 'admin', pin_hash = excluded.pin_hash,
           pin_salt = excluded.pin_salt, failed_attempts = 0,
           locked_until = NULL, status = 'active', updated_at = datetime('now')`,
      ).bind(targetUserId, verifier.pinHash, verifier.pinSalt),
      env.DB.prepare(
        `UPDATE auth_users
         SET role = 'member', failed_attempts = 0, locked_until = NULL,
             updated_at = datetime('now')
         WHERE user_id = ? AND group_id = 'kya-2000'
           AND UPPER(REPLACE(member_number, ' ', '')) = 'KYA2000001'`,
      ).bind(previousAdmin.userId),
      env.DB.prepare(
        `INSERT INTO auth_events (user_id, group_id, event_type, result, created_at)
         VALUES (?, 'kya-2000', 'admin_transfer', 'success', datetime('now'))`,
      ).bind(targetUserId),
      env.DB.prepare(
        `INSERT INTO auth_events (user_id, group_id, event_type, result, created_at)
         VALUES (?, 'kya-2000', 'admin_demoted', 'success', datetime('now'))`,
      ).bind(previousAdmin.userId),
    ]);
  } catch {
    return json({ error: 'admin_transfer_failed_no_success_confirmation' }, 500);
  }

  return json({
    ok: true,
    groupId: 'kya-2000',
    newAdmin: { name: 'Twebaze Edwin', memberNumber: 'KYA2000217', role: 'admin' },
    previousAdmin: { memberNumber: 'KYA2000001', role: 'member' },
    pinSet: true,
    membershipRecordsChanged: false,
    financialRecordsChanged: false,
  }, 200);
}

async function bootstrapAdmin(request: Request, env: Env): Promise<Response> {
  // Backend-only bootstrap: the mobile app never receives or sends this secret.
  // Each group can claim only its own first administrator; no global administrator exists.
  if (!env.ADMIN_BOOTSTRAP_SECRET || env.ADMIN_BOOTSTRAP_SECRET.length < 32) {
    return json({ error: 'server_bootstrap_secret_not_configured' }, 500);
  }
  if (!env.PIN_PEPPER || env.PIN_PEPPER.length < 32) {
    return json({ error: 'server_pin_pepper_not_configured' }, 500);
  }

  const body = await readJson(request);
  if (!body || typeof body.groupNumber !== 'string' ||
      typeof body.memberNumber !== 'string' || typeof body.memberName !== 'string' ||
      typeof body.pin !== 'string' || typeof body.confirmPin !== 'string') {
    return json({ error: 'group_admin_name_member_number_pin_and_confirmation_required' }, 400);
  }
  if (body.pin !== body.confirmPin) return json({ error: 'pin_confirmation_mismatch' }, 400);

  const groupNumber = body.groupNumber.trim().toUpperCase().replace(/^KYA\s*/, '');
  if (!/^\d{4}$/.test(groupNumber)) {
    return json({ error: 'invalid_group_number' }, 400);
  }
  const numericGroup = Number(groupNumber);
  const validGroupRange =
    (numericGroup >= 2000 && numericGroup <= 2009) ||
    (numericGroup >= 2010 && numericGroup <= 9090);
  if (!validGroupRange) return json({ error: 'group_number_out_of_range' }, 400);

  const groupId = `kya-${groupNumber}`;
  const memberNumber = body.memberNumber.trim().toUpperCase().replace(/\s+/g, '');
  if (!new RegExp(`^KYA${groupNumber}\\d{3}$`).test(memberNumber)) {
    return json({ error: 'admin_member_number_must_belong_to_group' }, 400);
  }
  if (body.memberName.trim().length < 2 || body.memberName.trim().length > 100) {
    return json({ error: 'invalid_admin_name' }, 400);
  }
  if (!/^\d{6,12}$/.test(body.pin)) {
    return json({ error: 'invalid_pin' }, 400);
  }

  // KYA 2000 remains claimed by its existing administrator. Other groups
  // can claim only their own unique group ID and group number.
  const existingGroup = await env.DB.prepare(
    `SELECT admin_user_id FROM group_admin_bootstrap_claims
     WHERE group_id = ? OR group_number = ? LIMIT 1`,
  ).bind(groupId, `KYA ${groupNumber}`).first<{ admin_user_id: string }>();
  if (existingGroup) return json({ error: 'group_already_bootstrapped' }, 409);

  const existingMember = await env.DB.prepare(
    `SELECT user_id FROM auth_users
     WHERE group_id = ? AND UPPER(REPLACE(member_number, ' ', '')) = ? LIMIT 1`,
  ).bind(groupId, memberNumber).first<{ user_id: string }>();
  if (existingMember) return json({ error: 'member_number_already_registered' }, 409);

  const verifier = await createPinVerifier(body.pin, env.PIN_PEPPER);
  const userId = crypto.randomUUID();
  try {
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS group_admin_profiles (
        user_id TEXT PRIMARY KEY,
        group_id TEXT NOT NULL,
        member_name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(group_id, user_id)
      )`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO group_admin_bootstrap_claims (group_id, group_number, admin_user_id)
       VALUES (?, ?, ?)`,
    ).bind(groupId, `KYA ${groupNumber}`, userId).run();
  } catch {
    return json({ error: 'group_already_bootstrapped' }, 409);
  }

  try {
    await env.DB.prepare(
      `INSERT INTO auth_users
       (user_id, group_id, member_number, role, pin_hash, pin_salt, status)
       VALUES (?, ?, ?, 'admin', ?, ?, 'active')`,
    ).bind(userId, groupId, memberNumber, verifier.pinHash, verifier.pinSalt).run();
  } catch {
    await env.DB.prepare(
      `DELETE FROM group_admin_bootstrap_claims WHERE group_id = ? AND admin_user_id = ?`,
    ).bind(groupId, userId).run();
    return json({ error: 'member_number_already_registered' }, 409);
  }

  await env.DB.prepare(
    `INSERT INTO group_admin_profiles (user_id, group_id, member_name)
     VALUES (?, ?, ?)`,
  ).bind(userId, groupId, body.memberName.trim()).run();

  await env.DB.prepare(
    `INSERT INTO auth_events (user_id, group_id, event_type, result, created_at)
     VALUES (?, ?, 'group_admin_setup', 'success', datetime('now'))`,
  ).bind(userId, groupId).run();

  return json({
    ok: true,
    role: 'admin',
    groupId,
    groupNumber: `KYA ${groupNumber}`,
    memberNumber,
  }, 201);
}

function constantTimeSecretEqual(candidate: string, expected: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(candidate);
  const b = encoder.encode(expected);
  // Include length difference and iterate over the longer input to avoid early exits.
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) difference |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return difference === 0;
}

async function login(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request);
  if (!body || typeof body.memberNumber !== 'string' || typeof body.pin !== 'string') {
    return json({ error: 'member_number_and_pin_required' }, 400);
  }
  if (body.memberName !== undefined && typeof body.memberName !== 'string') {
    return json({ error: 'invalid_member_name' }, 400);
  }
  const memberNumber = normalizeMemberNumber(body.memberNumber);
  const pin = body.pin;
  if (!validMemberNumber(memberNumber) || !/^\d{6,12}$/.test(pin)) {
    return json({ error: 'invalid_credentials' }, 401);
  }

  // Member numbers are expected to be globally unique. Refuse ambiguous matches.
  const lookup = await env.DB.prepare(
    `SELECT user_id AS userId, group_id AS groupId, member_number AS memberNumber,
            role, pin_hash AS pinHash, pin_salt AS pinSalt,
            failed_attempts AS failedAttempts, locked_until AS lockedUntil, status
     FROM auth_users
     WHERE UPPER(REPLACE(member_number, ' ', '')) = ?
     LIMIT 2`,
  ).bind(memberNumber.replace(/\s/g, '')).all<{
    userId: string; groupId: string; memberNumber: string; role: AuthRole;
    pinHash: string; pinSalt: string; failedAttempts: number; lockedUntil: string | null;
    status: string;
  }>();
  const rows = lookup.results ?? [];
  if (rows.length !== 1 || rows[0].status !== 'active') {
    return json({ error: 'invalid_credentials' }, 401);
  }
  const user = rows[0];
  if (!['admin', 'executive', 'member'].includes(user.role)) return json({ error: 'invalid_credentials' }, 401);
  if (user.role === 'admin') {
    if (typeof body.memberName !== 'string' || body.memberName.trim().length < 2) {
      return json({ error: 'admin_name_required' }, 401);
    }
    const adminProfile = await env.DB.prepare(
      `SELECT member_name AS memberName FROM group_admin_profiles
       WHERE user_id = ? AND group_id = ? LIMIT 1`,
    ).bind(user.userId, user.groupId).first<{ memberName: string }>();
    // Existing group administrators may predate the profile table; use their
    // already-synced passbook name as a compatibility fallback.
    const storedAdminName = adminProfile?.memberName ?? (await env.DB.prepare(
      `SELECT member_name AS memberName FROM passbook_accounts
       WHERE group_id = ? AND UPPER(REPLACE(member_number, ' ', '')) = ? LIMIT 1`,
    ).bind(user.groupId, memberNumber.replace(/\s/g, '')).first<{ memberName: string }>())?.memberName;
    if (!storedAdminName || storedAdminName.trim().toLowerCase() !== body.memberName.trim().toLowerCase()) {
      return json({ error: 'invalid_credentials' }, 401);
    }
  }

  if (user.lockedUntil) {
    const lockTime = Date.parse(`${user.lockedUntil.replace(' ', 'T')}Z`);
    if (Number.isFinite(lockTime) && lockTime > Date.now()) {
      return json({ error: 'account_locked', retryAfterSeconds: Math.ceil((lockTime - Date.now()) / 1000) }, 423);
    }
    await env.DB.prepare(
      `UPDATE auth_users SET failed_attempts = 0, locked_until = NULL, updated_at = datetime('now')
       WHERE user_id = ?`,
    ).bind(user.userId).run();
    user.failedAttempts = 0;
    user.lockedUntil = null;
  }

  const correct = await verifyPin(pin, user.pinHash, user.pinSalt, env.PIN_PEPPER);
  if (!correct) {
    const attempts = Number(user.failedAttempts || 0) + 1;
    if (attempts >= 5) {
      await env.DB.prepare(
        `UPDATE auth_users SET failed_attempts = 5,
         locked_until = datetime('now', '+15 minutes'), updated_at = datetime('now')
         WHERE user_id = ?`,
      ).bind(user.userId).run();
    } else {
      await env.DB.prepare(
        `UPDATE auth_users SET failed_attempts = ?, updated_at = datetime('now') WHERE user_id = ?`,
      ).bind(attempts, user.userId).run();
    }
    await env.DB.prepare(
      `INSERT INTO auth_events (user_id, group_id, event_type, result, created_at)
       VALUES (?, ?, 'login', 'failure', datetime('now'))`,
    ).bind(user.userId, user.groupId).run();
    return attempts >= 5
      ? json({ error: 'account_locked', retryAfterSeconds: 900 }, 423)
      : json({ error: 'invalid_credentials', attemptsRemaining: 5 - attempts }, 401);
  }

  await env.DB.prepare(
    `UPDATE auth_users SET failed_attempts = 0, locked_until = NULL, updated_at = datetime('now')
     WHERE user_id = ?`,
  ).bind(user.userId).run();
  await env.DB.prepare(
    `INSERT INTO auth_events (user_id, group_id, event_type, result, created_at)
     VALUES (?, ?, 'login', 'success', datetime('now'))`,
  ).bind(user.userId, user.groupId).run();
  const token = await issueAccessToken(env, { userId: user.userId, groupId: user.groupId, role: user.role });
  return json({ ok: true, tokenType: 'Bearer', accessToken: token.accessToken, expiresIn: token.expiresIn });
}

async function getMyPassbook(env: Env, claims: JwtClaims): Promise<Response> {
  // Resolve the member number from the authenticated identity, never from a client-supplied ID.
  const identity = await env.DB.prepare(
    `SELECT member_number AS memberNumber FROM auth_users
     WHERE user_id = ? AND group_id = ? AND status = 'active' LIMIT 1`,
  ).bind(claims.sub, claims.groupId).first<{ memberNumber: string }>();
  if (!identity) return json({ error: 'unauthorized' }, 401);

  const normalizedNumber = identity.memberNumber.replace(/\s/g, '').toUpperCase();
  const account = await env.DB.prepare(
    `SELECT member_number AS memberNumber, member_name AS memberName,
            total_savings_ugx AS totalSavingsUgx, loan_balance_ugx AS loanBalanceUgx,
            loan_due_date AS loanDueDate, updated_at AS updatedAt
     FROM passbook_accounts
     WHERE group_id = ? AND UPPER(REPLACE(member_number, ' ', '')) = ? LIMIT 1`,
  ).bind(claims.groupId, normalizedNumber).first<{
    memberNumber: string; memberName: string; totalSavingsUgx: number;
    loanBalanceUgx: number; loanDueDate: string | null; updatedAt: string;
  }>();
  if (!account) return json({ error: 'passbook_not_synced' }, 404);

  const transactions = await env.DB.prepare(
    `SELECT transaction_id AS transactionId, transaction_type AS transactionType,
            amount_ugx AS amountUgx, description, transaction_date AS transactionDate
     FROM passbook_transactions
     WHERE group_id = ? AND UPPER(REPLACE(member_number, ' ', '')) = ?
     ORDER BY transaction_date DESC LIMIT 500`,
  ).bind(claims.groupId, normalizedNumber).all();
  return json({ passbook: { ...account, transactions: transactions.results ?? [] } });
}

async function syncPassbook(request: Request, env: Env, claims: JwtClaims): Promise<Response> {
  if (claims.role !== 'admin') return json({ error: 'admin_required' }, 403);
  const body = await readJson(request);
  if (!body || !Array.isArray(body.members) || body.members.length < 1 || body.members.length > 500) {
    return json({ error: 'members_array_required_max_500' }, 400);
  }
  const db = env.DB;

  // Preflight every member before writing anything. This prevents a missing
  // authentication account from causing a partial group synchronisation.
  const missingMemberNumbers: string[] = [];
  for (const item of body.members) {
    if (!isRecord(item) || typeof item.memberNumber !== 'string') {
      return json({ error: 'invalid_member_record' }, 400);
    }
    const normalized = normalizeMemberNumber(item.memberNumber);
    const identity = await db.prepare(
      `SELECT user_id FROM auth_users WHERE group_id = ? AND UPPER(REPLACE(member_number, ' ', '')) = ? AND status = 'active' LIMIT 1`,
    ).bind(claims.groupId, normalized.replace(/\s/g, '')).first<{ user_id: string }>();
    if (!identity) missingMemberNumbers.push(normalized);
  }
  if (missingMemberNumbers.length) {
    return json({ error: 'member_auth_account_missing', missingMemberNumbers }, 409);
  }

  let synced = 0;
  for (const item of body.members) {
    if (!isRecord(item) || typeof item.memberNumber !== 'string' || typeof item.memberName !== 'string' ||
        !Number.isSafeInteger(item.totalSavingsUgx) || !Number.isSafeInteger(item.loanBalanceUgx) ||
        (item.loanDueDate !== null && item.loanDueDate !== undefined && typeof item.loanDueDate !== 'string') ||
        !Array.isArray(item.transactions) || item.transactions.length > 2000) {
      return json({ error: 'invalid_member_record' }, 400);
    }
    const memberNumber = normalizeMemberNumber(item.memberNumber);
    if (!validMemberNumber(memberNumber) || item.memberName.length < 1 || item.memberName.length > 160 ||
        (item.totalSavingsUgx as number) < 0 || (item.loanBalanceUgx as number) < 0) {
      return json({ error: 'invalid_member_record' }, 400);
    }
    const identity = await db.prepare(
      `SELECT user_id FROM auth_users WHERE group_id = ? AND UPPER(REPLACE(member_number, ' ', '')) = ? AND status = 'active' LIMIT 1`,
    ).bind(claims.groupId, memberNumber.replace(/\s/g, '')).first<{ user_id: string }>();
    if (!identity) return json({ error: 'member_auth_account_missing', memberNumber }, 409);

    await db.prepare(
      `INSERT INTO passbook_accounts
       (group_id, member_number, member_name, total_savings_ugx, loan_balance_ugx, loan_due_date, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(group_id, member_number) DO UPDATE SET
       member_name = excluded.member_name, total_savings_ugx = excluded.total_savings_ugx,
       loan_balance_ugx = excluded.loan_balance_ugx, loan_due_date = excluded.loan_due_date,
       updated_at = datetime('now')`,
    ).bind(claims.groupId, memberNumber, item.memberName.trim(), item.totalSavingsUgx,
      item.loanBalanceUgx, item.loanDueDate ?? null).run();

    // Each sync is a complete transaction snapshot for that member: replace the old list atomically per member.
    await db.prepare(
      'DELETE FROM passbook_transactions WHERE group_id = ? AND UPPER(REPLACE(member_number, \' \', \'\')) = ?',
    ).bind(claims.groupId, memberNumber.replace(/\s/g, '')).run();
    for (const tx of item.transactions) {
      if (!isRecord(tx) || typeof tx.transactionId !== 'string' || !validId(tx.transactionId) ||
          typeof tx.transactionType !== 'string' || tx.transactionType.length < 1 || tx.transactionType.length > 60 ||
          !Number.isSafeInteger(tx.amountUgx) || (tx.amountUgx as number) < 0 ||
          typeof tx.transactionDate !== 'string' || tx.transactionDate.length > 40 ||
          (tx.description !== undefined && typeof tx.description !== 'string')) {
        return json({ error: 'invalid_transaction_record', memberNumber }, 400);
      }
      await db.prepare(
        `INSERT INTO passbook_transactions
         (transaction_id, group_id, member_number, transaction_type, amount_ugx, description, transaction_date)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(tx.transactionId, claims.groupId, memberNumber, tx.transactionType,
        tx.amountUgx, (tx.description as string | undefined ?? '').slice(0, 240), tx.transactionDate).run();
    }
    synced++;
  }

  // Store the group-level figures alongside the individual passbooks.
  if (isRecord(body.groupSummary)) {
    const summary = body.groupSummary;
    const numericFields = [
      'totalSavingsUgx', 'availableLoanFundUgx', 'outstandingLoansUgx',
      'insuranceFundUgx', 'finesFundUgx', 'registeredMembers', 'activeMembers',
      'totalExpenditureUgx', 'previousPeriodExpenditureUgx',
    ];
    for (const field of numericFields) {
      if (!Number.isSafeInteger(summary[field]) || (summary[field] as number) < 0) {
        return json({ error: 'invalid_group_summary', field }, 400);
      }
    }
    if (typeof summary.groupNumber !== 'string' || typeof summary.groupName !== 'string' ||
        typeof summary.currency !== 'string' || typeof summary.reportingPeriod !== 'string' ||
        typeof summary.previousReportingPeriod !== 'string') {
      return json({ error: 'invalid_group_summary' }, 400);
    }
    await db.prepare(
      `INSERT INTO passbook_group_summaries
       (group_id, group_number, group_name, currency, total_savings_ugx,
        available_loan_fund_ugx, outstanding_loans_ugx, insurance_fund_ugx,
        fines_fund_ugx, registered_members, active_members, total_expenditure_ugx,
        previous_period_expenditure_ugx, reporting_period, previous_reporting_period, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(group_id) DO UPDATE SET
        group_number = excluded.group_number, group_name = excluded.group_name,
        currency = excluded.currency, total_savings_ugx = excluded.total_savings_ugx,
        available_loan_fund_ugx = excluded.available_loan_fund_ugx,
        outstanding_loans_ugx = excluded.outstanding_loans_ugx,
        insurance_fund_ugx = excluded.insurance_fund_ugx, fines_fund_ugx = excluded.fines_fund_ugx,
        registered_members = excluded.registered_members, active_members = excluded.active_members,
        total_expenditure_ugx = excluded.total_expenditure_ugx,
        previous_period_expenditure_ugx = excluded.previous_period_expenditure_ugx,
        reporting_period = excluded.reporting_period,
        previous_reporting_period = excluded.previous_reporting_period, updated_at = datetime('now')`,
    ).bind(
      claims.groupId, summary.groupNumber, summary.groupName, summary.currency,
      summary.totalSavingsUgx, summary.availableLoanFundUgx, summary.outstandingLoansUgx,
      summary.insuranceFundUgx, summary.finesFundUgx, summary.registeredMembers,
      summary.activeMembers, summary.totalExpenditureUgx, summary.previousPeriodExpenditureUgx,
      summary.reportingPeriod, summary.previousReportingPeriod,
    ).run();
  }

  await audit(env, claims.sub, claims.groupId, 'passbook_sync', 'success');
  return json({ ok: true, membersSynced: synced, groupSummarySynced: isRecord(body.groupSummary) });
}

function cleanRegistrationText(
  value: unknown,
  maxLength: number,
): string | null {
  if (typeof value !== 'string') return null;

  const cleaned = value.trim();

  return cleaned.length > 0 && cleaned.length <= maxLength
    ? cleaned
    : null;
}

async function createMemberRegistration(
  request: Request,
  env: Env,
): Promise<Response> {
  const body = await readJson(request);

  if (
    !body ||
    typeof body.groupNumber !== 'string' ||
    typeof body.pin !== 'string' ||
    typeof body.age !== 'number' ||
    !Number.isInteger(body.age) ||
    body.age < 18 ||
    body.age > 120
  ) {
    return json({ error: 'invalid_registration_details' }, 400);
  }

  const groupDigits = body.groupNumber
    .replace(/^KYA\s*/i, '')
    .trim();

  if (
    !/^\d{4}$/.test(groupDigits) ||
    !/^\d{6,12}$/.test(body.pin)
  ) {
    return json({ error: 'invalid_group_number_or_pin' }, 400);
  }

  const fullName = cleanRegistrationText(body.fullName, 160);
  const gender = cleanRegistrationText(body.gender, 30);
  const cell = cleanRegistrationText(body.cell, 100);
  const district = cleanRegistrationText(body.district, 100);

  const phone =
    body.phone === undefined || body.phone === ''
      ? null
      : cleanRegistrationText(body.phone, 40);

  const nextOfKin =
    body.nextOfKin === undefined || body.nextOfKin === ''
      ? null
      : cleanRegistrationText(body.nextOfKin, 160);

  if (
    !fullName ||
    !gender ||
    !cell ||
    !district ||
    (body.phone !== undefined && body.phone !== '' && !phone) ||
    (body.nextOfKin !== undefined &&
      body.nextOfKin !== '' &&
      !nextOfKin)
  ) {
    return json({
      error: 'required_registration_fields_missing_or_invalid',
    }, 400);
  }

  if (!env.PIN_PEPPER || env.PIN_PEPPER.length < 32) {
    return json({
      error: 'server_pin_pepper_not_configured',
    }, 500);
  }

  // Resolve the group using trusted server-side records.
  const groups = await env.DB.prepare(
    `SELECT group_id AS groupId, group_number AS groupNumber
     FROM group_admin_bootstrap_claims
     WHERE REPLACE(REPLACE(UPPER(group_number), 'KYA', ''), ' ', '') = ?

     UNION

     SELECT group_id AS groupId, group_number AS groupNumber
     FROM passbook_group_summaries
     WHERE REPLACE(REPLACE(UPPER(group_number), 'KYA', ''), ' ', '') = ?

     LIMIT 2`,
  )
    .bind(groupDigits, groupDigits)
    .all<{ groupId: string; groupNumber: string }>();

  const matches = groups.results ?? [];

  if (matches.length !== 1) {
    return json({
      error: matches.length
        ? 'group_identity_ambiguous'
        : 'group_not_found',
    }, 404);
  }

  const group = matches[0];

  const duplicate = await env.DB.prepare(
    `SELECT application_id
     FROM member_registration_applications
     WHERE group_id = ?
       AND status = 'pending'
       AND LOWER(full_name) = LOWER(?)
       AND COALESCE(phone, '') = COALESCE(?, '')
     LIMIT 1`,
  )
    .bind(group.groupId, fullName, phone)
    .first<{ application_id: string }>();

  if (duplicate) {
    return json({
      error: 'registration_already_pending',
    }, 409);
  }

  // Hash the PIN on the server. Never store the plaintext PIN.
  const verifier = await createPinVerifier(
    body.pin,
    env.PIN_PEPPER,
  );

  const applicationId = crypto.randomUUID();

  await env.DB.prepare(
    `INSERT INTO member_registration_applications
     (
       application_id,
       group_id,
       group_number,
       full_name,
       gender,
       age,
       phone,
       next_of_kin,
       cell,
       district,
       pin_hash,
       pin_salt,
       status
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
  )
    .bind(
      applicationId,
      group.groupId,
      `KYA ${groupDigits}`,
      fullName,
      gender,
      body.age,
      phone,
      nextOfKin,
      cell,
      district,
      verifier.pinHash,
      verifier.pinSalt,
    )
    .run();

  await env.DB.prepare(
    `INSERT INTO auth_events
     (user_id, group_id, event_type, result, created_at)
     VALUES (?, ?, 'member_self_registration', 'pending', datetime('now'))`,
  )
    .bind(applicationId, group.groupId)
    .run();

  return json({
    ok: true,
    applicationId,
    status: 'pending',
    message: 'Your application is waiting for administrator approval.',
  }, 201);
}

async function listPendingRegistrations(
  env: Env,
  claims: JwtClaims,
): Promise<Response> {
  if (claims.role !== 'admin') {
    return json({ error: 'admin_required' }, 403);
  }

  const rows = await env.DB.prepare(
    `SELECT
       application_id AS applicationId,
       group_number AS groupNumber,
       full_name AS fullName,
       gender,
       age,
       phone,
       next_of_kin AS nextOfKin,
       cell,
       district,
       created_at AS createdAt
     FROM member_registration_applications
     WHERE group_id = ?
       AND status = 'pending'
     ORDER BY created_at ASC
     LIMIT 200`,
  )
    .bind(claims.groupId)
    .all();

  return json({
    applications: rows.results ?? [],
  });
}

function generateMemberSuffix(): string {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);

  return String((value[0] % 999) + 1).padStart(3, '0');
}

async function reviewMemberRegistration(
  request: Request,
  env: Env,
  claims: JwtClaims,
  applicationId: string,
  decision: 'approve' | 'reject',
): Promise<Response> {
  if (claims.role !== 'admin') {
    return json({ error: 'admin_required' }, 403);
  }

  const application = await env.DB.prepare(
    `SELECT
       application_id AS applicationId,
       group_id AS groupId,
       group_number AS groupNumber,
       full_name AS fullName,
       pin_hash AS pinHash,
       pin_salt AS pinSalt,
       status
     FROM member_registration_applications
     WHERE application_id = ?
       AND group_id = ?
     LIMIT 1`,
  )
    .bind(applicationId, claims.groupId)
    .first<{
      applicationId: string;
      groupId: string;
      groupNumber: string;
      fullName: string;
      pinHash: string | null;
      pinSalt: string | null;
      status: string;
    }>();

  if (!application) {
    return json({ error: 'registration_not_found' }, 404);
  }

  if (application.status !== 'pending') {
    return json({ error: 'registration_already_reviewed' }, 409);
  }

  if (decision === 'reject') {
    const body = await readJson(request);
    const reason = body
      ? cleanRegistrationText(body.reason, 300)
      : null;

    if (!reason) {
      return json({ error: 'rejection_reason_required' }, 400);
    }

    const updated = await env.DB.prepare(
      `UPDATE member_registration_applications
       SET status = 'rejected',
           rejection_reason = ?,
           pin_hash = NULL,
           pin_salt = NULL,
           reviewed_by = ?,
           reviewed_at = datetime('now'),
           updated_at = datetime('now')
       WHERE application_id = ?
         AND group_id = ?
         AND status = 'pending'`,
    )
      .bind(reason, claims.sub, applicationId, claims.groupId)
      .run();

    if (Number(updated.meta?.changes ?? 0) !== 1) {
      return json({ error: 'registration_already_reviewed' }, 409);
    }

    await env.DB.prepare(
      `INSERT INTO auth_events
       (user_id, group_id, event_type, result, created_at)
       VALUES (?, ?, 'member_registration_review', 'rejected', datetime('now'))`,
    )
      .bind(applicationId, claims.groupId)
      .run();

    return json({
      ok: true,
      status: 'rejected',
    });
  }

  if (!application.pinHash || !application.pinSalt) {
    return json({
      error: 'pending_pin_verifier_missing',
    }, 409);
  }

  const groupDigits = application.groupNumber.replace(/^KYA\s*/i, '');

  let memberNumber = '';

  for (let attempt = 0; attempt < 40; attempt++) {
    const candidate =
      `KYA${groupDigits}${generateMemberSuffix()}`;

    const existing = await env.DB.prepare(
      `SELECT user_id
       FROM auth_users
       WHERE UPPER(REPLACE(member_number, ' ', '')) = ?
       LIMIT 1`,
    )
      .bind(candidate)
      .first<{ user_id: string }>();

    if (!existing) {
      memberNumber = candidate;
      break;
    }
  }

  if (!memberNumber) {
    return json({
      error: 'member_number_allocation_failed',
    }, 503);
  }

  const marked = await env.DB.prepare(
    `UPDATE member_registration_applications
     SET status = 'approved',
         member_number = ?,
         pin_hash = NULL,
         pin_salt = NULL,
         reviewed_by = ?,
         reviewed_at = datetime('now'),
         updated_at = datetime('now')
     WHERE application_id = ?
       AND group_id = ?
       AND status = 'pending'`,
  )
    .bind(memberNumber, claims.sub, applicationId, claims.groupId)
    .run();

  if (Number(marked.meta?.changes ?? 0) !== 1) {
    return json({
      error: 'registration_already_reviewed',
    }, 409);
  }

  try {
    await env.DB.prepare(
      `INSERT INTO auth_users
       (user_id, group_id, member_number, role, pin_hash, pin_salt, status)
       VALUES (?, ?, ?, 'member', ?, ?, 'active')`,
    )
      .bind(
        crypto.randomUUID(),
        claims.groupId,
        memberNumber,
        application.pinHash,
        application.pinSalt,
      )
      .run();
  } catch {
    // Restore pending state if account creation fails.
    await env.DB.prepare(
      `UPDATE member_registration_applications
       SET status = 'pending',
           member_number = NULL,
           pin_hash = ?,
           pin_salt = ?,
           reviewed_by = NULL,
           reviewed_at = NULL,
           updated_at = datetime('now')
       WHERE application_id = ?
         AND group_id = ?
         AND status = 'approved'`,
    )
      .bind(
        application.pinHash,
        application.pinSalt,
        applicationId,
        claims.groupId,
      )
      .run();

    return json({
      error: 'member_account_creation_failed',
    }, 409);
  }

  await env.DB.prepare(
    `INSERT INTO auth_events
     (user_id, group_id, event_type, result, created_at)
     VALUES (?, ?, 'member_registration_review', 'approved', datetime('now'))`,
  )
    .bind(applicationId, claims.groupId)
    .run();

  return json({
    ok: true,
    status: 'approved',
    memberNumber,
  });
    }

async function createAuthUser(request: Request, env: Env, claims: JwtClaims): Promise<Response> {
  if (claims.role !== 'admin') return json({ error: 'admin_required' }, 403);
  const body = await readJson(request);
  if (!body || typeof body.memberNumber !== 'string' || typeof body.pin !== 'string' ||
      typeof body.role !== 'string' || !['admin', 'executive', 'member'].includes(body.role)) {
    return json({ error: 'member_number_pin_and_valid_role_required' }, 400);
  }
  const memberNumber = normalizeMemberNumber(body.memberNumber);
  if (!validMemberNumber(memberNumber) || !/^\d{6,12}$/.test(body.pin)) {
    return json({ error: 'invalid_member_number_or_pin' }, 400);
  }
  const existing = await env.DB.prepare(
    `SELECT user_id FROM auth_users WHERE UPPER(REPLACE(member_number, ' ', '')) = ? LIMIT 1`,
  ).bind(memberNumber.replace(/\s/g, '')).first<{ user_id: string }>();
  if (existing) return json({ error: 'member_number_already_registered' }, 409);
  const verifier = await createPinVerifier(body.pin, env.PIN_PEPPER);
  const userId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO auth_users (user_id, group_id, member_number, role, pin_hash, pin_salt, status)
     VALUES (?, ?, ?, ?, ?, ?, 'active')`,
  ).bind(userId, claims.groupId, memberNumber, body.role, verifier.pinHash, verifier.pinSalt).run();
  await env.DB.prepare(
    `INSERT INTO auth_events (user_id, group_id, event_type, result, created_at)
     VALUES (?, ?, 'user_created', 'success', datetime('now'))`,
  ).bind(userId, claims.groupId).run();
  return json({ ok: true, userId, memberNumber, role: body.role }, 201);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }), request);

    let response: Response;
    if (url.pathname === '/health' && request.method === 'GET') {
      response = json({
  ok: true,
  service: 'ebadsave-vsla-cloudflare',
  stage: 'authentication-and-passbooks',
  bootstrapSecretConfigured: Boolean(
    env.ADMIN_BOOTSTRAP_SECRET &&
    env.ADMIN_BOOTSTRAP_SECRET.length >= 32
  ),
  pinPepperConfigured: Boolean(
    env.PIN_PEPPER &&
    env.PIN_PEPPER.length >= 32
  ),
});
      return cors(response, request);
    }

    if (
  url.pathname === '/v1/registrations' &&
  request.method === 'POST'
) {
  response = await createMemberRegistration(request, env);
  return cors(response, request);
    }
    
    if (url.pathname === '/v1/auth/admin/setup' && request.method === 'POST') {
      response = await bootstrapAdmin(request, env);
      return cors(response, request);
    }

    if (url.pathname === '/v1/auth/login' && request.method === 'POST') {
      response = await login(request, env);
      return cors(response, request);
    }

    const claims = await verifyAccessToken(request, env) as JwtClaims | null;
    if (!claims) return cors(json({ error: 'unauthorized' }, 401), request);
    const currentIdentity = await env.DB.prepare(
      `SELECT role, status FROM auth_users WHERE user_id = ? AND group_id = ? LIMIT 1`,
    ).bind(claims.sub, claims.groupId).first<{ role: JwtRole; status: string }>();
    if (!currentIdentity || currentIdentity.status !== 'active') return cors(json({ error: 'unauthorized' }, 401), request);
    // Never trust a stale role embedded in a still-valid JWT after a role change.
    claims.role = currentIdentity.role;

    if (url.pathname === '/v1/auth/logout' && request.method === 'POST') {
      await env.DB.prepare(
        `INSERT OR IGNORE INTO revoked_tokens (token_id, user_id, expires_at, revoked_at)
         VALUES (?, ?, ?, datetime('now'))`,
      ).bind(claims.jti, claims.sub, claims.exp).run();
      return cors(json({ ok: true, loggedOut: true }), request);
    }

    if (
      url.pathname === '/v1/registrations/pending' &&
      request.method === 'GET'
    ) {
      response = await listPendingRegistrations(env, claims);
      return cors(response, request);
    }

    const registrationReview = url.pathname.match(
      /^\/v1\/registrations\/([A-Za-z0-9-]{36})\/(approve|reject)$/,
    );

    if (registrationReview && request.method === 'POST') {
      response = await reviewMemberRegistration(
        request,
        env,
        claims,
        registrationReview[1],
        registrationReview[2] as 'approve' | 'reject',
      );
      return cors(response, request);
    }

    if (url.pathname === '/v1/auth/users' && request.method === 'POST') {
      response = await createAuthUser(request, env, claims);
      return cors(response, request);
    }
    if (url.pathname === '/v1/passbook/me' && request.method === 'GET') {
      response = await getMyPassbook(env, claims);
      return cors(response, request);
    }
    if (url.pathname === '/v1/passbook/sync' && request.method === 'POST') {
      response = await syncPassbook(request, env, claims);
      return cors(response, request);
    }

    // Upload encrypted backup.
    if (url.pathname === '/v1/backups' && request.method === 'POST') {
      if (claims.role !== 'admin') return cors(json({ error: 'admin_required' }, 403), request);
      const backupId = request.headers.get('x-backup-id') ?? crypto.randomUUID();
      const requestedGroupId = request.headers.get('x-group-id');
      const requestedGroupNumber = request.headers.get('x-group-number') ?? '';
      if (requestedGroupId !== claims.groupId) return cors(json({ error: 'group_scope_mismatch' }, 403), request);
      if (!/^\d{4}$/.test(requestedGroupNumber) || !(Number(requestedGroupNumber) >= 2000 && Number(requestedGroupNumber) <= 2009 || Number(requestedGroupNumber) >= 2010 && Number(requestedGroupNumber) <= 9090)) {
        return cors(json({ error: 'invalid_group_number' }, 400), request);
      }
      if (!validId(backupId)) return cors(json({ error: 'invalid_backup_id' }, 400), request);
      const contentType = request.headers.get('content-type') ?? '';
      if (!contentType.toLowerCase().includes('application/octet-stream')) {
        return cors(json({ error: 'encrypted_backup_binary_required' }, 415), request);
      }
      if (request.headers.get('x-backup-encrypted') !== 'true') {
        return cors(json({ error: 'encrypted_backup_required' }, 400), request);
      }
      const body = await request.arrayBuffer();
      if (body.byteLength < 32 || body.byteLength > 100 * 1024 * 1024) {
        return cors(json({ error: 'backup_size_out_of_range', minBytes: 32, maxBytes: 104857600 }, 413), request);
      }
      const key = backupKey(claims.groupId, backupId);
      await env.BACKUPS.put(key, body, {
        httpMetadata: { contentType: 'application/octet-stream', cacheControl: 'private, no-store' },
        customMetadata: { groupId: claims.groupId, groupNumber: requestedGroupNumber, backupId, uploadedBy: claims.sub, encrypted: 'true' },
      });
      await env.DB.prepare(
        `INSERT INTO backups (backup_id, group_id, object_key, uploaded_by, byte_size, created_at, status)
         VALUES (?, ?, ?, ?, ?, datetime('now'), 'available')`,
      ).bind(backupId, claims.groupId, key, claims.sub, body.byteLength).run();
      await audit(env, claims.sub, claims.groupId, 'backup_upload', 'success', backupId);
      response = json({ ok: true, backupId, bytes: body.byteLength, encrypted: true }, 201);
      return cors(response, request);
    }

    if (url.pathname === '/v1/backups' && request.method === 'GET') {
      if (claims.role !== 'admin') return cors(json({ error: 'admin_required' }, 403), request);
      const result = await env.DB.prepare(
        `SELECT backup_id AS backupId, byte_size AS bytes, created_at AS createdAt, status
         FROM backups WHERE group_id = ? AND status = 'available' ORDER BY created_at DESC LIMIT 100`,
      ).bind(claims.groupId).all();
      response = json({ backups: result.results ?? [] });
      return cors(response, request);
    }

    const match = url.pathname.match(/^\/v1\/backups\/([A-Za-z0-9_-]{1,80})$/);
    if (match && request.method === 'GET') {
      if (claims.role !== 'admin') return cors(json({ error: 'admin_required' }, 403), request);
      const backupId = match[1];
      const record = await env.DB.prepare(
        `SELECT object_key AS objectKey FROM backups
         WHERE backup_id = ? AND group_id = ? AND status = 'available' LIMIT 1`,
      ).bind(backupId, claims.groupId).first<{ objectKey: string }>();
      if (!record) return cors(json({ error: 'backup_not_found' }, 404), request);
      const object = await env.BACKUPS.get(record.objectKey);
      if (!object) return cors(json({ error: 'backup_object_missing' }, 404), request);
      await audit(env, claims.sub, claims.groupId, 'backup_download', 'success', backupId);
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set('content-type', 'application/octet-stream');
      headers.set('content-disposition', `attachment; filename="ebadsave-${backupId}.enc"`);
      headers.set('cache-control', 'private, no-store');
      headers.set('x-backup-encrypted', 'true');
      response = new Response(object.body, { headers });
      return cors(response, request);
    }

    return cors(json({ error: 'not_found' }, 404), request);
  },
};
