/**
 * Outbound HTTP helper used by all platform adapters:
 *  - per-host throttling (minimum gap between requests to the same host)
 *  - timeout per request
 *  - retry with exponential backoff + jitter on network errors, 429 and 5xx
 */

const lastRequestAt = new Map(); // host -> timestamp of the last request slot
const DEFAULT_GAP_MS = 500;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class HttpError extends Error {
  constructor(message, { status, url, body } = {}) {
    super(message);
    this.status = status;
    this.url = url;
    this.body = body;
  }
}

async function throttle(host, minGapMs) {
  const now = Date.now();
  const next = Math.max(now, (lastRequestAt.get(host) ?? 0) + minGapMs);
  lastRequestAt.set(host, next); // reserve our slot before awaiting, so concurrent callers queue up
  if (next > now) await sleep(next - now);
}

function isRetryable(status) {
  return status === 429 || status >= 500;
}

export async function fetchJson(url, options = {}) {
  const {
    method = 'GET',
    headers = {},
    body,
    retries = 3,
    timeoutMs = 20000,
    minGapMs = DEFAULT_GAP_MS,
    baseDelayMs = 1000,
  } = options;
  const host = new URL(url).host;
  let attempt = 0;

  for (;;) {
    await throttle(host, minGapMs);
    let status;
    try {
      const res = await fetch(url, {
        method,
        headers: { 'User-Agent': 'upSolve/1.0 (competitive programming coach)', ...headers },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
      status = res.status;
      const text = await res.text();
      if (!res.ok) {
        throw new HttpError(`HTTP ${res.status} from ${host}`, { status, url, body: text.slice(0, 500) });
      }
      try {
        return JSON.parse(text);
      } catch {
        throw new HttpError(`Invalid JSON from ${host}`, { status, url, body: text.slice(0, 200) });
      }
    } catch (err) {
      const retryable = status === undefined || isRetryable(status); // undefined → network/timeout
      if (!retryable || attempt >= retries) {
        if (err instanceof HttpError) throw err;
        throw new HttpError(`Request to ${host} failed: ${err.message}`, { status, url });
      }
      const delay = baseDelayMs * 2 ** attempt + Math.random() * 250;
      attempt += 1;
      await sleep(delay);
    }
  }
}
