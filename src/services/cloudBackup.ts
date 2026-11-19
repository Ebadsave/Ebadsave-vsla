// Ebadsave Cloud Backup - uses JWT from Member Login
export const CLOUDFLARE_WORKER_URL = 'https://ebadsave-vsla-cloudflare.info-ebadsave.workers.dev';

let jwtToken = localStorage.getItem('ebadsave_jwt') || '';

function headers(withAuth = true) {
  const h: any = { 'Content-Type': 'application/json' };
  if (withAuth && jwtToken) h['Authorization'] = `Bearer ${jwtToken}`;
  return h;
}

// Call this right after Member Number + Name + PIN unlock
export async function loginToCloud(memberNumber: string, memberName: string, pin: string) {
  const res = await fetch(`${CLOUDFLARE_WORKER_URL}/login`, {
    method: 'POST',
    headers: headers(false),
    body: JSON.stringify({ memberNumber, memberName, pin }),
  });
  const data = await res.json();
  // Worker returns { ok:true, token: "eyJ..." } or { token }
  const token = data.token || data.jwt || data.accessToken;
  if (token) {
    jwtToken = token;
    localStorage.setItem('ebadsave_jwt', token);
    return { success: true };
  }
  return { success: false, error: data.message || data.error || 'Login failed' };
}

export async function cloudBackup(groupId: string, data: any) {
  const res = await fetch(`${CLOUDFLARE_WORKER_URL}/backup`, {
    method: 'POST',
    headers: headers(true),
    body: JSON.stringify({ groupId, data }),
  });
  return await res.json();
}

export async function cloudRestore(groupId: string) {
  const res = await fetch(`${CLOUDFLARE_WORKER_URL}/backup/latest?groupId=${groupId}`, {
    headers: headers(true),
  });
  return await res.json();
}

export function isCloudLoggedIn() {
  return !!jwtToken;
}

export function cloudLogout() {
  jwtToken = '';
  localStorage.removeItem('ebadsave_jwt');
  }
