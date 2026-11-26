// Sends SMS through the phone's own SIM (Android SmsManager). No internet, no gateway.
// Every result is recorded in the local SQLite table `sms_history`.
// Sending is NEVER blocked by SMS credit, and the app never touches airtime or Mobile Money.

import { PermissionsAndroid, Platform } from 'react-native';
import SimSms from '../../modules/ebadsave-sms';
import { getAppDatabase } from '../database/database';

export type SmsKind = 'meeting_summary' | 'announcement';

export interface OutgoingSms {
  /** Stable id. A message already marked 'sent' under this id is never sent twice. */
  id: string;
  to: string;
  text: string;
  kind: SmsKind;
  memberName?: string;
  groupId?: number;
  meetingId?: number;
  memberId?: number;
}

export interface SmsRunSummary {
  sent: number;
  failed: number;
  /** Already sent earlier (same id), so skipped. */
  skipped: number;
  permissionDenied: boolean;
}

export interface SmsHistoryRow {
  id: string;
  kind: string;
  member_name: string | null;
  phone: string;
  status: 'sent' | 'failed';
  error: string | null;
  created_at: string;
}

// Display-only tracking. 5000 UGX typed in -> 250 credits (20 UGX per SMS).
export const UGX_PER_SMS_CREDIT = 20;
const PAUSE_BETWEEN_SMS_MS = 400; // gentle on the radio and Android's SMS rate limit

let tablesReady = false;
let running = false;

async function db() {
  const database = await getAppDatabase();
  if (!tablesReady) {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS sms_history (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        group_id INTEGER,
        meeting_id INTEGER,
        member_id INTEGER,
        member_name TEXT,
        phone TEXT NOT NULL,
        message TEXT NOT NULL,
        status TEXT NOT NULL,
        error TEXT,
        created_at TEXT NOT NULL,
        sent_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_sms_history_meeting ON sms_history(meeting_id);
      CREATE TABLE IF NOT EXISTS sms_credit (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        credits INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );
    `);
    tablesReady = true;
  }
  return database;
}

/** +2567XXXXXXXX for a valid Ugandan mobile number, otherwise null. */
export function toUgandaSimNumber(value: string | null | undefined): string | null {
  const n = (value || '').replace(/[\s()-]/g, '');
  if (/^07\d{8}$/.test(n)) return `+256${n.slice(1)}`;
  if (/^\+?2567\d{8}$/.test(n)) return `+${n.replace('+', '')}`;
  return null;
}

export const isValidUgandaPhone = (v: string | null | undefined) => toUgandaSimNumber(v) !== null;

async function ensureSendPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const permission = PermissionsAndroid.PERMISSIONS.SEND_SMS;
  if (await PermissionsAndroid.check(permission)) return true;
  const result = await PermissionsAndroid.request(permission, {
    title: 'Send SMS',
    message: 'Ebadsave sends member SMS from your own SIM card. Your telecom charges your normal SMS rate.',
    buttonPositive: 'Allow',
    buttonNegative: 'Not now',
  });
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

// --- SMS credit (tracking only) ---------------------------------------------

export async function getSmsCredit(): Promise<number> {
  const row = await (await db()).getFirstAsync<{ credits: number }>(`SELECT credits FROM sms_credit WHERE id = 1`);
  return Number(row?.credits ?? 0);
}

async function setSmsCredit(credits: number): Promise<void> {
  await (await db()).runAsync(
    `INSERT INTO sms_credit (id, credits, updated_at) VALUES (1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET credits = excluded.credits, updated_at = excluded.updated_at`,
    Math.max(0, Math.floor(credits)), new Date().toISOString(),
  );
}

/** Adds display credits only. Does not touch real airtime. */
export async function convertAirtimeToSmsCredit(amountUgx: number): Promise<number> {
  const added = Math.floor(Number(amountUgx) / UGX_PER_SMS_CREDIT);
  if (!Number.isFinite(added) || added <= 0) throw new Error(`Enter at least UGX ${UGX_PER_SMS_CREDIT}.`);
  const total = (await getSmsCredit()) + added;
  await setSmsCredit(total);
  return total;
}

// --- History -----------------------------------------------------------------

export async function getSmsCounts(filter: { meetingId?: number; kind?: SmsKind } = {}) {
  const rows = await (await db()).getAllAsync<{ status: string; n: number }>(
    `SELECT status, COUNT(*) AS n FROM sms_history
     WHERE (? IS NULL OR meeting_id = ?) AND (? IS NULL OR kind = ?) GROUP BY status`,
    filter.meetingId ?? null, filter.meetingId ?? null, filter.kind ?? null, filter.kind ?? null,
  );
  const counts = { sent: 0, failed: 0 };
  for (const r of rows) {
    if (r.status === 'sent') counts.sent = Number(r.n);
    if (r.status === 'failed') counts.failed = Number(r.n);
  }
  return counts;
}

export async function getRecentSmsHistory(limit = 100): Promise<SmsHistoryRow[]> {
  return (await db()).getAllAsync<SmsHistoryRow>(
    `SELECT id, kind, member_name, phone, status, error, created_at
     FROM sms_history ORDER BY created_at DESC, rowid DESC LIMIT ?`, limit,
  );
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Sends to every item one by one through the SIM. A failure (no signal, wrong number)
 * is recorded as Failed and the loop continues with the next member.
 */
export async function sendSmsList(
  items: OutgoingSms[],
  onProgress?: (done: number, total: number) => void,
): Promise<SmsRunSummary> {
  const summary: SmsRunSummary = { sent: 0, failed: 0, skipped: 0, permissionDenied: false };
  if (items.length === 0) return summary;
  if (running) throw new Error('SMS sending is already in progress.');
  running = true;

  try {
    const database = await db();
    const allowed = await ensureSendPermission();
    let credits = await getSmsCredit();
    let done = 0;
    onProgress?.(0, items.length);

    for (const item of items) {
      const existing = await database.getFirstAsync<{ status: string }>(
        `SELECT status FROM sms_history WHERE id = ?`, item.id,
      );
      if (existing?.status === 'sent') {
        summary.skipped += 1;
      } else {
        const phone = toUgandaSimNumber(item.to);
        let error: string | null = null;
        if (!phone) error = 'E_BAD_NUMBER';
        else if (!allowed) { error = 'E_NO_PERMISSION'; summary.permissionDenied = true; }
        else {
          try {
            await SimSms.sendSms(phone, item.text);
          } catch (e) {
            error = (e as { code?: string })?.code || 'E_GENERIC';
          }
        }

        const now = new Date().toISOString();
        await database.runAsync(
          `INSERT INTO sms_history
             (id, kind, group_id, meeting_id, member_id, member_name, phone, message, status, error, created_at, sent_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET status = excluded.status, error = excluded.error,
             message = excluded.message, phone = excluded.phone, sent_at = excluded.sent_at`,
          item.id, item.kind, item.groupId ?? null, item.meetingId ?? null, item.memberId ?? null,
          item.memberName ?? null, phone ?? item.to, item.text,
          error ? 'failed' : 'sent', error, now, error ? null : now,
        );

        if (error) summary.failed += 1;
        else {
          summary.sent += 1;
          if (credits > 0) { credits -= 1; await setSmsCredit(credits); } // display tracking only
        }
        if (phone && allowed) await sleep(PAUSE_BETWEEN_SMS_MS);
      }
      done += 1;
      onProgress?.(done, items.length);
    }
    return summary;
  } finally {
    running = false;
  }
}
