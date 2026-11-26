// All SMS wording lives here so it is easy to change.

const money = (value: number) => `UGX ${Math.round(Number(value) || 0).toLocaleString('en-US')}`;

const shortDate = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : String(iso).slice(0, 10);
};

export interface MeetingSmsData {
  groupName: string;
  meetingNumber: number;
  meetingDate: string;
  memberName: string;
  totalSavings: number;
  loanBalance: number;
  loanDueDate: string | null;
  executiveName: string;
  executivePost: string;
}

/** Individual end-of-meeting statement sent to each member. */
export function meetingSummarySms(d: MeetingSmsData): string {
  const loan = d.loanBalance > 0
    ? `Loan balance ${money(d.loanBalance)}${d.loanDueDate ? `, due ${shortDate(d.loanDueDate)}` : ''}.`
    : 'No loan balance.';
  return (
    `${d.groupName} - Meeting ${d.meetingNumber} (${shortDate(d.meetingDate)}). ` +
    `Dear ${d.memberName}, your total savings: ${money(d.totalSavings)}. ${loan} ` +
    `Signed: ${d.executiveName}, ${d.executivePost}.`
  );
}

/** Group announcement, e.g. "Kampala Women Group: Meeting tomorrow at 5pm". */
export function announcementSms(groupName: string, text: string): string {
  return `${groupName}: ${text.trim()}`;
}
