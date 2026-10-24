import * as FileSystem from 'expo-file-system';
import * as MailComposer from 'expo-mail-composer';
import * as Crypto from 'expo-crypto';
import * as CryptoJS from 'crypto-js';
import * as SecureStore from 'expo-secure-store';
import * as Network from 'expo-network';
import {
  createDatabaseBackup,
  restoreDatabaseBackup as restoreDatabaseBackupJson,
} from '../database/database';
import {
  BACK4APP_APPLICATION_ID,
  BACK4APP_BACKUP_CLASS,
  BACK4APP_JAVASCRIPT_KEY,
  BACK4APP_SERVER_URL,
} from '../config/back4app';

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
const VAULT_LOOKUP_SALT = 'Ebadsave-VSLA-Back4App-Vault-Lookup-v1';

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

function vaultIdForPassphrase(passphraseInput: string): string {
  const passphrase = requirePassphrase(passphraseInput);
  return CryptoJS.PBKDF2(passphrase, VAULT_LOOKUP_SALT, {
    keySize: 256 / 32,
    iterations: PBKDF2_ITERATIONS,
    hasher: CryptoJS.algo.SHA256,
  }).toString(CryptoJS.enc.Hex);
}

function parseApiHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    'X-Parse-Application-Id': BACK4APP_APPLICATION_ID,
    'X-Parse-Javascript-Key': BACK4APP_JAVASCRIPT_KEY,
    ...extra,
  };
}

