// Ebadsave - Bluetooth Nearby AUTO - Opening + Closing
// Support: +256773997315

import BluetoothService from './BluetoothService';

// 1. FORCE BLUETOOTH ON
export const ensureBluetooth = async (): Promise<boolean> => {
  const isOn = await BluetoothService.isEnabled();
  if (isOn) return true;

  const accepted = await BluetoothService.requestEnable();
  if (!accepted) {
    throw new Error("Unable Bluetooth. Meeting cannot open.");
  }
  return true;
};

// 2. SEND TO ALL NEARBY PHONES - AUTO
// Works for Kabiriti + Smartphones - sends .txt file via Bluetooth
export const sendToNearbyPhonesAuto = async (fileName: string, message: string) => {
  const phones = await BluetoothService.scanNearby(10000);
  const file = await BluetoothService.createTextFile(fileName, message);

  let sent = 0;
  for (const phone of phones) {
    try {
      await BluetoothService.sendFile(phone.address, file);
      sent++;
    } catch (e) {
      // Skip - phone off or declined
    }
  }
  return { sent, total: phones.length };
};

// 3. OPENING - AUTO
export const openMeetingAuto = async () => {
  await ensureBluetooth();

  const msg = `EBADSAVE VSLA - MEETING OPENED
Welcome to today's meeting.
Meeting is now open. Thank you.
We are served by Ebadsave VSLA App.
Support: +256773997315`;

  await sendToNearbyPhonesAuto("Ebadsave-Meeting-Open.txt", msg);
  await saveMeetingOpenToDB();
};

// 4. CLOSING - AUTO
export const closeMeetingAuto = async (today: any) => {
  await ensureBluetooth();

  const msg = `EBADSAVE VSLA - MEETING CLOSED
Thank you for attending.
Today Collected: UGX ${today.collected}
Total Savings: UGX ${today.savings}
Total Loans Borrowed Today: UGX ${today.loansBorrowed}
Total Loan Repayments Today: UGX ${today.repayments}
Total Fines Today: UGX ${today.fines}
Amount Kept in Box: UGX ${today.boxAmount}

We are served by Ebadsave VSLA App.
Support: +256773997315`;

  await sendToNearbyPhonesAuto("Ebadsave-Meeting-Close.txt", msg);
  await saveMeetingCloseToDB();
};

// 5. CHECK AMOUNT - NUMBER 5
// You said check number 5 - This is Check Amount before Closing
export const checkAmount = (cashCounted: number, data: any) => {
  const expected = data.openingBox + data.savings + data.repayments + data.fines - data.loansGiven;
  const difference = cashCounted - expected;
  return { expected, difference, isOk: difference === 0 };
};

// FULL FLOW
export const fullMeetingFlow = async () => {
  // OPEN - 1 tap
  await openMeetingAuto(); // Bluetooth auto + Open message auto

  // ... Meeting goes on ...

  // CLOSE - 1 tap
  // const check = checkAmount(cashCounted, todayData);
  // if (!check.isOk) return showError(check.difference);
  // await autoBackup(todayData);
  // await closeMeetingAuto(todayData); // Bluetooth auto + Close message auto
};
