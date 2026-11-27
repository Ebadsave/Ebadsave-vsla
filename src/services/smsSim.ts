import { NativeModules, Platform } from 'react-native';

/**
 * Sends one SMS silently through the phone's SIM (Android only).
 *
 * Requires the native module from `react-native-direct-sms`
 * (npm install react-native-direct-sms) and a development/production build.
 * It does NOT work in Expo Go. The SEND_SMS permission is requested by
 * ensureSendPermission() in smsSender.ts before this is called.
 *
 * Errors carry a `code` that smsSender.ts stores in sms_history.error:
 *   E_NOT_SUPPORTED  - not running on Android
 *   E_MODULE_MISSING - native module not installed in this build
 *   E_NO_PERMISSION  - SEND_SMS permission refused by Android
 *   E_BAD_NUMBER     - empty phone number
 *   E_EMPTY_MESSAGE  - empty message text
 *   E_GENERIC        - any other failure (no signal, no SIM, carrier refusal)
 */

type DirectSmsModule = {
  sendDirectSms: (phoneNumber: string, message: string) => Promise<unknown>;
};

class SmsSimError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'SmsSimError';
    this.code = code;
  }
}

export async function sendSmsViaSim(phone: string, message: string): Promise<void> {
  if (Platform.OS !== 'android') {
    throw new SmsSimError('E_NOT_SUPPORTED', 'Sending through the SIM is only supported on Android.');
  }

  const to = (phone ?? '').trim();
  const text = (message ?? '').trim();
  if (!to) throw new SmsSimError('E_BAD_NUMBER', 'Phone number is missing.');
  if (!text) throw new SmsSimError('E_EMPTY_MESSAGE', 'Message text is empty.');

  const directSms = NativeModules.DirectSms as DirectSmsModule | undefined;
  if (!directSms || typeof directSms.sendDirectSms !== 'function') {
    throw new SmsSimError(
      'E_MODULE_MISSING',
      'SMS module is not installed. Install react-native-direct-sms and rebuild the app.',
    );
  }

  try {
    await directSms.sendDirectSms(to, text);
  } catch (error) {
    const detail = String((error as { message?: string })?.message ?? error ?? '');
    if (/permission/i.test(detail)) {
      throw new SmsSimError('E_NO_PERMISSION', 'SEND_SMS permission was refused.');
    }
    throw new SmsSimError('E_GENERIC', detail || 'The SMS could not be sent.');
  }
}
