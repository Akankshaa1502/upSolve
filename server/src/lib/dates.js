/**
 * Day arithmetic in the user's local time. `offsetMin` = minutes to add to UTC to get local time
 * (IST = +330). The browser sends it as -new Date().getTimezoneOffset().
 */
export const DAY_MS = 24 * 60 * 60 * 1000;

export function clampOffset(offsetMin) {
  const n = Number(offsetMin);
  return Number.isFinite(n) ? Math.max(-14 * 60, Math.min(14 * 60, Math.round(n))) : 0;
}

/** 'YYYY-MM-DD' of the local calendar day containing `date`. */
export function dayKey(date, offsetMin = 0) {
  return new Date(new Date(date).getTime() + offsetMin * 60000).toISOString().slice(0, 10);
}

/** Last millisecond of the local day containing `now`, as a real (UTC) Date. */
export function endOfLocalDay(now, offsetMin = 0) {
  const localStart = Date.parse(`${dayKey(now, offsetMin)}T00:00:00.000Z`);
  return new Date(localStart + DAY_MS - 1 - offsetMin * 60000);
}

export function addDays(date, days) {
  return new Date(new Date(date).getTime() + days * DAY_MS);
}

export function daysBetween(a, b) {
  return (new Date(b).getTime() - new Date(a).getTime()) / DAY_MS;
}

/** Previous calendar day for a 'YYYY-MM-DD' key. */
export function prevDayKey(key) {
  return new Date(Date.parse(`${key}T00:00:00.000Z`) - DAY_MS).toISOString().slice(0, 10);
}
