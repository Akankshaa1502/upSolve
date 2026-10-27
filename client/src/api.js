/**
 * Thin fetch wrapper around the upsolve API. Every response is { ok, data } or { ok:false, error };
 * failures are thrown as ApiError so pages can show error.message.
 */
const BASE = import.meta.env.VITE_API_URL || '';
const TOKEN_KEY = 'upsolve.token';

export class ApiError extends Error {
  constructor(message, { status, code, details } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const tokenStore = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (t) => {
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* storage unavailable: session-only login */
    }
  },
};

let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

/** Minutes east of UTC, so the server's "today" matches the user's. */
export const tz = -new Date().getTimezoneOffset();

export async function api(path, { method = 'GET', body, query } = {}) {
  const qs = query ? `?${new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== ''))}` : '';
  const headers = { Accept: 'application/json' };
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(`${BASE}/api${path}${qs}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError('Cannot reach the server. Is the API running?', { code: 'NETWORK' });
  }
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    if (res.status === 401 && token) onUnauthorized();
    const err = json?.error;
    throw new ApiError(err?.message || `Request failed (${res.status})`, { status: res.status, code: err?.code, details: err?.details });
  }
  return json.data;
}

/** Turns validation details into "field: message" lines for forms. */
export function describeError(err) {
  if (err?.details?.length) {
    return err.details.map((d) => (d.path ? `${d.path}: ${d.message}` : d.message)).join(' · ');
  }
  return err?.message || 'Something went wrong';
}
