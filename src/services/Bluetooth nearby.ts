import AsyncStorage from '@react-native-async-storage/async-storage';
import BluetoothService from './BluetoothService';

export async function saveMeetingOpenToDB(data: any): Promise<void> {
  try {
    const old = await AsyncStorage.getItem('ebadsave_meetings_open');
    const list = old ? JSON.parse(old) : [];
    list.push({ ...data, type: 'OPEN', createdAt: new Date().toISOString() });
    await AsyncStorage.setItem('ebadsave_meetings_open', JSON.stringify(list));
  } catch {}
}

export async function saveMeetingCloseToDB(data: any): Promise<void> {
  try {
    const old = await AsyncStorage.getItem('ebadsave_meetings_close');
    const list = old ? JSON.parse(old) : [];
    list.push({ ...data, type: 'CLOSE', createdAt: new Date().toISOString() });
    await AsyncStorage.setItem('ebadsave_meetings_close', JSON.stringify(list));
  } catch {}
}

export async function sendOpenMeetingToNearbyPhones(meetingData: any, onProgress?: any) {
  const phones = await BluetoothService.scanNearby(10000);
  if (phones.length === 0) return { sent: 0, total: 0, phones: [] };
  const file = await BluetoothService.createTextFile(`Ebadsave-OPEN-${meetingData.date}.txt`, `EBADSAVE - MEETING OPEN\nGroup: ${meetingData.groupName}\nDate: ${meetingData.date}\nTotal: ${meetingData.totalAmount}\n${meetingData.message}`);
  await saveMeetingOpenToDB(meetingData);
  let sent = 0;
  for (const phone of phones) {
    try { await BluetoothService.sendFile(phone.address, file); sent++; onProgress?.(sent, phones.length); } catch {}
  }
  await BluetoothService.disconnectAll();
  return { sent, total: phones.length, phones };
}

export async function sendCloseMeetingToNearbyPhones(meetingData: any, onProgress?: any) {
  const phones = await BluetoothService.scanNearby(10000);
  if (phones.length === 0) return { sent: 0, total: 0, phones: [] };
  const file = await BluetoothService.createTextFile(`Ebadsave-CLOSE-${meetingData.date}.txt`, `EBADSAVE - MEETING CLOSE\nGroup: ${meetingData.groupName}\nDate: ${meetingData.date}\nTotal: ${meetingData.totalAmount}\n${meetingData.message}`);
  await saveMeetingCloseToDB(meetingData);
  let sent = 0;
  for (const phone of phones) {
    try { await BluetoothService.sendFile(phone.address, file); sent++; onProgress?.(sent, phones.length); } catch {}
  }
  await BluetoothService.disconnectAll();
  return { sent, total: phones.length, phones };
      }
