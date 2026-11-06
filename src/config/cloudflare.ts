/** Central Cloudflare Worker configuration for the Ebadsave mobile app. */
export const CLOUDFLARE_API_BASE_URL =
  'https://ebadsave-vsla-cloudflare.info-ebadsave.workers.dev';

export const CLOUDFLARE_ENDPOINTS = {
  health: '/health',
  login: '/v1/auth/login',
  logout: '/v1/auth/logout',
  bootstrapAdmin: '/v1/auth/bootstrap-admin',
  users: '/v1/auth/users',
  registrations: '/v1/registrations',
  pendingRegistrations: '/v1/registrations/pending',
  myPassbook: '/v1/passbook/me',
  syncPassbook: '/v1/passbook/sync',
  backups: '/v1/backups',
} as const;

export const CLOUDFLARE_STORAGE_KEYS = {
  accessToken: 'ebadsave_cloudflare_access_token',
  groupId: 'ebadsave_cloudflare_group_id',
} as const;

export const CLOUDFLARE_REQUEST_TIMEOUT_MS = 20_000;
