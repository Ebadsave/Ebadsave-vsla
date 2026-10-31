import * as FileSystem from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import * as CryptoJS from 'crypto-js';
import * as SecureStore from 'expo-secure-store';
import {
  createGroupDatabaseBackup,
  restoreGroupDatabaseBackup,
} from '../database/database';
import {
  CLOUDFLARE_API_BASE_URL,
  CLOUDFLARE_STORAGE_KEYS,
} from '../config/cloudflare';
import {
  clearCloudflareSession,
  getCloudflareAccessToken,
  saveCloudflareSession,
} from '../services/cloudflareApi';

const REQUIRED_BACKUP_TABLES = [
  'groups', 'group_registration_attempts', 'members', 'deleted_member_numbers',
  'member_next_of_kin', 'next_of_kin_change_history', 'next_of_kin_benefits',
  'group_rules', 'vsla_setup_rules', 'group_meetings', 'member_credentials',
  'member_auth_attempts', 'member_transaction_signatures', 'app_access_sessions',
  'app_access_authorizers', 'meeting_attendance', 'meeting_closures',
  'financial_accounts', 'financial_collections', 'financial_collection_items',
  'financial_transactions', 'financial_transaction_reversals', 'receipts',
  'notification_queue', 'notification_delivery', 'meeting_audit_records',
  'sync_queue', 'member_passbook_records', 'member_statement_records',
  'loan_interest_charges',
] as const;

const CLOUD_BACKUP_VERSION = 1;
const PBKDF2_ITERATIONS = 120_000;

export interface CloudBackupFileInfo {
  objectId: string;
  name: string;
  createdAt: string;
  backupCreatedAt: string;
  fileUrl: string;
  vaultId: string;
  bytes?: number;
}

interface BackupEnvelope {
  version: 1;
  created_at: string;
  tables: Record<string, unknown[]>;
  group_number?: string | number;
}

interface EncryptedCloudEnvelope {
  format: 'EBADSAVE_ENCRYPTED_CLOUD_BACKUP';
  version: 1;
  created_at: string;
  salt: string;
  iv: string;
  ciphertext: string;
  mac: string;
}

interface JwtPayload {
  sub?: string;
  groupId?: string;
  role?: string;
  exp?: number;
}

function getDocumentsDirectory(): string {
  const directory = FileSystem.documentDirectory || FileSystem.cacheDirectory;
  if (!directory) {
    throw new Error('Device storage is unavailable. The backup was not saved.');
  }
  return directory;
}

function makeTimestamp(): string {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function parseAndValidateBackup(contents: string): BackupEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new Error('The backup is not valid JSON. No data was changed.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid backup structure. No data was changed.');
  }

  const backup = parsed as Partial<BackupEnvelope>;
  if (
    backup.version !== 1 ||
    typeof backup.created_at !== 'string' ||
    !backup.tables ||
    typeof backup.tables !== 'object' ||
    Array.isArray(backup.tables)
  ) {
    throw new Error('This is not a supported Ebadsave VSLA backup. No data was changed.');
  }

  const missing = REQUIRED_BACKUP_TABLES.filter(
    (table) => !Array.isArray(backup.tables?.[table]),
  );
  if (missing.length) {
    throw new Error(
      `The backup is incomplete. Missing or invalid tables: ${missing.join(', ')}. No data was changed.`,
    );
  }

  return backup as BackupEnvelope;
}

function requirePassphrase(passphrase: string): string {
  const normalized = passphrase.trim();
  if (normalized.length < 12) {
    throw new Error('Use a cloud backup passphrase with at least 12 characters.');
  }
  return normalized;
}

function randomBytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function deriveEncryptionKey(passphrase: string, saltHex: string): CryptoJS.lib.WordArray {
  return CryptoJS.PBKDF2(passphrase, CryptoJS.enc.Hex.parse(saltHex), {
    keySize: 256 / 32,
    iterations: PBKDF2_ITERATIONS,
    hasher: CryptoJS.algo.SHA256,
  });
}

