import * as FileSystem from 'expo-file-system';
import * as MailComposer from 'expo-mail-composer';
import * as Crypto from 'expo-crypto';
import * as CryptoJS from 'crypto-js';
import * as SecureStore from 'expo-secure-store';
import * as Network from 'expo-network';
import {
  createDatabaseBackup,
  createGroupDatabaseBackup,
  restoreGroupDatabaseBackup,
  restoreDatabaseBackup as restoreDatabaseBackupJson,
} from '../database/database';

/**
 * Keep this list aligned with the tables included by createDatabaseBackup()
 * in database.ts. A restore is rejected unless every required table is present.
 */
const REQUIRED_BACKUP_TABLES = [
  'groups',
  'group_registration_attempts',
  'members',
  'deleted_member_numbers',
  'member_next_of_kin',
  'next_of_kin_change_history',
  'next_of_kin_benefits',
  'group_rules',
  'vsla_setup_rules',
  'group_meetings',
  'member_credentials',
  'member_auth_attempts',
  'member_transaction_signatures',
  'app_access_sessions',
  'app_access_authorizers',
  'meeting_attendance',
  'meeting_closures',
  'financial_accounts',
  'financial_collections',
  'financial_collection_items',
  'financial_transactions',
  'financial_transaction_reversals',
  'receipts',
  'notification_queue',
  'notification_delivery',
  'meeting_audit_records',
  'sync_queue',
  'member_passbook_records',
  'member_statement_records',
  'loan_interest_charges',
] as const;

const CLOUD_BACKUP_VERSION = 1;
const PBKDF2_ITERATIONS = 120_000;

export interface BackupFileInfo {
  name: string;
  path: string;
  size: number;
  timestamp: string;
}

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
    throw new Error('The selected backup is not valid JSON. No data was changed.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid backup structure. No data was changed.');
  }
  const backup = parsed as Partial<BackupEnvelope>;
  if (
    backup.version !== 1 ||
    typeof backup.created_at !== 'string' ||
    !backup.tables ||
    typeof backup.tables !== 'object'
  ) {
    throw new Error('This is not a supported Ebadsave VSLA backup. No data was changed.');
  }

  const missing = REQUIRED_BACKUP_TABLES.filter((table) => !Array.isArray(backup.tables?.[table]));
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
  // A separate salt/domain keeps the AES key and the HMAC key independent.
  return CryptoJS.PBKDF2(passphrase, CryptoJS.enc.Utf8.parse(`Ebadsave-HMAC:${saltHex}`), {
    keySize: 256 / 32,
    iterations: PBKDF2_ITERATIONS,
    hasher: CryptoJS.algo.SHA256,
  });
}

function authenticatedPayload(envelope: Omit<EncryptedCloudEnvelope, 'mac'>): string {
  return [envelope.format, envelope.version, envelope.created_at, envelope.salt, envelope.iv, envelope.ciphertext].join('|');
}

