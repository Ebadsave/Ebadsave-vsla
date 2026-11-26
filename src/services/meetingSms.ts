import {
  getAppDatabase,
  getGroupById,
  getMemberLoanBalance,
  getMemberLoanDueDate,
  getMemberSavings,
  getMembersByGroupId,
  type MemberRecord,
} from '../database/database';
import {
  isValidUgandaPhone,
  sendSmsList,
  type OutgoingSms,
  type SmsRunSummary,
} from './smsSender';
import { announcementSms, meetingSummarySms } from './smsTemplates';

const EXECUTIVE_POSTS: Array<[string, string]> = [
  ['chairperson', 'Chairperson'], ['chair', 'Chairperson'],
  ['vice chair', 'Vice Chair'], ['vice-chair', 'Vice Chair'], ['vice chairperson', 'Vice Chair'],
  ['secretary', 'Secretary'], ['treasurer', 'Treasurer'],
  ['money counter', 'Money Counter'], ['key keeper', 'Key Keeper'],
];

/** The executive's post, read from the registered member record (assigned_roles). */
export function getExecutivePost(member: Pick<MemberRecord, 'assigned_roles' | 'role'>): string {
  for (const raw of (member.assigned_roles || '').split(',')) {
    const hit = EXECUTIVE_POSTS.find(([key]) => key === raw.trim().toLowerCase());
    if (hit) return hit[1];
  }
  return 'Executive';
}

export interface SmsRunResult extends SmsRunSummary {
  recipients: number;
  noPhone: number;
  batchId?: number;
}

/**
 * One individual SMS per member for a meeting, sent through the admin's SIM.
 * Ids are `meeting-<id>-member-<id>`: members already sent are skipped on a re-run,
 * members who failed are tried again.
 */
export async function sendMeetingClosingSms(params: {
  groupId: number;
  meetingId: number;
  executiveMemberId: number;
  onProgress?: (done: number, total: number) => void;
}): Promise<SmsRunResult> {
  const { groupId, meetingId, executiveMemberId, onProgress } = params;
  const [group, members] = await Promise.all([getGroupById(groupId), getMembersByGroupId(groupId)]);
  const database = await getAppDatabase();
  const meeting = await database.getFirstAsync<{ meeting_number: number; meeting_date: string }>(
    `SELECT meeting_number, meeting_date FROM group_meetings WHERE id = ? LIMIT 1`, meetingId,
  );
  const executive = members.find((m) => m.id === executiveMemberId);
  if (!meeting || !executive) throw new Error('Meeting or executive record not found for SMS.');

  const executivePost = getExecutivePost(executive);
  const groupName = group?.group_name || 'Ebadsave VSLA';
  const items: OutgoingSms[] = [];
  let noPhone = 0;

  for (const member of members) {
    if (!isValidUgandaPhone(member.phone)) { noPhone += 1; continue; }
    const [savings, loan, due] = await Promise.all([
      getMemberSavings(groupId, member.id),
      getMemberLoanBalance(groupId, member.id),
      getMemberLoanDueDate(groupId, member.id),
    ]);
    items.push({
      id: `meeting-${meetingId}-member-${member.id}`,
      to: member.phone as string,
      text: meetingSummarySms({
        groupName,
        meetingNumber: Number(meeting.meeting_number),
        meetingDate: meeting.meeting_date,
        memberName: member.full_name,
        totalSavings: savings,
        loanBalance: Number(loan.balance || 0),
        loanDueDate: due,
        executiveName: executive.full_name,
        executivePost,
      }),
      kind: 'meeting_summary',
      memberName: member.full_name,
      groupId, meetingId, memberId: member.id,
    });
  }

  const summary = await sendSmsList(items, onProgress);
  return { ...summary, recipients: items.length, noPhone };
}

/** Group announcement to every active member with a phone number. */
export async function sendGroupAnnouncement(params: {
  groupId: number;
  text: string;
  /** Reuse a batch id to retry: members already sent are skipped, failed ones are tried again. */
  batchId?: number;
  onProgress?: (done: number, total: number) => void;
}): Promise<SmsRunResult> {
  const text = params.text.trim();
  if (!text) throw new Error('Write the message first.');
  const [group, members] = await Promise.all([getGroupById(params.groupId), getMembersByGroupId(params.groupId)]);

  const batch = params.batchId ?? Date.now();
  const groupName = group?.group_name || 'Ebadsave VSLA';
  const items: OutgoingSms[] = [];
  let noPhone = 0;
  for (const member of members) {
    if (!isValidUgandaPhone(member.phone)) { noPhone += 1; continue; }
    items.push({
      id: `announce-${batch}-member-${member.id}`,
      to: member.phone as string,
      text: announcementSms(groupName, text),
      kind: 'announcement',
      memberName: member.full_name,
      groupId: params.groupId, memberId: member.id,
    });
  }
  if (items.length === 0) throw new Error('No active member has a valid phone number.');

  const summary = await sendSmsList(items, params.onProgress);
  return { ...summary, recipients: items.length, noPhone, batchId: batch };
}
