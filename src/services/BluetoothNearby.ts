import AsyncStorage from '@react-native-async-storage/async-storage';
import BluetoothService from './BluetoothService';

export const SUPPORT_CONTACT = '+256773997315';

// 3. GROUP NAME FROM CONSTITUTION
export async function getGroupNameFromConstitution(): Promise<string> {
  try {
    const keys = ['ebadsave_constitution', 'ebadsave_group_profile', 'constitution', 'group_profile'];
    for (const key of keys) {
      const raw = await AsyncStorage.getItem(key);
      if (!raw) continue;
      const c = JSON.parse(raw);
      if (c.groupName) return c.groupName;
      if (c.name) return c.name;
      if (c.group_name) return c.group_name;
    }
    return '';
  } catch { return ''; }
}

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
  const constitutionName = await getGroupNameFromConstitution();
  const realGroupName = constitutionName || meetingData.groupName || 'Ebadsave Group';
  const finalData = { ...meetingData, groupName: realGroupName };
  const phones = await BluetoothService.scanNearby(10000);
  if (phones.length === 0) {
    await saveMeetingOpenToDB(finalData);
    return { sent: 0, total: 0, phones: [] };
  }
  const file = await BluetoothService.createTextFile(`${realGroupName}-OPEN-${meetingData.date}.txt`, `${realGroupName.toUpperCase()} - MEETING OPEN\nGroup: ${realGroupName}\nDate: ${meetingData.date}\nTotal: ${meetingData.totalAmount}\n${meetingData.message}\n\n---\nFor Support Contact: ${SUPPORT_CONTACT}\nWhatsApp: ${SUPPORT_CONTACT}`);
  await saveMeetingOpenToDB(finalData);
  let sent = 0;
  for (const phone of phones) {
    try { await BluetoothService.sendFile(phone.address, file); sent++; onProgress?.(sent, phones.length); } catch {}
  }
  await BluetoothService.disconnectAll();
  return { sent, total: phones.length, phones };
}

export async function sendCloseMeetingToNearbyPhones(meetingData: any, onProgress?: any) {
  const constitutionName = await getGroupNameFromConstitution();
  const realGroupName = constitutionName || meetingData.groupName || 'Ebadsave Group';
  const finalData = { ...meetingData, groupName: realGroupName };
  const phones = await BluetoothService.scanNearby(10000);
  if (phones.length === 0) {
    await saveMeetingCloseToDB(finalData);
    return { sent: 0, total: 0, phones: [] };
  }
  const file = await BluetoothService.createTextFile(`${realGroupName}-CLOSE-${meetingData.date}.txt`, `${realGroupName.toUpperCase()} - MEETING CLOSE\nGroup: ${realGroupName}\nDate: ${meetingData.date}\nTotal: ${meetingData.totalAmount}\n${meetingData.message}\n\n---\nFor Support Contact: ${SUPPORT_CONTACT}\nWhatsApp: ${SUPPORT_CONTACT}`);
  await saveMeetingCloseToDB(finalData);
  let sent = 0;
  for (const phone of phones) {
    try { await BluetoothService.sendFile(phone.address, file); sent++; onProgress?.(sent, phones.length); } catch {}
  }
  await BluetoothService.disconnectAll();
  return { sent, total: phones.length, phones };
}

// 1. AUTO - USE THESE IN YOUR APP, NO BUTTON NEEDED
export async function autoOpenMeeting(meetingData: any): Promise<void> {
  // Runs in background, does not block your screen
  sendOpenMeetingToNearbyPhones(meetingData).catch(() => {});
}

export async function autoCloseMeeting(meetingData: any): Promise<void> {
  // Runs in background, does not block your screen
  sendCloseMeetingToNearbyPhones(meetingData).catch(() => {});
  }
