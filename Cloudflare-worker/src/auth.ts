const PIN_ITERATIONS = 310_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

export function normalizeMemberNumber(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, ' ');
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function derivePinHash(pin: string, salt: Uint8Array): Promise<Uint8Array> {
  const pinBytes = new TextEncoder().encode(pin);
  const pinBuffer = new ArrayBuffer(pinBytes.length);
  new Uint8Array(pinBuffer).set(pinBytes);

  const saltBuffer = new ArrayBuffer(salt.length);
  new Uint8Array(saltBuffer).set(salt);

  const material = await crypto.subtle.importKey(
    'raw', pinBuffer, 'PBKDF2', false, ['deriveBits'],
  );
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBuffer, iterations: PIN_ITERATIONS, hash: 'SHA-256' },
    material,
    HASH_BYTES * 8,
  );
  return new Uint8Array(derived);
}

export async function createPinVerifier(pin: string): Promise<{ pinHash: string; pinSalt: string }> {
  if (!/^\d{6,12}$/.test(pin)) throw new Error('PIN must contain 6–12 digits.');
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derivePinHash(pin, salt);
  return { pinHash: toBase64Url(hash), pinSalt: toBase64Url(salt) };
}

export async function verifyPin(pin: string, pinHash: string, pinSalt: string): Promise<boolean> {
  if (!/^\d{6,12}$/.test(pin)) return false;
  try {
    const salt = fromBase64Url(pinSalt);
    const expected = fromBase64Url(pinHash);
    if (salt.length !== SALT_BYTES || expected.length !== HASH_BYTES) return false;
    const actual = await derivePinHash(pin, salt);
    let difference = 0;
    for (let i = 0; i < expected.length; i++) difference |= expected[i] ^ actual[i];
    return difference === 0;
  } catch {
    return false;
  }
}

export type AuthRole = 'admin' | 'executive' | 'member' | 'support';

export type JwtClaims = {
  sub: string;
  groupId: string;
  role: AuthRole;
  exp: number;
  iat: number;
  jti: string;
};

export interface AuthD1Result<T = Record<string, unknown>> {
  results?: T[];
  success: boolean;
  meta?: Record<string, unknown>;
}

export interface AuthPreparedStatement {
  bind(...values: unknown[]): AuthPreparedStatement;
  run(): Promise<AuthD1Result>;
  all<T = Record<string, unknown>>(): Promise<AuthD1Result<T>>;
  first<T = Record<string, unknown>>(columnName?: string): Promise<T | null>;
}

export interface AuthD1Database {
  prepare(query: string): AuthPreparedStatement;
}

export interface AuthEnv {
  DB: AuthD1Database;
  JWT_HS256_SECRET: string;
}

function encodeJsonSegment(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return toBase64Url(bytes);
}

function decodeJsonSegment<T>(segment: string): T {
  const bytes = fromBase64Url(segment);
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.length);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

async function signingKey(secret: string, usages: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw', toArrayBuffer(new TextEncoder().encode(secret)),
    { name: 'HMAC', hash: 'SHA-256' }, false, usages,
  );
}

export async function issueAccessToken(
  env: AuthEnv,
  user: { userId: string; groupId: string; role: AuthRole },
): Promise<{ accessToken: string; expiresIn: number }> {
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = 15 * 60;
  const claims: JwtClaims = {
    sub: user.userId,
    groupId: user.groupId,
    role: user.role,
    iat: now,
    exp: now + expiresIn,
    jti: crypto.randomUUID(),
  };
  const header = encodeJsonSegment({ alg: 'HS256', typ: 'JWT' });
  const payload = encodeJsonSegment(claims);
  const unsigned = `${header}.${payload}`;
  const key = await signingKey(env.JWT_HS256_SECRET, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, toArrayBuffer(new TextEncoder().encode(unsigned)));
  return { accessToken: `${unsigned}.${toBase64Url(new Uint8Array(signature))}`, expiresIn };
}

export async function verifyAccessToken(request: Request, env: AuthEnv): Promise<JwtClaims | null> {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return null;
  const parts = authorization.slice(7).trim().split('.');
  if (parts.length !== 3) return null;

  try {
    const header = decodeJsonSegment<{ alg?: string; typ?: string }>(parts[0]);
    if (header.alg !== 'HS256' || header.typ !== 'JWT') return null;
    const claims = decodeJsonSegment<JwtClaims>(parts[1]);
    const now = Math.floor(Date.now() / 1000);
    if (!claims.sub || !claims.groupId || !claims.jti || !claims.iat ||
        !['admin', 'executive', 'member', 'support'].includes(claims.role) ||
        !Number.isFinite(claims.exp) || claims.exp <= now || claims.iat > now + 60) return null;

    const key = await signingKey(env.JWT_HS256_SECRET, ['verify']);
    const signature = toArrayBuffer(fromBase64Url(parts[2]));
    const signed = toArrayBuffer(new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    if (!(await crypto.subtle.verify('HMAC', key, signature, signed))) return null;

    const revoked = await env.DB.prepare(
      'SELECT token_id FROM revoked_tokens WHERE token_id = ? AND expires_at > ? LIMIT 1',
    ).bind(claims.jti, now).first<{ token_id: string }>();
    if (revoked) return null;

    const user = await env.DB.prepare(
      `SELECT user_id FROM auth_users
       WHERE user_id = ? AND group_id = ? AND status = 'active' LIMIT 1`,
    ).bind(claims.sub, claims.groupId).first<{ user_id: string }>();
    if (!user) return null;
    return claims;
  } catch {
    return null;
  }
}
