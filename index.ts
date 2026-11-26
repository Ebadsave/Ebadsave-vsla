import { requireNativeModule } from 'expo';

interface EbadsaveSmsNative {
  /** Sends one SMS through the phone's SIM. Resolves "sent" or rejects with a code. */
  sendSms(phone: string, message: string): Promise<'sent'>;
}

export default requireNativeModule<EbadsaveSmsNative>('EbadsaveSms');