function constantTimeEquals(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function encryptBackupForCloud(contents: string, passphraseInput: string): Promise<EncryptedCloudEnvelope> {
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
  const unsignedEnvelope = {
    format: 'EBADSAVE_ENCRYPTED_CLOUD_BACKUP' as const,
    version: CLOUD_BACKUP_VERSION as 1,
    created_at: backup.created_at,
    salt,
    iv,
    ciphertext: encrypted.toString(),
  };
  const authenticationKey = deriveAuthenticationKey(passphrase, salt);

  return {
    ...unsignedEnvelope,
    mac: CryptoJS.HmacSHA256(authenticatedPayload(unsignedEnvelope), authenticationKey).toString(CryptoJS.enc.Hex),
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
    const key = deriveEncryptionKey(passphrase, envelope.salt);
    plaintext = CryptoJS.AES.decrypt(envelope.ciphertext, key, {
      iv: CryptoJS.enc.Hex.parse(envelope.iv),
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    }).toString(CryptoJS.enc.Utf8);
  } catch {
    throw new Error('The passphrase is incorrect or the cloud backup is damaged.');
  }

  if (!plaintext) {
    throw new Error('The passphrase is incorrect or the cloud backup is damaged.');
  }

  // Authenticated structure validation catches an incorrect passphrase or corrupt data before restore.
  try {
    parseAndValidateBackup(plaintext);
  } catch {
    throw new Error('Could not decrypt a valid backup. Check the passphrase and try again.');
  }
  return plaintext;
}

/** Keep only the two newest Ebadsave JSON backup files on this device. */
async function pruneLocalBackupFiles(keep = MAX_LOCAL_BACKUP_FILES): Promise<void> {
  const directory = getDocumentsDirectory();
  const names = await FileSystem.readDirectoryAsync(directory);
  const candidates = names.filter(
    (name) => name.startsWith('ebadsave_backup_') && name.endsWith('.json'),
  );
  const details = await Promise.all(candidates.map(async (name) => {
    const path = `${directory}${name}`;
    let createdAt = 0;
    try {
      const contents = await FileSystem.readAsStringAsync(path, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      const parsed = JSON.parse(contents) as { created_at?: string };
      createdAt = parsed.created_at ? new Date(parsed.created_at).getTime() : 0;
    } catch {
      // Invalid/legacy files are sorted behind valid backups and pruned if over the limit.
    }
    if (!Number.isFinite(createdAt)) createdAt = 0;
    return { name, path, createdAt };
  }));
  details.sort((a, b) => b.createdAt - a.createdAt || b.name.localeCompare(a.name));
  for (const oldBackup of details.slice(Math.max(0, keep))) {
    await FileSystem.deleteAsync(oldBackup.path, { idempotent: true });
  }
}

/** Create and verify a group-only local backup. */
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
    const parsed = JSON.parse(json) as BackupEnvelope & { group_number?: string | number };
    parseAndValidateBackup(json);
    if (!parsed.group_number) throw new Error('The group backup has no KYA group identity.');

    const fileName = `ebadsave_group_${String(parsed.group_number).replace(/^KYA\s*/i, '')}_${makeTimestamp()}.json`;
    const filePath = `${getDocumentsDirectory()}${fileName}`;
    await FileSystem.writeAsStringAsync(filePath, json, { encoding: FileSystem.EncodingType.UTF8 });
    const saved = await FileSystem.readAsStringAsync(filePath, { encoding: FileSystem.EncodingType.UTF8 });
    const verified = JSON.parse(saved) as { group_number?: string | number; tables?: Record<string, unknown[]> };
    parseAndValidateBackup(saved);
    if (String(verified.group_number ?? '').replace(/^KYA\s*/i, '') !== String(parsed.group_number).replace(/^KYA\s*/i, '')) {
      throw new Error('The saved backup group identity did not verify.');
    }
    return { success: true, message: 'Group-only backup created and verified.', filePath, fileName, groupNumber: String(parsed.group_number) };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown group backup error.';
    return { success: false, message: 'Group backup failed.', error: message };
  }
}

const CLOUDFLARE_WORKER_URL = 'https://ebadsave-vsla.info-ebadsave.workers.dev';
const CLOUDFLARE_ADMIN_SESSION_KEY = 'ebadsave.cloudflare.admin.session.v1';

type CloudflareSession = { accessToken: string; expiresAt: number; groupId: string; role: string };

async function getCloudflareSession(): Promise<CloudflareSession> {
  const raw = await SecureStore.getItemAsync(CLOUDFLARE_ADMIN_SESSION_KEY);
  if (!raw) throw new Error('Sign in as this group administrator to Cloudflare first.');
  let session: CloudflareSession;
  try { session = JSON.parse(raw) as CloudflareSession; } catch { throw new Error('Cloudflare session is invalid. Sign in again.'); }
  if (!session.accessToken || session.expiresAt <= Date.now() + 15_000) {
    await SecureStore.deleteItemAsync(CLOUDFLARE_ADMIN_SESSION_KEY);
    throw new Error('Cloudflare administrator session expired. Sign in again.');
  }
  return session;
}