function deriveAuthenticationKey(passphrase: string, saltHex: string): CryptoJS.lib.WordArray {
  return CryptoJS.PBKDF2(
    passphrase,
    CryptoJS.enc.Utf8.parse(`Ebadsave-HMAC:${saltHex}`),
    {
      keySize: 256 / 32,
      iterations: PBKDF2_ITERATIONS,
      hasher: CryptoJS.algo.SHA256,
    },
  );
}

function authenticatedPayload(envelope: Omit<EncryptedCloudEnvelope, 'mac'>): string {
  return [
    envelope.format,
    envelope.version,
    envelope.created_at,
    envelope.salt,
    envelope.iv,
    envelope.ciphertext,
  ].join('|');
}

function constantTimeEquals(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function encryptBackupForCloud(
  contents: string,
  passphraseInput: string,
): Promise<EncryptedCloudEnvelope> {
  const passphrase = requirePassphrase(passphraseInput);
  const salt = randomBytesToHex(await Crypto.getRandomBytesAsync(16));
  const iv = randomBytesToHex(await Crypto.getRandomBytesAsync(16));
  const key = deriveEncryptionKey(passphrase, salt);

  const encrypted = CryptoJS.AES.encrypt(contents, key, {
    iv: CryptoJS.enc.Hex.parse(iv),
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  const backup = parseAndValidateBackup(contents);
  const unsignedEnvelope: Omit<EncryptedCloudEnvelope, 'mac'> = {
    format: 'EBADSAVE_ENCRYPTED_CLOUD_BACKUP',
    version: CLOUD_BACKUP_VERSION as 1,
    created_at: backup.created_at,
    salt,
    iv,
    ciphertext: encrypted.toString(),
  };

  return {
    ...unsignedEnvelope,
    mac: CryptoJS.HmacSHA256(
      authenticatedPayload(unsignedEnvelope),
      deriveAuthenticationKey(passphrase, salt),
    ).toString(CryptoJS.enc.Hex),
  };
}

function decryptCloudBackup(encryptedContents: string, passphraseInput: string): string {
  const passphrase = requirePassphrase(passphraseInput);
  let envelope: Partial<EncryptedCloudEnvelope>;

  try {
    envelope = JSON.parse(encryptedContents) as Partial<EncryptedCloudEnvelope>;
  } catch {
    throw new Error('The internet backup file is damaged or unsupported.');
  }

  if (
    envelope.format !== 'EBADSAVE_ENCRYPTED_CLOUD_BACKUP' ||
    envelope.version !== CLOUD_BACKUP_VERSION ||
    typeof envelope.salt !== 'string' ||
    typeof envelope.iv !== 'string' ||
    typeof envelope.ciphertext !== 'string' ||
    typeof envelope.mac !== 'string'
  ) {
    throw new Error('This is not a supported encrypted Ebadsave cloud backup.');
  }

  const unsignedEnvelope: Omit<EncryptedCloudEnvelope, 'mac'> = {
    format: envelope.format,
    version: envelope.version,
    created_at: envelope.created_at || '',
    salt: envelope.salt,
    iv: envelope.iv,
    ciphertext: envelope.ciphertext,
  };

  const expectedMac = CryptoJS.HmacSHA256(
    authenticatedPayload(unsignedEnvelope),
    deriveAuthenticationKey(passphrase, envelope.salt),
  ).toString(CryptoJS.enc.Hex);

  if (!constantTimeEquals(expectedMac, envelope.mac)) {
    throw new Error('The passphrase is incorrect or the cloud backup has been altered.');
  }

  let plaintext = '';
  try {
    plaintext = CryptoJS.AES.decrypt(
      envelope.ciphertext,
      deriveEncryptionKey(passphrase, envelope.salt),
      {
        iv: CryptoJS.enc.Hex.parse(envelope.iv),
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      },
    ).toString(CryptoJS.enc.Utf8);
  } catch {
    throw new Error('The passphrase is incorrect or the cloud backup is damaged.');
  }

  if (!plaintext) {
    throw new Error('The passphrase is incorrect or the cloud backup is damaged.');
  }

  parseAndValidateBackup(plaintext);
  return plaintext;
}

function decodeJwtPayload(token: string): JwtPayload {
  try {
    const payloadPart = token.split('.')[1];
    if (!payloadPart) throw new Error('Missing token payload');
    const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const decoded = globalThis.atob(padded);
    return JSON.parse(decodeURIComponent(
      Array.from(decoded, (character) =>
        `%${character.charCodeAt(0).toString(16).padStart(2, '0')}`,
      ).join(''),
    )) as JwtPayload;
  } catch {
    throw new Error('Cloudflare returned an unreadable login token.');
  }
}

async function cloudflareBinaryRequest(
  path: string,
  method: 'GET' | 'POST',
  body?: Uint8Array,
  extraHeaders: Record<string, string> = {},
): Promise<Response> {
  const token = await getCloudflareAccessToken();
  if (!token) throw new Error('Sign in to Cloudflare before performing this operation.');

  const response = await fetch(`${CLOUDFLARE_API_BASE_URL}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...extraHeaders,
    },
    body: body ? body as unknown as BodyInit : undefined,
  });

  if (!response.ok) {
    let code = `Cloudflare request failed (${response.status}).`;
    try {
      const payload = await response.json() as { error?: string };
      if (payload.error) code = payload.error;
    } catch {
      // Keep the HTTP status message when the response is not JSON.
    }
    throw new Error(code);
  }
  return response;
}

function utf8ToBytes(value: string): Uint8Array {
  const wordArray = CryptoJS.enc.Utf8.parse(value);
  const bytes = new Uint8Array(wordArray.sigBytes);
  for (let index = 0; index < wordArray.sigBytes; index += 1) {
    bytes[index] = (wordArray.words[index >>> 2] >>> (24 - (index % 4) * 8)) & 0xff;
  }
  return bytes;
}

function bytesToUtf8(bytes: Uint8Array): string {
  const words: number[] = [];
  for (let index = 0; index < bytes.length; index += 1) {
    words[index >>> 2] = (words[index >>> 2] || 0) |
      (bytes[index] << (24 - (index % 4) * 8));
  }
  return CryptoJS.enc.Utf8.stringify(
    CryptoJS.lib.WordArray.create(words, bytes.length),
  );
}

export async function signInCloudflareBackupAdmin(
  memberNumber: string,
  pin: string,
): Promise<void> {
  const response = await fetch(`${CLOUDFLARE_API_BASE_URL}/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ memberNumber: memberNumber.trim().toUpperCase(), pin }),
  });

  const payload = await response.json() as {
    accessToken?: string;
    error?: string;
  };

  if (!response.ok || !payload.accessToken) {
    throw new Error(payload.error || `Cloudflare sign-in failed (${response.status}).`);
  }

  const claims = decodeJwtPayload(payload.accessToken);
  if (claims.role !== 'admin' || !claims.groupId) {
    throw new Error('This account is not authorized as a group administrator.');
  }

  await saveCloudflareSession(payload.accessToken, claims.groupId);
}

