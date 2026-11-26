import * as SMS from 'expo-sms';

export async function sendSmsViaSim(phone: string, message: string) {
  const isAvailable = await SMS.isAvailableAsync();
  if (!isAvailable) {
    throw new Error('SMS not available');
  }
  const result = await SMS.sendSMSAsync([phone], message);
  return result;
}

export async function sendBulkSmsViaSim(phones: string[], message: string) {
  for (let i = 0; i < phones.length; i++) {
    await sendSmsViaSim(phones[i], message);
    await new Promise((r) => setTimeout(r, 1000));
  }
  return { success: true };
}

export default sendSmsViaSim;
