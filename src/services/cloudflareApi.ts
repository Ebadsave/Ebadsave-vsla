import * as SecureStore from 'expo-secure-store';
import {
  CLOUDFLARE_API_BASE_URL,
  CLOUDFLARE_ENDPOINTS,
  CLOUDFLARE_REQUEST_TIMEOUT_MS,
  CLOUDFLARE_STORAGE_KEYS,
} from '../config/cloudflare';

export type CloudflareJson = Record<string, unknown>;

export interface RemotePassbookTransaction {
  transactionId: string;
  transactionType: string;
  amountUgx: number;
  description?: string;
  transactionDate: string;
}

export interface RemoteMemberPassbook {
  memberNumber: string;
  memberName: string;
  totalSavingsUgx: number;
  loanBalanceUgx: number;
  loanDueDate: string | null;
  updatedAt: string;
  transactions: RemotePassbookTransaction[];
}

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
    throw new CloudflareApiError(
      'Cloudflare returned an invalid response.',
      response.status,
    );
  }
}

function isObject(value: unknown): value is CloudflareJson {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getGroupIdFromAccessToken(token: string): string {
  try {
    const payloadPart = token.split('.')[1];
    if (!payloadPart) throw new Error('Missing token payload');

    const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(
      Math.ceil(normalized.length / 4) * 4,
      '=',
    );

    const claims = JSON.parse(globalThis.atob(padded)) as {
      groupId?: unknown;
    };

    if (typeof claims.groupId !== 'string' || !claims.groupId) {
      throw new Error('Missing group identity');
    }

    return claims.groupId;
  } catch {
    throw new CloudflareApiError(
      'Cloudflare returned an unreadable access token.',
      502,
      'invalid_access_token',
    );
  }
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
  const timeout = setTimeout(
    () => controller.abort(),
    CLOUDFLARE_REQUEST_TIMEOUT_MS,
  );

  const headers: Record<string, string> = {
    accept: 'application/json',
    ...options.headers,
  };

  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
  }

  let token = options.token;

  try {
    if (options.authenticated && token === undefined) {
      token = await SecureStore.getItemAsync(
        CLOUDFLARE_STORAGE_KEYS.accessToken,
      );
    }

    if (options.authenticated && !token) {
      throw new CloudflareApiError(
        'Sign in to Cloudflare before performing this operation.',
        401,
        'missing_access_token',
      );
    }

    if (token) headers.authorization = `Bearer ${token}`;

    const response = await fetch(
      `${CLOUDFLARE_API_BASE_URL}${path}`,
      {
        method: options.method ?? 'GET',
        headers,
        body:
          options.body === undefined
            ? undefined
            : JSON.stringify(options.body),
        signal: controller.signal,
      },
    );

    const payload = await readResponse(response);

    if (!response.ok) {
      const data = isObject(payload) ? payload : {};

      throw new CloudflareApiError(
        typeof data.error === 'string'
          ? data.error
          : `Cloudflare request failed (${response.status}).`,
        response.status,
        typeof data.code === 'string' ? data.code : undefined,
        payload,
      );
    }

    return payload as T;
  } catch (error) {
    if (error instanceof CloudflareApiError) throw error;

    if (error instanceof Error && error.name === 'AbortError') {
      throw new CloudflareApiError(
        'Cloudflare request timed out. Check your connection and try again.',
        408,
        'timeout',
      );
    }

    throw new CloudflareApiError(
      'Could not reach Cloudflare. Check your internet connection and try again.',
      0,
      'network_error',
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function checkCloudflareConnection(): Promise<{
  ok: boolean;
  service?: string;
}> {
  return cloudflareRequest(CLOUDFLARE_ENDPOINTS.health);
}

export async function signInMemberToCloudflare(
  memberNumber: string,
  pin: string,
): Promise<void> {
  if (!/^\d{6,12}$/.test(pin)) {
    throw new CloudflareApiError(
      'PIN must contain 6 to 12 digits.',
      400,
      'invalid_pin',
    );
  }

  const result = await cloudflareRequest<{
    ok?: boolean;
    tokenType?: string;
    accessToken?: string;
    expiresIn?: number;
  }>(CLOUDFLARE_ENDPOINTS.login, {
    method: 'POST',
    body: {
      memberNumber: memberNumber.trim().toUpperCase(),
      pin,
    },
  });

  if (!result.accessToken || result.tokenType !== 'Bearer') {
    throw new CloudflareApiError(
      'Cloudflare did not return a valid sign-in session.',
      502,
      'invalid_login_response',
      result,
    );
  }

  const groupId = getGroupIdFromAccessToken(result.accessToken);
  await saveCloudflareSession(result.accessToken, groupId);
}

export async function getMyRemotePassbook(): Promise<RemoteMemberPassbook> {
  const result = await cloudflareRequest<{
    passbook?: RemoteMemberPassbook;
  }>(CLOUDFLARE_ENDPOINTS.myPassbook, {
    authenticated: true,
  });

  if (
    !result.passbook ||
    typeof result.passbook.memberNumber !== 'string' ||
    !Array.isArray(result.passbook.transactions)
  ) {
    throw new CloudflareApiError(
      'Cloudflare returned an incomplete passbook.',
      502,
      'invalid_passbook_response',
      result,
    );
  }

  return result.passbook;
}

export async function saveCloudflareSession(
  accessToken: string,
  groupId: string,
): Promise<void> {
  if (!accessToken || !groupId) {
    throw new Error('Cloudflare session details are incomplete.');
  }

  await SecureStore.setItemAsync(
    CLOUDFLARE_STORAGE_KEYS.accessToken,
    accessToken,
  );

  await SecureStore.setItemAsync(
    CLOUDFLARE_STORAGE_KEYS.groupId,
    groupId,
  );
}

export async function getCloudflareAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(
    CLOUDFLARE_STORAGE_KEYS.accessToken,
  );
}

export async function clearCloudflareSession(): Promise<void> {
  await SecureStore.deleteItemAsync(
    CLOUDFLARE_STORAGE_KEYS.accessToken,
  );

  await SecureStore.deleteItemAsync(
    CLOUDFLARE_STORAGE_KEYS.groupId,
  );
}

export async function signOutCloudflareSession(): Promise<void> {
  const token = await getCloudflareAccessToken();

  try {
    if (token) {
      await cloudflareRequest(CLOUDFLARE_ENDPOINTS.logout, {
        method: 'POST',
        token,
      });
    }
  } finally {
    await clearCloudflareSession();
  }
}

// Remote member registration

export interface RemoteRegistrationInput {
  groupNumber: string;
  fullName: string;
  gender: string;
  age: number;
  phone?: string;
  nextOfKin?: string;
  cell: string;
  district: string;
  pin: string;
}

export interface PendingMemberRegistration {
  applicationId: string;
  groupNumber: string;
  fullName: string;
  gender: string;
  age: number;
  phone: string | null;
  nextOfKin: string | null;
  cell: string;
  district: string;
  createdAt: string;
}

export async function submitRemoteMemberRegistration(
  input: RemoteRegistrationInput,
): Promise<{
  applicationId: string;
  status: 'pending';
}> {
  if (!/^\d{6,12}$/.test(input.pin)) {
    throw new CloudflareApiError(
      'PIN must contain 6 to 12 digits.',
      400,
      'invalid_pin',
    );
  }

  const result = await cloudflareRequest<{
    ok?: boolean;
    applicationId?: string;
    status?: string;
  }>(CLOUDFLARE_ENDPOINTS.registrations, {
    method: 'POST',
    body: input,
  });

  if (
    result.ok !== true ||
    typeof result.applicationId !== 'string' ||
    result.status !== 'pending'
  ) {
    throw new CloudflareApiError(
      'Cloudflare did not confirm the pending registration.',
      502,
      'invalid_registration_response',
      result,
    );
  }

  return {
    applicationId: result.applicationId,
    status: 'pending',
  };
}

export async function getPendingMemberRegistrations(): Promise<
  PendingMemberRegistration[]
> {
  const result = await cloudflareRequest<{
    applications?: PendingMemberRegistration[];
  }>(CLOUDFLARE_ENDPOINTS.pendingRegistrations, {
    authenticated: true,
  });

  return Array.isArray(result.applications)
    ? result.applications
    : [];
}

export async function approveRemoteMemberRegistration(
  applicationId: string,
): Promise<{ memberNumber: string }> {
  const result = await cloudflareRequest<{
    ok?: boolean;
    memberNumber?: string;
  }>(
    `${CLOUDFLARE_ENDPOINTS.registrations}/${applicationId}/approve`,
    {
      method: 'POST',
      body: {},
      authenticated: true,
    },
  );

  if (
    result.ok !== true ||
    typeof result.memberNumber !== 'string'
  ) {
    throw new CloudflareApiError(
      'Cloudflare did not confirm member approval.',
      502,
      'invalid_approval_response',
      result,
    );
  }

  return { memberNumber: result.memberNumber };
}

export async function rejectRemoteMemberRegistration(
  applicationId: string,
  reason: string,
): Promise<void> {
  const result = await cloudflareRequest<{
    ok?: boolean;
    status?: string;
  }>(
    `${CLOUDFLARE_ENDPOINTS.registrations}/${applicationId}/reject`,
    {
      method: 'POST',
      body: { reason },
      authenticated: true,
    },
  );

  if (result.ok !== true || result.status !== 'rejected') {
    throw new CloudflareApiError(
      'Cloudflare did not confirm application rejection.',
      502,
      'invalid_rejection_response',
      result,
    );
  }
}
