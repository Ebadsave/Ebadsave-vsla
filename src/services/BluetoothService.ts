// src/services/BluetoothService.ts
import BluetoothClassic, { BluetoothDevice } from 'react-native-bluetooth-classic';
import * as FileSystem from 'expo-file-system';

export type NearbyPhone = {
  name: string;
  address: string;
  bonded?: boolean;
};

const BluetoothService = {
  async isEnabled(): Promise<boolean> {
    try { return await BluetoothClassic.isBluetoothEnabled(); } catch { return false; }
  },
  async requestEnable(): Promise<boolean> {
    try { return await BluetoothClassic.requestBluetoothEnabled(); } catch { return false; }
  },
  async getPairedPhones(): Promise<NearbyPhone[]> {
    try {
      const devices: BluetoothDevice[] = await BluetoothClassic.getBondedDevices();
      return devices.map((d) => ({ name: d.name || 'Unknown Phone', address: d.address, bonded: true }));
    } catch { return []; }
  },
  async scanNearby(timeoutMs: number = 10000): Promise<NearbyPhone[]> {
    try {
      const paired = await this.getPairedPhones();
      const discovered: BluetoothDevice[] = await BluetoothClassic.startDiscovery();
      await new Promise((r) => setTimeout(r, timeoutMs));
      try { await BluetoothClassic.cancelDiscovery(); } catch {}
      const found: NearbyPhone[] = discovered.map((d) => ({ name: d.name || 'Unknown Phone', address: d.address, bonded: false }));
      const all = [...paired, ...found];
      return all.filter((p, i, s) => i === s.findIndex((x) => x.address === p.address));
    } catch { return await this.getPairedPhones(); }
  },
  async createTextFile(fileName: string, content: string) {
    const fileUri = FileSystem.documentDirectory + fileName;
    await FileSystem.writeAsStringAsync(fileUri, content, { encoding: FileSystem.EncodingType.UTF8 });
    return { fileName, fileUri, content };
  },
  async sendFile(address: string, file: { fileName: string; fileUri: string; content: string }): Promise<void> {
    let device: BluetoothDevice | null = null;
    try {
      device = await BluetoothClassic.connectToDevice(address, { DELIMITER: '\n', CHARACTER_DELIMITER: '\n' });
      await device.write(file.content + '\n---END---\n', 'utf-8');
    } finally {
      try { if (device) await device.disconnect(); } catch {}
    }
  },
  async disconnectAll(): Promise<void> {
    try {
      const devices = await BluetoothClassic.getConnectedDevices();
      for (const d of devices) { try { await d.disconnect(); } catch {} }
    } catch {}
  },
};

export default BluetoothService;
