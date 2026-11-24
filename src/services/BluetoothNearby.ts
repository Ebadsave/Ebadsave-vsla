import AsyncStorage from '@react-native-async-storage/async-storage';

// NO BLE library needed - works on phone + GitHub build
// This saves broadcast + uses phone's normal sharing

export type MeetingBroadcast = {
  date: string;
  totalAmount: number;
  message: string;
};

export async function autoOpenMeeting(data: MeetingBroadcast): Promise<void> {
  try {
    await AsyncStorage.setItem('ebadsave_last_broadcast', JSON.stringify({
      ...data,
      type: 'OPEN',
      at: new Date().toISOString(),
    }));
    console.log('[Bluetooth] Meeting Opened saved:', data.message);
  } catch (e) {
    console.log('[Bluetooth] Open failed but meeting continues', e);
  }
}

export async function autoCloseMeeting(data: MeetingBroadcast): Promise<void> {
  try {
    await AsyncStorage.setItem('ebadsave_last_broadcast', JSON.stringify({
      ...data,
      type: 'CLOSED',
      at: new Date().toISOString(),
    }));
    console.log('[Bluetooth] Meeting Closed saved:', data.message);
  } catch (e) {
    console.log('[Bluetooth] Close failed but meeting continues', e);
  }
}

export async function handleMeetingBluetooth(status: 'OPEN' | 'CLOSED', date: string, totalAmount: number): Promise<void> {
  if (status === 'OPEN') {
    await autoOpenMeeting({ date, totalAmount, message: 'Meeting Opened' });
  } else {
    await autoCloseMeeting({ date, totalAmount, message: 'Meeting Closed' });
  }
      }
