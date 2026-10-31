import * as FileSystem from 'expo-file-system';
import * as MailComposer from 'expo-mail-composer';
import * as Crypto from 'expo-crypto';
import * as CryptoJS from 'crypto-js';
import * as SecureStore from 'expo-secure-store';
import {
  createDatabaseBackup,
  createGroupDatabaseBackup,
  restoreGroupDatabaseBackup,
  restoreDatabaseBackup as restoreDatabaseBackupJson,
} from '../database/database';

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
const MAX_LOCAL_BACKUP_FILES = 2;

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

function deriveEncryptionKey(
  passphrase: string,
  saltHex: string,
): CryptoJS.lib.WordArray {
  return CryptoJS.PBKDF2(passphrase, CryptoJS.enc.Hex.parse(saltHex), {
    keySize: 256 / 32,
    iterations: PBKDF2_ITERATIONS,
    hasher: CryptoJS.algo.SHA256,
  });
}

function deriveAuthenticationKey(
  passphrase: string,
  saltHex: string,
): CryptoJS.lib.WordArray {
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

function authenticatedPayload(
  envelope: Omit<EncryptedCloudEnvelope, 'mac'>,
): string {
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
    mac: CryptoJS.HmacSHA256(
      authenticatedPayload(unsignedEnvelope),
      authenticationKey,
    ).toString(CryptoJS.enc.Hex),
  };
}

function decryptCloudBackup(
  encryptedContents: string,
  passphraseInput: string,
): string {
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

  try {
    parseAndValidateBackup(plaintext);
  } catch {
    throw new Error('Could not decrypt a valid backup. Check the passphrase and try again.');
  }

  return plaintext;
}

async function pruneLocalBackupFiles(
  keep = MAX_LOCAL_BACKUP_FILES,
): Promise<void> {
  const directory = getDocumentsDirectory();
  const names = await FileSystem.readDirectoryAsync(directory);

  const candidates = names.filter(
    (name) => name.startsWith('ebadsave_backup_') && name.endsWith('.json'),
  );

  const details = await Promise.all(
    candidates.map(async (name) => {
      const path = `${directory}${name}`;
      let createdAt = 0;

      try {
        const contents = await FileSystem.readAsStringAsync(path, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        const parsed = JSON.parse(contents) as { created_at?: string };
        createdAt = parsed.created_at
          ? new Date(parsed.created_at).getTime()
          : 0;
      } catch {
        // Invalid files are sorted behind valid backups.
      }

      if (!Number.isFinite(createdAt)) createdAt = 0;
      return { name, path, createdAt };
    }),
  );

  details.sort(
    (a, b) => b.createdAt - a.createdAt || b.name.localeCompare(a.name),
  );

  for (const oldBackup of details.slice(Math.max(0, keep))) {
    await FileSystem.deleteAsync(oldBackup.path, { idempotent: true });
  }
}

export async function exportGroupDatabaseBackup(
  groupId: number,
): Promise<{
  success: boolean;
  message: string;
  filePath?: string;
  fileName?: string;
  groupNumber?: string;
  error?: string;
}> {
  try {
    const json = await createGroupDatabaseBackup(groupId);
    const parsed = JSON.parse(json) as BackupEnvelope & {
      group_number?: string | number;
    };

    parseAndValidateBackup(json);

    if (!parsed.group_number) {
      throw new Error('The group backup has no KYA group identity.');
    }

    const fileName = `ebadsave_group_${String(parsed.group_number).replace(/^KYA\s*/i, '')}_${makeTimestamp()}.json`;
    const filePath = `${getDocumentsDirectory()}${fileName}`;

    await FileSystem.writeAsStringAsync(filePath, json
