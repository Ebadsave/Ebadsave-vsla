import type { R2Bucket, D1Database } from '@cloudflare/workers-types';

export interface Env {
BACKUPS: R2Bucket;
DB: D1Database;
JWT_HS256_SECRET: string;
}

type JwtClaims = {
sub: string;
groupId: string;
role: 'admin' | 'executive' | 'member' | 'support';
exp: number;
iat?: number;
};

const json = (data: unknown, status = 200) =>
new Response(JSON.stringify(data), {
status,
headers: {
'content-type': 'application/json; charset=utf-8',
'cache-control': 'no-store',
},
});

function decodeBase64Url(input: string): Uint8Array {
const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
const raw = atob(padded);
return Uint8Array.from(raw, c => c.charCodeAt(0));
}

function decodeJsonSegment<T>(segment: string): T {
return JSON.parse(
new TextDecoder().decode(decodeBase64Url(segment)),
) as T;
}

async function verifyJwt(
request: Request,
env: Env,
): Promise<JwtClaims | null> {
const auth = request.headers.get('authorization');
if (!auth?.startsWith('Bearer ')) return null;

const token = auth.slice(7).trim();
const parts = token.split('.');
if (parts.length !== 3) return null;

try {
const header = decodeJsonSegment<{ alg?: string }>(parts[0]);

if (header.alg !== 'HS256') return null;

const claims = decodeJsonSegment<JwtClaims>(parts[1]);

if (
  !claims.sub ||
  !claims.groupId ||
  !claims.role ||
  !Number.isFinite(claims.exp)
) {
  return null;
}

if (claims.exp <= Math.floor(Date.now() / 1000)) {
  return null;
}

const key = await crypto.subtle.importKey(
  'raw',
  new TextEncoder().encode(env.JWT_HS256_SECRET),
  { name: 'HMAC', hash: 'SHA-256' },
  false,
  ['verify'],
);

// Convert both byte arrays to ArrayBuffer for Web Crypto.
const signatureBytes = decodeBase64Url(parts[2]);
const signedBytes = new TextEncoder().encode(
  `${parts[0]}.${parts[1]}`,
);

const signature = Uint8Array.from(signatureBytes).buffer as ArrayBuffer;
const signed = Uint8Array.from(signedBytes).buffer as ArrayBuffer;

const valid = await crypto.subtle.verify(
  'HMAC',
  key,
  signature,
  signed,
);

if (!valid) return null;

return claims;

} catch {
return null;
}
}

function backupKey(groupId: string, backupId: string): string {
return "groups/${groupId}/backups/${backupId}.enc";
}

function validId(value: string): boolean {
return /^[A-Za-z0-9_-]{1,80}$/.test(value);
}

async function audit(
env: Env,
actorId: string,
groupId: string,
action: string,
result: string,
backupId?: string,
) {
await env.DB.prepare(
"INSERT INTO audit_events (actor_id, group_id, action, result, backup_id, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))",
)
.bind(
actorId,
groupId,
action,
result,
backupId ?? null,
)
.run();
}

export default {
async fetch(request: Request, env: Env): Promise<Response> {
const url = new URL(request.url);

if (request.method === 'OPTIONS') {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers':
        'authorization,content-type,x-backup-id,x-backup-encrypted',
      'access-control-max-age': '86400',
    },
  });
}

if (url.pathname === '/health' && request.method === 'GET') {
  return json({
    ok: true,
    service: 'ebadsave-vsla-cloudflare',
    stage: 'storage-foundation',
  });
}

// A separate authentication service must issue signed tokens.
// Never put JWT_HS256_SECRET inside the mobile app.
const claims = await verifyJwt(request, env);

if (!claims) {
  return json({ error: 'unauthorized' }, 401);
}

if (
  url.pathname === '/v1/backups' &&
  request.method === 'POST'
) {
  if (claims.role !== 'admin') {
    return json({ error: 'admin_required' }, 403);
  }

  const backupId =
    request.headers.get('x-backup-id') ?? crypto.randomUUID();

  if (!validId(backupId)) {
    return json({ error: 'invalid_backup_id' }, 400);
  }

  const contentType = request.headers.get('content-type') ?? '';

  if (!contentType.toLowerCase().includes('application/octet-stream')) {
    return json(
      { error: 'encrypted_backup_binary_required' },
      415,
    );
  }

  if (request.headers.get('x-backup-encrypted') !== 'true') {
    return json({ error: 'encrypted_backup_required' }, 400);
  }

  const body = await request.arrayBuffer();

  if (body.byteLength < 32 || body.byteLength > 100 * 1024 * 1024) {
    return json(
      {
        error: 'backup_size_out_of_range',
        minBytes: 32,
        maxBytes: 104857600,
      },
      413,
    );
  }

  const key = backupKey(claims.groupId, backupId);

  await env.BACKUPS.put(key, body, {
    httpMetadata: {
      contentType: 'application/octet-stream',
      cacheControl: 'private, no-store',
    },
    customMetadata: {
      groupId: claims.groupId,
      backupId,
      uploadedBy: claims.sub,
      encrypted: 'true',
    },
  });

  await env.DB.prepare(
    `INSERT INTO backups
      (backup_id, group_id, object_key, uploaded_by,
       byte_size, created_at, status)
     VALUES (?, ?, ?, ?, ?, datetime('now'), 'available')`,
  )
    .bind(
      backupId,
      claims.groupId,
      key,
      claims.sub,
      body.byteLength,
    )
    .run();

  await audit(
    env,
    claims.sub,
    claims.groupId,
    'backup_upload',
    'success',
    backupId,
  );

  return json(
    {
      ok: true,
      backupId,
      bytes: body.byteLength,
      encrypted: true,
    },
    201,
  );
}

if (
  url.pathname === '/v1/backups' &&
  request.method === 'GET'
) {
  if (claims.role !== 'admin') {
    return json({ error: 'admin_required' }, 403);
  }

  const result = await env.DB.prepare(
    `SELECT
       backup_id AS backupId,
       byte_size AS bytes,
       created_at AS createdAt,
       status
     FROM backups
     WHERE group_id = ? AND status = 'available'
     ORDER BY created_at DESC
     LIMIT 100`,
  )
    .bind(claims.groupId)
    .all();

  return json({ backups: result.results ?? [] });
}

const match = url.pathname.match(
  /^\/v1\/backups\/([A-Za-z0-9_-]{1,80})$/,
);

if (match && request.method === 'GET') {
  if (claims.role !== 'admin') {
    return json({ error: 'admin_required' }, 403);
  }

  const backupId = match[1];

  const record = await env.DB.prepare(
    `SELECT object_key AS objectKey
     FROM backups
     WHERE backup_id = ?
       AND group_id = ?
       AND status = 'available'
     LIMIT 1`,
  )
    .bind(backupId, claims.groupId)
    .first<{ objectKey: string }>();

  if (!record) {
    return json({ error: 'backup_not_found' }, 404);
  }

  const object = await env.BACKUPS.get(record.objectKey);

  if (!object) {
    return json({ error: 'backup_object_missing' }, 404);
  }

  await audit(
    env,
    claims.sub,
    claims.groupId,
    'backup_download',
    'success',
    backupId,
  );

  const headers = new Headers();

  object.writeHttpMetadata(headers);
  headers.set('content-type', 'application/octet-stream');
  headers.set(
    'content-disposition',
    `attachment; filename="ebadsave-${backupId}.enc"`,
  );
  headers.set('cache-control', 'private, no-store');
  headers.set('x-backup-encrypted', 'true');

  return new Response(object.body, { headers });
}

return json({ error: 'not_found' }, 404);

},
};
