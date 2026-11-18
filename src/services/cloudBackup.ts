import AsyncStorage from '@react-native-async-storage/async-storage';

// Change this after we create your Worker - for now it uses a placeholder
export const CLOUDFLARE_WORKER_URL = 'https://ebadsave-cloud-backup.YOUR-SUBDOMAIN.workers.dev';

export type BackupPayload = {
  groupCode: string;
  createdAt: string;
  data: Record<string, any>;
};

export async function collectLocalData(): Promise<Record<string, any>> {
  // These are the keys your app already uses - we grab all of them
  const keys = await AsyncStorage.getAllKeys();
  const entries = await AsyncStorage.multiGet(keys);
  const data: Record<string, any> = {};
  for (const [k, v] of entries) {
    try {
      data[k] = v ? JSON.parse(v) : null;
    } catch {
      data[k] = v;
    }
  }
  return data;
}

export async function uploadBackup(groupCode: string): Promise<{ ok: boolean; id?: string; message: string }> {
  try {
    const data = await collectLocalData();
    const payload: BackupPayload = {
      groupCode,
      createdAt: new Date().toISOString(),
      data,
    };
    const res = await fetch(`${CLOUDFLARE_WORKER_URL}/backup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, message: json.error || `Upload failed: ${res.status}` };
    return { ok: true, id: json.id, message: 'Backup uploaded to cloud' };
  } catch (e: any) {
    return { ok: false, message: e.message || 'Network error' };
  }
}

export async function listBackups(groupCode: string): Promise<any[]> {
  try {
    const res = await fetch(`${CLOUDFLARE_WORKER_URL}/backups?groupCode=${encodeURIComponent(groupCode)}`);
    const json: any = await res.json().catch(() => ({}));
    return Array.isArray(json.backups) ? json.backups : [];
  } catch {
    return [];
  }
}

export async function downloadBackup(id: string): Promise<any | null> {
  try {
    const res = await fetch(`${CLOUDFLARE_WORKER_URL}/backup/${id}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function restoreBackup(backupData: Record<string, any>): Promise<void> {
  const pairs: [string, string][] = Object.entries(backupData).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]);
  if (pairs.length > 0) await AsyncStorage.multiSet(pairs);
}