async function parseApiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${BACK4APP_SERVER_URL}${path}`, {
    ...init,
    headers: parseApiHeaders({
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers as Record<string, string> | undefined),
    }),
  });

  const responseText = await response.text();
  let payload: unknown = {};
  if (responseText) {
    try {
      payload = JSON.parse(responseText);
    } catch {
      payload = { error: responseText };
    }
  }
  if (!response.ok) {
    const details = payload as { error?: string; code?: number };
    throw new Error(
      details.error
        ? `Back4App error${details.code ? ` (${details.code})` : ''}: ${details.error}`
        : `Back4App request failed (${response.status}).`,
    );
  }
  return payload as T;
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

/**
 * Ask Back4App Cloud Code to keep only the two newest records and their files
 * for this backup vault. Deletion must run server-side; the app must never hold
 * a Master Key. The matching Cloud Code function is supplied separately.
 */
async function pruneCloudBackupsForVault(vaultId: string): Promise<void> {
  await parseApiRequest<{ result?: { deleted?: number } }>('/functions/pruneEbadsaveBackups', {
    method: 'POST',
    body: JSON.stringify({ vaultId, keep: MAX_CLOUD_BACKUP_FILES }),
  });
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

/**
 * Upload an encrypted copy of a local backup. The original local backup is never modified or deleted.
 * The cloud file contains ciphertext, not the readable SQLite JSON snapshot.
 */
export async function uploadDatabaseBackupToCloud(
  filePath: string,
  fileName: string,
  passphraseInput: string,
): Promise<{ success: boolean; message: string; error?: string }> {
  try {
    const passphrase = requirePassphrase(passphraseInput);
    const info = await FileSystem.getInfoAsync(filePath);
    if (!info.exists) throw new Error('The local backup file could not be found.');

    const contents = await FileSystem.readAsStringAsync(filePath, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    const validated = parseAndValidateBackup(contents);
    const encryptedEnvelope = await encryptBackupForCloud(JSON.stringify(validated), passphrase);
    const cloudFileName = `${fileName.replace(/\.json$/i, '')}_encrypted_${Date.now()}.json`;

    const uploadedFile = await parseApiRequest<{ name: string; url: string }>(
      `/files/${encodeURIComponent(cloudFileName)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(encryptedEnvelope),
      },
    );

    if (!uploadedFile?.name || !uploadedFile?.url) {
      throw new Error('Back4App did not confirm that the encrypted file was uploaded.');
    }

    await parseApiRequest<{ objectId: string }>(`/classes/${BACK4APP_BACKUP_CLASS}`, {
      method: 'POST',
      body: JSON.stringify({
        file: { __type: 'File', name: uploadedFile.name, url: uploadedFile.url },
        backupFileName: fileName,
        backupCreatedAt: validated.created_at,
        vaultId: vaultIdForPassphrase(passphrase),
        encrypted: true,
        // Cloud records can be read but cannot be changed/deleted through a public client key.
        ACL: { '*': { read: true, write: false } },
      }),
    });

    let retentionMessage = '';
    try {
      await pruneCloudBackupsForVault(vaultIdForPassphrase(passphrase));
    } catch (retentionError) {
      // Do not misreport a successful upload as failed. Cloud retention will
      // work after the matching Back4App Cloud Code function is deployed.
      const retentionDetails = retentionError instanceof Error ? retentionError.message : 'unknown error';
      retentionMessage = ` Cloud cleanup is pending Cloud Code setup (${retentionDetails}).`;
    }

    return {
      success: true,
      message: `Encrypted backup uploaded to Back4App. The local backup file is retained.${retentionMessage}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown cloud backup error.';
    return { success: false, message: 'Cloud backup failed.', error: message };
  }
}

/** List cloud backups associated with the supplied passphrase's vault identifier. */
export async function listCloudBackups(
  passphraseInput: string,
): Promise<{ success: boolean; backups: CloudBackupFileInfo[]; message: string; error?: string }> {
  try {
    const vaultId = vaultIdForPassphrase(passphraseInput);
    const where = encodeURIComponent(JSON.stringify({ vaultId, encrypted: true }));
    const result = await parseApiRequest<{
      results?: Array<{
        objectId: string;
        createdAt: string;
        backupCreatedAt?: string;
        backupFileName?: string;
        vaultId: string;
        file?: { url?: string; name?: string };
      }>;
    }>(`/classes/${BACK4APP_BACKUP_CLASS}?where=${where}&order=-createdAt&limit=100`);

    const backups = (result.results || [])
      .filter((item) => Boolean(item.objectId && item.file?.url))
      .map((item) => ({
        objectId: item.objectId,
        name: item.backupFileName || item.file?.name || 'Ebadsave cloud backup',
        createdAt: item.createdAt || '',
        backupCreatedAt: item.backupCreatedAt || item.createdAt || '',
        fileUrl: item.file!.url!,
        vaultId: item.vaultId,
      }));

    return { success: true, backups, message: `Found ${backups.length} cloud backup(s).` };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown cloud backup error.';
    return { success: false, backups: [], message: 'Could not load internet backups.', error: message };
  }
}

/** Download, decrypt, validate, save a new local copy, then restore through the existing DB restore path. */
export async function restoreCloudDatabaseBackup(
  cloudBackup: CloudBackupFileInfo,
  passphraseInput: string,
): Promise<{ success: boolean; message: string; error?: string; localFilePath?: string; localFileName?: string }> {
  try {
    requirePassphrase(passphraseInput);
    const response = await fetch(cloudBackup.fileUrl);
    if (!response.ok) throw new Error(`Could not download cloud backup (${response.status}).`);
    const encryptedText = await response.text();
    if (!encryptedText) throw new Error('The selected internet backup is empty. No data was changed.');

    const decrypted = decryptCloudBackup(encryptedText, passphraseInput);
    parseAndValidateBackup(decrypted);

    // Preserve every existing local backup and save the downloaded plaintext as an additional local file.
    const localFileName = `ebadsave_backup_cloud_${makeTimestamp()}.json`;
    const localFilePath = `${getDocumentsDirectory()}${localFileName}`;
    await FileSystem.writeAsStringAsync(localFilePath, decrypted, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    const localInfo = await FileSystem.getInfoAsync(localFilePath);
    if (!localInfo.exists || !('size' in localInfo) || Number(localInfo.size) <= 0) {
      throw new Error('The downloaded backup could not be saved locally. No data was changed.');
    }

    const savedCopy = await FileSystem.readAsStringAsync(localFilePath, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    parseAndValidateBackup(savedCopy);

    const restoreResult = await restoreDatabaseBackup(localFilePath);
    if (!restoreResult.success) {
      throw new Error(restoreResult.error || restoreResult.message);
    }
    // The restored file is verified and successfully applied before older local
    // backup files are pruned. The newest two remain available for recovery.
    await pruneLocalBackupFiles(MAX_LOCAL_BACKUP_FILES);

    return {
      success: true,
      message: `Cloud backup restored. A separate local copy was saved as ${localFileName}. Your previous local backup files were not changed.`,
      localFilePath,
      localFileName,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown cloud restore error.';
    return { success: false, message: 'Could not restore the internet backup.', error: message };
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

/**
 * Create a cloud backup that can be recovered on another device.
 * Unlike runAutomaticCloudBackup(), this uses a passphrase supplied by the
 * group and does not rely on the device-only SecureStore secret.
 *
 * IMPORTANT: This is a full-database backup for the existing manual backup
 * format. Do not use its restore path for group-only recovery until the
 * group-scoped transactional restore is implemented and connected.
 */
export async function createRecoverableCloudBackup(
  recoveryPassphrase: string,
): Promise<{ success: boolean; message: string; error?: string }> {
  try {
    if (!(await hasInternetConnection())) {
      throw new Error('Connect to the internet before creating a recovery backup.');
    }

    const passphrase = requirePassphrase(recoveryPassphrase);
    const local = await exportDatabaseBackup();
    if (!local.success || !local.filePath || !local.fileName) {
      throw new Error(local.error || local.message || 'Could not create a verified local backup.');
    }

    const uploaded = await uploadDatabaseBackupToCloud(
      local.filePath,
      local.fileName,
      passphrase,
    );
    if (!uploaded.success) {
      throw new Error(uploaded.error || uploaded.message || 'Could not upload the recovery backup.');
    }

    return {
      success: true,
      message: 'Encrypted recovery backup uploaded. Keep the recovery passphrase safe; it is required on another device.',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown recovery backup error.';
    return { success: false, message: 'Could not create a recoverable cloud backup.', error: message };
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
