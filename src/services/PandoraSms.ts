// Pandora SMS - Converted from PHP to React Native
// Original PHP: sms.thepandoranetworks.com/API/send_info_sms/

// Use ENV - DO NOT hardcode real password in GitHub
const PANDORA_USERNAME = process.env.EXPO_PUBLIC_PANDORA_USERNAME || 'pandoratest';
const PANDORA_PASSWORD = process.env.EXPO_PUBLIC_PANDORA_PASSWORD || 'api_test';
const PANDORA_SENDER = process.env.EXPO_PUBLIC_PANDORA_SENDER || 'Pandora';

// Account owner
export const ACCOUNT_OWNER = {
  name: 'Twebaze Edwin',
  phone: '0773997315',
  email: 'info.ebadsave@gmail.com',
};

/**
 * Direct conversion of PHP: send_info_sms($username,$password,$sender,$number,$message)
 */
export async function send_info_sms(
  number: string,
  message: string,
  username: string = PANDORA_USERNAME,
  password: string = PANDORA_PASSWORD,
  sender: string = PANDORA_SENDER
): Promise<any> {
  try {
    // Clean number: 0773997315 -> 256773997315
    let cleanNumber = number.replace(/\s+/g, '');
    if (cleanNumber.startsWith('0')) {
      cleanNumber = '256' + cleanNumber.slice(1);
    }

    // Build URL exactly like PHP: https://sms.thepandoranetworks.com/API/send_info_sms/?number=...&message=...&username=...&password=...&sender=...
    const params = new URLSearchParams({
      number: cleanNumber,
      message: message,
      username: username,
      password: password,
      sender: sender,
    });

    const live_url = `https://sms.thepandoranetworks.com/API/send_info_sms/?${params.toString()}`;
    console.log('[Pandora SMS] Sending to', cleanNumber);

    const response = await fetch(live_url);
    const text = await response.text();
    console.log('[Pandora SMS] Response:', text);

    try {
      return JSON.parse(text);
    } catch {
      return { raw: text, success: response.ok };
    }
  } catch (error) {
    console.log('[Pandora SMS] Failed', error);
    return { success: false, error: String(error) };
  }
}

// --- Easy helpers for Ebadsave ---

export async function sendLoanSms(toPhone: string, memberName: string, amount: number, dueDate: string) {
  const msg = `Dear ${memberName}, Ebadsave VSLA: Your loan UGX ${amount.toLocaleString()} is due ${dueDate}. Please pay to avoid accumulation. Thank you. - Twebaze Edwin`;
  return send_info_sms(toPhone, msg);
}

export async function sendMeetingSms(toPhone: string, message: string) {
  return send_info_sms(toPhone, `Ebadsave VSLA: ${message}`);
}

export async function sendWelcomeSms(toPhone: string, memberName: string) {
  return send_info_sms(toPhone, `Hello ${memberName}, Welcome to Ebadsave VSLA. Your account is active. - Twebaze Edwin`);
    }