export async function signOutCloudflareBackupAdmin(): Promise<void> {
  const token = await getCloudflareAccessToken();
  if (token) {
    try {
      await fetch(`${CLOUDFLARE_API_BASE_URL}/v1/auth/logout`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      });
    } finally {
      await clearCloudflareSession();
    }
  } else {
    await clearCloudflareSession();
  }
}

export async function exportGroupDatabaseBackup(groupId: number): Promise<{
  success: boolean;
  message: string;
  filePath?: string;
  fileName?: string;
  groupNumber?: string;
  error?: string;
}> {
  try {
    const json = await createGroupDatabaseBackup(groupId);
    const parsed = parseAndValidateBackup(json);
    if (!parsed.group_number) throw new Error('The group backup has no KYA group identity.');

    const groupNumber = String(parsed.group_number).replace(/^KYA\s*/i, '');
    const fileName = `ebadsave_group_${groupNumber}_${makeTimestamp()}.json`;
    const filePath = `${getDocumentsDirectory()}${fileName}`;

    await FileSystem.writeAsStringAsync(filePath, json, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    const saved = await FileSystem.readAsStringAsync(filePath, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    parseAndValidateBackup(saved);

    return {
      success: true,
      message: 'Group-only backup created and verified locally.',
      filePath,
      fileName,
      groupNumber: `KYA ${groupNumber}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown group backup error.';
    return { success: false, message: 'Group backup failed.', error: message };
  }
}

export async function uploadGroupDatabaseBackupToCloud(
  groupId: number,
  passphrase: string,
): Promise<{ success: boolean; message: string; error?: string }> {
  try {
    const json = await createGroupDatabaseBackup(groupId);
    const backup = parseAndValidateBackup(json);
    if (!backup.group_number) throw new Error('The group backup has no KYA group identity.');

    const groupNumber = String(backup.group_number).replace(/^KYA\s*/i, '');
    if (!/^\d{4}$/.test(groupNumber)) throw new Error('The group number in the backup is invalid.');

    const envelope = await encryptBackupForCloud(json, passphrase);
    const bytes = utf8ToBytes(JSON.stringify(envelope));

    const response = await cloudflareBinaryRequest('/v1/backups', 'POST', bytes, {
      'content-type': 'application/octet-stream',
      'x-backup-encrypted': 'true',
      'x-backup-id': `bkp-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
      'x-group-id': await SecureStore.getItemAsync(CLOUDFLARE_STORAGE_KEYS.groupId) || '',
      'x-group-number': groupNumber,
    });

    const result = await response.json() as { backupId?: string; bytes?: number };
    if (!result.backupId) throw new Error('Cloudflare did not confirm the backup upload.');

    return {
      success: true,
      message: `Encrypted group backup uploaded and confirmed by Cloudflare (${result.bytes ?? bytes.length} bytes).`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Cloudflare backup error.';
    return { success: false, message: 'Cloud backup failed.', error: message };
  }
}

export async function listCloudGroupBackups(
  _passphrase: string,
  groupNumberInput: string,
): Promise<{
  success: boolean;
  message: string;
  backups: CloudBackupFileInfo[];
  error?: string;
}> {
  try {
    const requested = groupNumberInput.trim().toUpperCase().replace(/\s/g, '');
    if (!/^KYA\d{4}$/.test(requested)) throw new Error('Enter a valid group number, for example KYA2000.');

    const response = await cloudflareBinaryRequest('/v1/backups', 'GET');
    const payload = await response.json() as {
      backups?: Array<{ backupId: string; bytes?: number; createdAt: string }>;
    };

    const backups = (payload.backups ?? []).map((item) => ({
      objectId: item.backupId,
      name: `${requested} — encrypted cloud backup`,
      createdAt: item.createdAt,
      backupCreatedAt: item.createdAt,
      fileUrl: '',
      vaultId: '',
      bytes: item.bytes,
    }));

    return {
      success: true,
      message: backups.length ? `${backups.length} cloud backup(s) found.` : 'No cloud backups found for this authenticated group.',
      backups,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Cloudflare list error.';
    return { success: false, message: 'Could not list cloud backups.', backups: [], error: message };
  }
}

export async function restoreCloudGroupDatabaseBackup(
  backup: CloudBackupFileInfo,
  passphrase: string,
  expectedGroupNumber: string,
): Promise<{ success: boolean; message: string; error?: string }> {
  try {
    const response = await cloudflareBinaryRequest(
      `/v1/backups/${encodeURIComponent(backup.objectId)}`,
      'GET',
    );
    const encryptedBytes = new Uint8Array(await response.arrayBuffer());
    const encryptedContents = bytesToUtf8(encryptedBytes);
    const plaintext = decryptCloudBackup(encryptedContents, passphrase);
    const parsed = parseAndValidateBackup(plaintext);

    const actualGroup = String(parsed.group_number ?? '').replace(/^KYA\s*/i, '');
    const expectedGroup = expectedGroupNumber.trim().toUpperCase().replace(/^KYA\s*/i, '');
    if (!actualGroup || actualGroup !== expectedGroup) {
      throw new Error('The downloaded backup belongs to a different group. No data was changed.');
    }

    await restoreGroupDatabaseBackup(plaintext, expectedGroup);
    return {
      success: true,
      message: `Group KYA ${actualGroup} was restored and its backup integrity was verified.`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown cloud recovery error.';
    return { success: false, message: 'Group recovery failed.', error: message };
  }
}
