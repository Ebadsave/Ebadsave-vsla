/**
 * Enforces the group's saved share limit at the database boundary.
 * This is called inside recordSavings so every screen/API path is protected.
 */
type ShareLimitDatabase = {
  getFirstAsync<T>(sql: string, ...params: (string | number | null)[]): Promise<T | null>;
};

export async function enforceMeetingShareLimit(
  db: ShareLimitDatabase,
  groupId: number,
  memberId: number,
  meetingId: number,
  newAmount: number,
): Promise<void> {
  const rules = await db.getFirstAsync<{
    share_value: number;
    maximum_shares_per_meeting: number;
  }>(
    `SELECT share_value, maximum_shares_per_meeting
     FROM vsla_setup_rules
     WHERE group_id = ?
     LIMIT 1`,
    groupId,
  );

  const shareValue = Number(rules?.share_value ?? 0);
  const maximumShares = Number(rules?.maximum_shares_per_meeting ?? 0);

  if (!Number.isFinite(shareValue) || shareValue <= 0) {
    throw new Error('The group share value is not configured. Ask the administrator to check Setup Rules.');
  }
  if (!Number.isInteger(maximumShares) || maximumShares < 1) {
    throw new Error('The maximum shares per meeting is not configured correctly. Ask the administrator to check Setup Rules.');
  }

  const sharesInThisPayment = newAmount / shareValue;
  if (Math.abs(sharesInThisPayment - Math.round(sharesInThisPayment)) > 1e-8) {
    throw new Error(`Savings must be in whole shares of ${shareValue.toLocaleString()}.`);
  }

  const current = await db.getFirstAsync<{ total: number | null }>(
    `SELECT COALESCE(SUM(amount), 0) AS total
     FROM financial_transactions
     WHERE group_id = ?
       AND member_id = ?
       AND meeting_id = ?
       AND account_type = 'savings'
       AND transaction_type = 'savings_contribution'
       AND reversed = 0`,
    groupId,
    memberId,
    meetingId,
  );

  const alreadySaved = Number(current?.total ?? 0);
  const maximumAmount = shareValue * maximumShares;
  const newTotal = alreadySaved + newAmount;

  if (newTotal > maximumAmount + 1e-8) {
    const remaining = Math.max(0, maximumAmount - alreadySaved);
    throw new Error(
      `Maximum savings for this meeting is ${maximumAmount.toLocaleString()}. ` +
      `This member has already saved ${alreadySaved.toLocaleString()} and may save only ` +
      `${remaining.toLocaleString()} more in this meeting (${maximumShares} shares maximum).`,
    );
  }
}
