import { API_URL } from './config';

let accessToken: string | null = null;
let refreshToken: string | null = null;

export function setTokens(access: string | null, refresh: string | null) {
  accessToken = access;
  refreshToken = refresh;
  if (typeof window !== 'undefined') {
    if (refresh) sessionStorage.setItem('antioch_refresh', refresh);
    else sessionStorage.removeItem('antioch_refresh');
  }
}

export function getAccessToken() {
  return accessToken;
}

export function getRefreshToken() {
  if (refreshToken) return refreshToken;
  if (typeof window !== 'undefined') {
    const stored = sessionStorage.getItem('antioch_refresh');
    if (stored) refreshToken = stored;
  }
  return refreshToken;
}

export function clearTokens() {
  accessToken = null;
  refreshToken = null;
  if (typeof window !== 'undefined') sessionStorage.removeItem('antioch_refresh');
}

async function refreshAccessToken(): Promise<boolean> {
  const rt = getRefreshToken();
  if (!rt) return false;
  try {
    const res = await fetch(`${API_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: rt }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { accessToken: string; refreshToken: string };
    setTokens(data.accessToken, data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', headers.get('Content-Type') ?? 'application/json');
  const at = getAccessToken();
  if (at) headers.set('Authorization', `Bearer ${at}`);

  const res = await fetch(`${API_URL}/api/v1${path}`, { ...options, headers });

  if (res.status === 401 && retry) {
    const ok = await refreshAccessToken();
    if (ok) return apiFetch<T>(path, options, false);
  }

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    let code: string | undefined;
    try {
      const body = await res.json();
      message = body.error ?? body.message ?? message;
      code = body.code;
    } catch {
      /* ignore */
    }
    const err = new Error(message) as Error & { status?: number; code?: string };
    err.status = res.status;
    err.code = code;
    throw err;
  }

  if (res.status === 204) return undefined as T;
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('text/csv')) return (await res.text()) as unknown as T;
  return (await res.json()) as T;
}