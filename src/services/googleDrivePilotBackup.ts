/**
 * Google Drive pilot backup service for Ebadsave VSLA.
 *
 * This module is intentionally separate from src/database/backup.ts and
 * src/screens/backup.ts. It does not import, call, or modify Back4App code.
 * OAuth access tokens must be obtained by the app's Google sign-in flow and
 * passed to these functions; never hard-code client secrets or access tokens.
 *
 * Storage: Drive appDataFolder (private to this app). The JSON payload is
 * encrypted client-side before upload. A passphrase is required to restore.
 */
import * as Crypto from 'expo-crypto';
import * as CryptoJS from 'crypto-js';
import { createDatabaseBackup, restoreDatabaseBackup } from '../database/database';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const FORMAT = 'EBADSAVE_GOOGLE_DRIVE_ENCRYPTED_BACKUP';
const VERSION = 1;
const PBKDF2_ITERATIONS = 120_000;

const REQUIRED_TABLES = [
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

type EncryptedEnvelope = {
  format: typeof FORMAT;
  version: 1;
  created_at: string;
  salt: string;
  iv: string;
  ciphertext: string;
  mac: string;
};

export type GoogleDrivePilotBackupInfo = {
  id: string;
  name: string;
  createdTime?: string;
  size?: string;
};

function requirePassphrase(value: string): string {
  const passphrase = value.trim();
  if (passphrase.length < 12) throw new Error('Use the same backup passphrase (at least 12 characters).');
  return passphrase;
}

function deriveKey(passphrase: string, saltHex: string): CryptoJS.lib.WordArray {
  return CryptoJS.PBKDF2(passphrase, CryptoJS.enc.Hex.parse(saltHex), {
    keySize: 256 / 32, iterations: PBKDF2_ITERATIONS, hasher: CryptoJS.algo.SHA256,
  });
}

function deriveMacKey(passphrase: string, saltHex: string): CryptoJS.lib.WordArray {
  return CryptoJS.PBKDF2(passphrase, CryptoJS.enc.Utf8.parse(`Ebadsave-GoogleDrive-HMAC:${saltHex}`), {
    keySize: 256 / 32, iterations: PBKDF2_ITERATIONS, hasher: CryptoJS.algo.SHA256,
  });
}

function validateBackup(contents: string): void {
  let data: any;
  try { data = JSON.parse(contents); } catch { throw new Error('Backup content is not valid JSON.'); }
  if (!data || data.version !== 1 || typeof data.created_at !== 'string' || !data.tables || typeof data.tables !== 'object') {
    throw new Error('This is not a supported Ebadsave database backup.');
  }
  const missing = REQUIRED_TABLES.filter((table) => !Array.isArray(data.tables[table]));
  if (missing.length) throw new Error(`Backup is incomplete. Missing tables: ${missing.join(', ')}.`);
}

async function encrypt(contents: string, passphraseInput: string): Promise<string> {
  const passphrase = requirePassphrase(passphraseInput);
  validateBackup(contents);
  const salt = CryptoJS.lib.WordArray.random(16).toString(CryptoJS.enc.Hex);
  const iv = CryptoJS.lib.WordArray.random(16);
  const key = deriveKey(passphrase, salt);
  const ciphertext = CryptoJS.AES.encrypt(contents, key, { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }).ciphertext.toString(CryptoJS.enc.Base64);
  const ivHex = iv.toString(CryptoJS.enc.Hex);
  const mac = CryptoJS.HmacSHA256(`${FORMAT}|${VERSION}|${salt}|${ivHex}|${ciphertext}`, deriveMacKey(passphrase, salt)).toString(CryptoJS.enc.Hex);
  const envelope: EncryptedEnvelope = { format: FORMAT, version: VERSION, created_at: new Date().toISOString(), salt, iv: ivHex, ciphertext, mac };
  return JSON.stringify(envelope);
}

function decrypt(contents: string, passphraseInput: string): string {
  const passphrase = requirePassphrase(passphraseInput);
  let envelope: EncryptedEnvelope;
  try { envelope = JSON.parse(contents); } catch { throw new Error('The Google Drive backup is not valid JSON.'); }
  if (!envelope || envelope.format !== FORMAT || envelope.version !== VERSION || !envelope.salt || !envelope.iv || !envelope.ciphertext || !envelope.mac) {
    throw new Error('This is not a supported Ebadsave Google Drive pilot backup.');
  }
  const expectedMac = CryptoJS.HmacSHA256(`${FORMAT}|${VERSION}|${envelope.salt}|${envelope.iv}|${envelope.ciphertext}`, deriveMacKey(passphrase, envelope.salt)).toString(CryptoJS.enc.Hex);
  if (expectedMac.length !== envelope.mac.length || expectedMac !== envelope.mac) {
    throw new Error('Passphrase is incorrect or the backup has been altered.');
  }
  try {
    const plain = CryptoJS.AES.decrypt({ ciphertext: CryptoJS.enc.Base64.parse(envelope.ciphertext) } as any, deriveKey(passphrase, envelope.salt), {
      iv: CryptoJS.enc.Hex.parse(envelope.iv), mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7,
    }).toString(CryptoJS.enc.Utf8);
    validateBackup(plain);
    return plain;
  } catch { throw new Error('Could not decrypt a valid backup. Check the passphrase.'); }
}

async function driveRequest<T>(accessToken: string, url: string, init: RequestInit = {}): Promise<T> {
  if (!accessToken?.trim()) throw new Error('Google sign-in is required before using Drive backup.');
  const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${accessToken}`, ...(init.headers || {}) } });
  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(`Google Drive request failed (${response.status})${message ? `: ${message.slice(0, 240)}` : ''}`);
  }
  return response.json() as Promise<T>;
}

/** Upload a new encrypted full-database snapshot into the private appDataFolder. */
export async function uploadGoogleDrivePilotBackup(accessToken: string, passphrase: string): Promise<GoogleDrivePilotBackupInfo> {
  // Touch Expo Crypto here to ensure the installed Expo crypto module is available in the pilot build.
  await Crypto.getRandomBytesAsync(1);
  const plaintext = await createDatabaseBackup();
  const encrypted = await encrypt(plaintext, passphrase);
  const boundary = `ebadsave_${Date.now()}`;
  const metadata = { name: `ebadsave_drive_pilot_${new Date().toISOString().replace(/[:.]/g, '-')}.json`, parents: ['appDataFolder'], mimeType: 'application/json' };
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${encrypted}\r\n--${boundary}--`;
  return driveRequest<GoogleDrivePilotBackupInfo>(accessToken, `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name,createdTime,size`, {
    method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body,
  });
}

/** List only this app's private Drive pilot backups. */
export async function listGoogleDrivePilotBackups(accessToken: string): Promise<GoogleDrivePilotBackupInfo[]> {
  const q = encodeURIComponent("'appDataFolder' in parents and trashed = false and name contains 'ebadsave_drive_pilot_'");
  const result = await driveRequest<{ files?: GoogleDrivePilotBackupInfo[] }>(accessToken, `${DRIVE_API}/files?spaces=appDataFolder&q=${q}&orderBy=createdTime%20desc&pageSize=100&fields=files(id,name,createdTime,size)`);
  return result.files || [];
}

/** Download, authenticate, decrypt and validate before passing data to the existing DB restore routine. */
export async function restoreGoogleDrivePilotBackup(accessToken: string, fileId: string, passphrase: string): Promise<void> {
  if (!fileId?.trim()) throw new Error('Choose a Google Drive backup first.');
  const response = await fetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(`Could not download the Drive backup (${response.status}).`);
  const encrypted = await response.text();
  const plaintext = decrypt(encrypted, passphrase);
  // The app's database restore function is only called after authentication and full table validation.
  await restoreDatabaseBackup(plaintext);
}
