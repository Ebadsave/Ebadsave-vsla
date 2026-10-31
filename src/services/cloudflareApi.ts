import * as SecureStore from 'expo-secure-store';
import {
  CLOUDFLARE_API_BASE_URL,
  CLOUDFLARE_REQUEST_TIMEOUT_MS,
  CLOUDFLARE_STORAGE_KEYS,
} from '../config/cloudflare';

export type CloudflareJson = Record<string, unknown>;

export class CloudflareApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = 'CloudflareApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function readResponse(response: Response): Promise<unknown> {
  const raw = await response.text();
  if (!raw) return {};
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new CloudflareApiError('Cloudflare returned an invalid response.', response.status);
  }
}

function isObject(value: unknown): value is CloudflareJson {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function cloudflareRequest<T = CloudflareJson>(
  path: string,
  options: {
    method?: 'GET' | 'POST';
    body?: unknown;
    token?: string | null;
    headers?: Record<string, string>;
    authenticated?: boolean;
  } = {},
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CLOUDFLARE_REQUEST_TIMEOUT_MS);
  const headers: Record<string, string> = { accept: 'application/json', ...options.headers };
  if (options.body !== undefined) headers['content-type'] = 'application/json';

  let token = options.token;
  if (options.authenticated && token === undefined) {
    token = await SecureStore.getItemAsync(CLOUDFLARE_STORAGE_KEYS.accessToken);
  }
  if (options.authenticated && !token) {
    clearTimeout(timeout);
    throw new CloudflareApiError('Sign in to Cloudflare before performing this operation.', 401, 'missing_access_token');
  }
  if (token) headers.authorization = `Bearer ${token}`;

  try {
    const response = await fetch(`${CLOUDFLARE_API_BASE_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
    const payload = await readResponse(response);
    if (!response.ok) {
      const data = isObject(payload) ? payload : {};
      throw new CloudflareApiError(
        typeof data.error === 'string' ? data.error : `Cloudflare request failed (${response.status}).`,
        response.status,
        typeof data.code === 'string' ? data.code : undefined,
        payload,
      );
    }
    return payload as T;
  } catch (error) {
    if (error instanceof CloudflareApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new CloudflareApiError('Cloudflare request timed out. Check your connection and try again.', 408, 'timeout');
    }
    throw new CloudflareApiError('Could not reach Cloudflare. Check your internet connection and try again.', 0, 'network_error');
  } finally {
    clearTimeout(timeout);
  }
}

export async function checkCloudflareConnection(): Promise<{ ok: boolean; service?: string }> {
  return cloudflareRequest('/health');
}

export async function saveCloudflareSession(accessToken: string, groupId: string): Promise<void> {
  if (!accessToken || !groupId) throw new Error('Cloudflare session details are incomplete.');
  await SecureStore.setItemAsync(CLOUDFLARE_STORAGE_KEYS.accessToken, accessToken);
  await SecureStore.setItemAsync(CLOUDFLARE_STORAGE_KEYS.groupId, groupId);
}

export async function getCloudflareAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(CLOUDFLARE_STORAGE_KEYS.accessToken);
}

export async function clearCloudflareSession(): Promise<void> {
  await SecureStore.deleteItemAsync(CLOUDFLARE_STORAGE_KEYS.accessToken);
  await SecureStore.deleteItemAsync(CLOUDFLARE_STORAGE_KEYS.groupId);
}
