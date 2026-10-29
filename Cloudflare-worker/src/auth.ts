const PIN_ITERATIONS = 310_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded =
    normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);

  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function derivePinHash(
  pin: string,
  salt: Uint8Array,
): Promise<Uint8Array> {
  // Copy into a definite ArrayBuffer for TypeScript 5.9 compatibility.
  const pinBytes = new TextEncoder().encode(pin);
  const saltBuffer = new ArrayBuffer(salt.length);
  new Uint8Array(saltBuffer).set(salt);

  const material = await crypto.subtle.importKey(
    'raw',
    pinBytes,
    'PBKDF2',
    false,
    ['deriveBits'],
  );

  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations: PIN_ITERATIONS,
      hash: 'SHA-256',
    },
    material,
    HASH_BYTES * 8,
  );

  return new Uint8Array(derived);
}

export async function createPinVerifier(
  pin: string,
): Promise<{ pinHash: string; pinSalt: string }> {
  if (!/^\d{6,12}$/.test(pin)) {
    throw new Error('PIN must contain 6–12 digits.');
  }

  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derivePinHash(pin, salt);

  return {
    pinHash: toBase64Url(hash),
    pinSalt: toBase64Url(salt),
  };
}

export async function verifyPin(
  pin: string,
  pinHash: string,
  pinSalt: string,
): Promise<boolean> {
  if (!/^\d{6,12}$/.test(pin)) {
    return false;
  }

  try {
    const salt = fromBase64Url(pinSalt);
    const expected = fromBase64Url(pinHash);

    if (salt.length !== SALT_BYTES || expected.length !== HASH_BYTES) {
      return false;
    }

    const actual = await derivePinHash(pin, salt);

    let difference = 0;

    for (let i = 0; i < expected.length; i++) {
      difference |= expected[i] ^ actual[i];
    }

    return difference === 0;
  } catch {
    return false;
  }
                       }