async function cloudflareRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = await getCloudflareSession();
  const response = await fetch(`${CLOUDFLARE_WORKER_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      ...(init.headers || {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    let reason = text;
    try { reason = (JSON.parse(text) as { error?: string }).error || text; } catch { /* keep response text */ }
    throw new Error(`Cloudflare request failed (${response.status}): ${reason || 'unknown_error'}`);
  }
  return await response.json() as T;
}

export async function signInCloudflareBackupAdmin(memberNumber: string, pin: string): Promise<{ success: boolean; message: string }> {
  const normalized = memberNumber.trim().toUpperCase().replace(/\s+/g, ' ');
  if (!/^KYA\s?\d{7}$/.test(normalized)) throw new Error('Enter a valid member number, for example KYA 2000001.');
  if (!/^\d{6,12}$/.test(pin)) throw new Error('Administrator PIN must contain 6–12 digits.');
  const response = await fetch(`${CLOUDFLARE_WORKER_URL}/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ memberNumber: normalized, pin }),
  });
  const payload = await response.json() as { accessToken?: string; expiresIn?: number; error?: string };
  if (!response.ok || !payload.accessToken) throw new Error(`Cloudflare login failed: ${payload.error || response.status}`);
  const tokenParts = payload.accessToken.split('.');
  if (tokenParts.length !== 3) throw new Error('Cloudflare returned an invalid access token.');
  let claims: { groupId?: string; role?: string };
  try { claims = JSON.parse(decodeURIComponent(Array.from(atob(tokenParts[1].replace(/-/g, '+').replace(/_/g, '/')), (c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''))); }
  catch { throw new Error('Could not read Cloudflare token claims.'); }
  if (!claims.groupId || claims.role !== 'admin') throw new Error('This account is not a group administrator.');
  await SecureStore.setItemAsync(CLOUDFLARE_ADMIN_SESSION_KEY, JSON.stringify({
    accessToken: payload.accessToken, groupId: claims.groupId, role: claims.role,
    expiresAt: Date.now() + Math.max(60, payload.expiresIn || 900) * 1000,
  }), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  return { success: true, message: 'Cloudflare administrator sign-in successful. Session expires automatically.' };
}

export async function signOutCloudflareBackupAdmin(): Promise<void> {
  await SecureStore.deleteItemAsync(CLOUDFLARE_ADMIN_SESSION_KEY);
}

/** Encrypt and upload a group-only snapshot. The passphrase is required to recover it on another device. */
export async function uploadGroupDatabaseBackupToCloud(
  groupId: number,
  passphraseInput: string,
): Promise<{ success: boolean; message: string; groupNumber?: string; error?: string }> {
  try {
    const passphrase = requirePassphrase(passphraseInput);
    const contents = await createGroupDatabaseBackup(groupId);
    const parsed = JSON.parse(contents) as BackupEnvelope & { group_number?: string | number };
    parseAndValidateBackup(contents);
    if (parsed.group_number === undefined || parsed.group_number === null) throw new Error('The group backup has no KYA group identity.');
    const groupNumber = String(parsed.group_number).replace(/^KYA\s*/i, '').trim();
    const envelope = await encryptBackupForCloud(contents, passphrase);
    const backupId = `g${groupNumber}_${Date.now()}_${Crypto.randomUUID()}`.replace(/[^A-Za-z0-9_-]/g, '_');
    const encryptedBody = JSON.stringify(envelope);
    const response = await cloudflareRequest<{ ok?: boolean; backupId?: string; encrypted?: boolean }>(
      '/v1/backups',
      { method: 'POST', headers: {
          'Content-Type': 'application/octet-stream',
          'x-backup-id': backupId,
          'x-backup-encrypted': 'true',
          'x-group-id': (await getCloudflareSession()).groupId,
          'x-group-number': groupNumber,
        }, body: encryptedBody },
    );
    if (!response.ok || !response.backupId || response.encrypted !== true) throw new Error('Cloudflare did not confirm the encrypted backup upload.');
    return { success: true, message: `Encrypted backup for KYA ${groupNumber} uploaded to Cloudflare R2 and catalogued in D1.`, groupNumber };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Cloudflare group backup error.';
    return { success: false, message: 'Cloudflare group backup failed.', error: message };
  }
}

/** List only encrypted group backups for the requested group and passphrase vault. */
export async function listCloudGroupBackups(
  passphraseInput: string,
  groupNumberInput: string | number,
): Promise<{ success: boolean; backups: CloudBackupFileInfo[]; message: string; error?: string }> {
  try {
    requirePassphrase(passphraseInput);
    const expected = String(groupNumberInput).replace(/^KYA\s*/i, '').trim();
    if (!/^\d{4}$/.test(expected)) throw new Error('Enter a four-digit KYA group number.');
    const result = await cloudflareRequest<{ backups?: Array<{ backupId: string; bytes: number; createdAt: string }> }>('/v1/backups');
    const backups = (result.backups || []).filter((item) => item.backupId.startsWith(`g${expected}_`)).map((item) => ({
      objectId: item.backupId,
      name: `KYA ${expected} encrypted backup (${item.bytes} bytes)`,
      createdAt: item.createdAt || '',
      backupCreatedAt: item.createdAt || '',
      fileUrl: '',
      vaultId: 'cloudflare-group-admin',
      bytes: item.bytes,
    }));
    return { success: true, backups, message: `Cloudflare returned ${backups.length} backup(s) for the signed-in administrator's group. The group number is verified again before restore.` };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Cloudflare backup lookup error.';
    return { success: false, backups: [], message: 'Could not load Cloudflare group backups.', error: message };
  }
}

/** Restore one matching group backup. The database layer refuses non-empty databases safely. */
export async function restoreCloudGroupDatabaseBackup(
  cloudBackup: CloudBackupFileInfo,
  passphraseInput: string,
  expectedGroupNumber: string | number,
): Promise<{ success: boolean; message: string; error?: string; localFilePath?: string; localFileName?: string }> {
  try {
    requirePassphrase(passphraseInput);
    const expected = String(expectedGroupNumber).replace(/^KYA\s*/i, '').trim();
    if (!/^\d{4}$/.test(expected)) throw new Error('Enter the four-digit KYA group number to restore.');
    const response = await fetch(`${CLOUDFLARE_WORKER_URL}/v1/backups/${encodeURIComponent(cloudBackup.objectId)}`, {
      headers: { Authorization: `Bearer ${(await getCloudflareSession()).accessToken}` },
    });
    if (!response.ok) throw new Error(`Cloudflare backup download failed (${response.status}).`);
    if (response.headers.get('x-backup-encrypted') !== 'true') throw new Error('Cloudflare did not identify this object as encrypted. Restore stopped.');
    const encryptedContents = await response.text();
    const decrypted = decryptCloudBackup(encryptedContents, passphraseInput);
    const parsed = JSON.parse(decrypted) as { group_number?: string | number };
    parseAndValidateBackup(decrypted);
    const actual = String(parsed.group_number ?? '').replace(/^KYA\s*/i, '').trim();
    if (actual !== expected) throw new Error(`Backup is for KYA ${actual || 'unknown'}, not KYA ${expected}. No data was changed.`);
    const localFileName = `ebadsave_group_${expected}_cloudflare_recovery_${makeTimestamp()}.json`;
    const localFilePath = `${getDocumentsDirectory()}${localFileName}`;
    await FileSystem.writeAsStringAsync(localFilePath, decrypted, { encoding: FileSystem.EncodingType.UTF8 });
    const saved = await FileSystem.readAsStringAsync(localFilePath, { encoding: FileSystem.EncodingType.UTF8 });
    parseAndValidateBackup(saved);
    await restoreGroupDatabaseBackup(saved, expected);
    return { success: true, message: `KYA ${expected} restored from Cloudflare. A verified local recovery copy was retained.`, localFilePath, localFileName };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Cloudflare group restore error.';
    return { success: false, message: 'Cloudflare group restore failed.', error: message };
  }
}

/** Create a local JSON backup, verify it, and leave the file stored on the device. */
export async function exportDatabaseBackup(): Promise<{
  success: boolean;
  message: string;
  filePath?: string;
  fileName?: string;
  error?: string;
}> {
  try {
    const json = await createDatabaseBackup();
    parseAndValidateBackup(json);

    const now = new Date();
    const fileName = `ebadsave_backup_${makeTimestamp()}.json`;
    const filePath = `${getDocumentsDirectory()}${fileName}`;

    await FileSystem.writeAsStringAsync(filePath, json, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    const info = await FileSystem.getInfoAsync(filePath);
    if (!info.exists || !('size' in info) || Number(info.size) <= 0) {
      throw new Error('The backup file could not be verified after saving.');
    }

    const savedContents = await FileSystem.readAsStringAsync(filePath, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    parseAndValidateBackup(savedContents);

    // Keep the two newest local backup files, as requested. The newly created
    // backup is verified before any older file is removed.
    await pruneLocalBackupFiles(MAX_LOCAL_BACKUP_FILES);

    return {
      success: true,
      message: `Verified local database backup created at ${now.toLocaleString()}. Only the two newest local backup files are retained.`,
      filePath,
      fileName,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown backup error.';
    return { success: false, message: 'Backup failed.', error: message };
  }
}

export async function emailBackupFile(filePath: string, fileName: string): Promise<{
  success: boolean;
  message: string;
  error?: string;
}> {
  try {
    const available = await MailComposer.isAvailableAsync();
    if (!available) {
      return { success: false, message: 'Email is not available on this device.', error: 'EMAIL_NOT_AVAILABLE' };
    }
    const info = await FileSystem.getInfoAsync(filePath);
    if (!info.exists) {
      return { success: false, message: 'The backup file could not be found.', error: 'BACKUP_NOT_FOUND' };
    }

    const result = await MailComposer.composeAsync({
      subject: `Ebadsave VSLA Backup - ${new Date().toLocaleDateString()}`,
      body: `Please find attached your Ebadsave VSLA backup.\n\nFile: ${fileName}\nCreated: ${new Date().toLocaleString()}\n\nKeep this file safe. Restoring a backup replaces current records with the records in that backup.`,
      attachments: [filePath],
    });

    if (result.status === 'sent') return { success: true, message: 'Backup email sent.' };
    if (result.status === 'saved') return { success: true, message: 'Backup email saved as a draft.' };
    return { success: false, message: 'Email was not sent.', error: result.status };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown email error.';
    return { success: false, message: 'Could not email the backup.', error: message };
  }
}

export async function listBackupFiles(): Promise<BackupFileInfo[]> {
  try {
    const directory = getDocumentsDirectory();
    const names = await FileSystem.readDirectoryAsync(directory);
    const backups = names.filter((name) => name.startsWith('ebadsave_backup_') && name.endsWith('.json'));
    const details = await Promise.all(backups.map(async (name) => {
      const path = `${directory}${name}`;
      const info = await FileSystem.getInfoAsync(path);
      let timestamp = 'Unknown';
      try {
        const content = await FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.UTF8 });
        const parsed = JSON.parse(content) as { created_at?: string };
        if (parsed.created_at) timestamp = new Date(parsed.created_at).toLocaleString();
      } catch {
        // Keep the file visible so the user can identify/remove an invalid backup.
      }
      return { name, path, size: info.exists && 'size' in info ? Number(info.size) : 0, timestamp };
    }));
    return details.sort((a, b) => b.name.localeCompare(a.name));
  } catch {
    return [];
  }
}

/** Validate the entire backup before calling the existing transactional database restore. */
export async function restoreDatabaseBackup(filePath: string): Promise<{
  success: boolean;
  message: string;
  tablesRestored?: number;
  error?: string;
}> {
  try {
    const info = await FileSystem.getInfoAsync(filePath);
    if (!info.exists) throw new Error('The selected backup file does not exist.');
    const contents = await FileSystem.readAsStringAsync(filePath, { encoding: FileSystem.EncodingType.UTF8 });
    if (!contents.trim()) throw new Error('The selected backup file is empty. No data was changed.');

    const validated = parseAndValidateBackup(contents);
    await restoreDatabaseBackupJson(JSON.stringify(validated));
    return {
      success: true,
      message: `Backup restored successfully (${REQUIRED_BACKUP_TABLES.length} required tables validated).`,
      tablesRestored: REQUIRED_BACKUP_TABLES.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown restore error.';
    return { success: false, message: 'Backup restore failed.', error: message };
  }
}

export async function deleteBackupFile(filePath: string): Promise<{ success: boolean; message: string; error?: string }> {
  try {
    const info = await FileSystem.getInfoAsync(filePath);
    if (!info.exists) return { success: false, message: 'Backup file not found.' };
    await FileSystem.deleteAsync(filePath, { idempotent: false });
    return { success: true, message: 'Backup file deleted.' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown deletion error.';
    return { success: false, message: 'Could not delete backup file.', error: message };
  }
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return 'Unknown size';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}


// Automatic backups use a device-generated key stored in Android/iOS secure storage.
// The key is never sent to Back4App; it is used locally to encrypt/decrypt the backup.
const AUTO_BACKUP_SECRET_KEY = 'ebadsave.back4app.autoBackupSecret.v1';
const AUTO_BACKUP_LAST_SUCCESS_KEY = 'ebadsave.back4app.autoBackupLastSuccess.v1';
const AUTO_BACKUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const MAX_LOCAL_BACKUP_FILES = 2;
const MAX_CLOUD_BACKUP_FILES = 2;
let automaticBackupInProgress = false;

async function getAutomaticBackupPassphrase(): Promise<string> {
  let secret = await SecureStore.getItemAsync(AUTO_BACKUP_SECRET_KEY);
  if (secret && secret.length >= 32) return secret;

  // 32 random bytes produce a strong 64-character hexadecimal secret.
  secret = randomBytesToHex(await Crypto.getRandomBytesAsync(32));
  await SecureStore.setItemAsync(AUTO_BACKUP_SECRET_KEY, secret, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return secret;
}

async function hasInternetConnection(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    return state.isConnected === true && state.isInternetReachable !== false;
  } catch {
    // If the network state cannot be determined, do not risk an upload attempt.
    return false;
  }
}

/**
 * Creates an encrypted Back4App backup automatically when internet is available.
 * It runs at most once every six hours unless force=true. A failed upload is retried
 * on a later app start/network opportunity. Local backups remain on the device.
 */
export async function runAutomaticCloudBackup(force = false): Promise<{
  success: boolean;
  skipped?: boolean;
  message: string;
  error?: string;
}> {
  if (automaticBackupInProgress) {
    return { success: true, skipped: true, message: 'An automatic backup is already running.' };
  }

  automaticBackupInProgress = true;
  try {
    if (!(await hasInternetConnection())) {
      return { success: false, skipped: true, message: 'Automatic backup is waiting for an internet connection.' };
    }

    const lastSuccessText = await SecureStore.getItemAsync(AUTO_BACKUP_LAST_SUCCESS_KEY);
    const lastSuccess = lastSuccessText ? Number(lastSuccessText) : 0;
    if (!force && Number.isFinite(lastSuccess) && Date.now() - lastSuccess < AUTO_BACKUP_INTERVAL_MS) {
      return { success: true, skipped: true, message: 'Automatic backup is up to date.' };
    }

    const local = await exportDatabaseBackup();
    if (!local.success || !local.filePath || !local.fileName) {
      throw new Error(local.error || local.message || 'Could not create a local backup.');
    }

    const secret = await getAutomaticBackupPassphrase();
    const uploaded = await uploadDatabaseBackupToCloud(local.filePath, local.fileName, secret);
    if (!uploaded.success) {
      throw new Error(uploaded.error || uploaded.message || 'Back4App upload failed.');
    }

    await SecureStore.setItemAsync(AUTO_BACKUP_LAST_SUCCESS_KEY, String(Date.now()));
    return { success: true, message: 'Automatic encrypted backup completed.' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown automatic backup error.';
    return { success: false, message: 'Automatic backup did not complete.', error: message };
  } finally {
    automaticBackupInProgress = false;
  }
}

/** Lists backups created by this device's automatic backup vault. */
export async function listAutomaticCloudBackups(): Promise<{
  success: boolean;
  backups: CloudBackupFileInfo[];
  message: string;
  error?: string;
}> {
  try {
    if (!(await hasInternetConnection())) {
      return { success: false, backups: [], message: 'Connect to the internet to view cloud backups.' };
    }
    const secret = await getAutomaticBackupPassphrase();
    return await listCloudBackups(secret);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown cloud backup error.';
    return { success: false, backups: [], message: 'Could not load automatic cloud backups.', error: message };
  }
}

/** Restores a selected automatic cloud backup without asking for a separate passphrase or consent prompt. */
export async function restoreAutomaticCloudBackup(
  cloudBackup: CloudBackupFileInfo,
): Promise<{ success: boolean; message: string; error?: string; localFilePath?: string; localFileName?: string }> {
  try {
    if (!(await hasInternetConnection())) {
      throw new Error('Connect to the internet before restoring a cloud backup.');
    }
    const secret = await getAutomaticBackupPassphrase();
    const result = await restoreCloudDatabaseBackup(cloudBackup, secret);
    if (!result.success) throw new Error(result.error || result.message);

    // Force a fresh cloud backup on the next eligible opportunity after a restore.
    await SecureStore.deleteItemAsync(AUTO_BACKUP_LAST_SUCCESS_KEY);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown automatic restore error.';
    return { success: false, message: 'Could not restore the automatic cloud backup.', error: message };
  }
}
