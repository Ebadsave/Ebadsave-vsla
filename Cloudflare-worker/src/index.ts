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
}
export interface Env extends AuthEnv {
  BACKUPS: R2Bucket;
  DB: D1Database;
  JWT_HS256_SECRET: string;
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
  headers.set('access-control-allow-headers', 'authorization,content-type,x-backup-id,x-backup-encrypted');
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

async function login(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request);
  if (!body || typeof body.memberNumber !== 'string' || typeof body.pin !== 'string') {
    return json({ error: 'member_number_and_pin_required' }, 400);
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

  const correct = await verifyPin(pin, user.pinHash, user.pinSalt);
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
  await audit(env, claims.sub, claims.groupId, 'passbook_sync', 'success');
  return json({ ok: true, membersSynced: synced });
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
  const verifier = await createPinVerifier(body.pin);
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
      response = json({ ok: true, service: 'ebadsave-vsla-cloudflare', stage: 'authentication-and-passbooks' });
      return cors(response, request);
    }

    if (url.pathname === '/v1/auth/login' && request.method === 'POST') {
      response = await login(request, env);
      return cors(response, request);
    }

    const claims = await verifyAccessToken(request, env) as JwtClaims | null;
    if (!claims) return cors(json({ error: 'unauthorized' }, 401), request);

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
        customMetadata: { groupId: claims.groupId, backupId, uploadedBy: claims.sub, encrypted: 'true' },
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
