// Pandora SMS Service - Ebadsave VSLA
// Credentials are loaded from ENV, NOT hardcoded in GitHub

const PANDORA_API_URL = 'https://api.pandorasms.com/v1/send'; // Confirm from Pandora dashboard
const PANDORA_USERNAME = process.env.EXPO_PUBLIC_PANDORA_USERNAME || '';
const PANDORA_PASSWORD = process.env.EXPO_PUBLIC_PANDORA_PASSWORD || '';
const PANDORA_SENDER_ID = process.env.EXPO_PUBLIC_PANDORA_SENDER_ID || 'EBADSAVE';

// Account owner - for display only, not for auth
export const ACCOUNT_OWNER = {
  name: 'Twebaze Edwin',
  phone: '0773997315',
  email: 'info.ebadsave@gmail.com',
};

export async function sendPandoraSms(toPhone: string, message: string): Promise<boolean> {
  try {
    // Clean phone: 0773997315 -> 256773997315
    let cleanPhone = toPhone.replace(/\s+/g, '');
    if (cleanPhone.startsWith('0')) {
      cleanPhone = '256' + cleanPhone.slice(1);
    }

    const response = await fetch(PANDORA_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + btoa(`${PANDORA_USERNAME}:${PANDORA_PASSWORD}`),
      },
      body: JSON.stringify({
        to: cleanPhone,
        from: PANDORA_SENDER_ID,
        message: message,
      }),
    });

    const data = await response.json();
    console.log('[Pandora SMS] Sent to', cleanPhone, data);
    return response.ok;
  } catch (error) {
    console.log('[Pandora SMS] Failed', error);
    return false;
  }
}

// Helper for VSLA messages
export async function sendLoanSms(toPhone: string, memberName: string, amount: number, dueDate: string) {
  const msg = `Dear ${memberName}, Ebadsave VSLA: Your loan UGX ${amount.toLocaleString()} is due ${dueDate}. Please pay to avoid accumulation. Thank you. - Twebaze Edwin`;
  return sendPandoraSms(toPhone, msg);
}

export async function sendMeetingSms(toPhone: string, message: string) {
  return sendPandoraSms(toPhone, `Ebadsave VSLA: ${message}`);
}
