/**
 * Maps platform-specific difficulty into an approximate Codeforces-style rating so problems from
 * different platforms can be compared. These are rough equivalences, not exact conversions.
 */
export const LEETCODE_RATING = { easy: 1200, medium: 1600, hard: 2000 };

export const MIN_RATING = 800;
export const MAX_RATING = 3500;

const clampRating = (r) => Math.round(Math.max(MIN_RATING, Math.min(MAX_RATING, r)));

/** kenkoooo difficulties go negative for easy problems; AtCoder Problems applies this correction. */
export function correctAtcoderDifficulty(d) {
  return d >= 400 ? d : 400 / Math.exp((400 - d) / 400);
}

/**
 * @param {string} platform
 * @param {string|number|null} value platform-native difficulty (CF rating, "Medium", AtCoder diff, or a number)
 * @returns {number|null} normalized rating, or null when unknown
 */
export function normalizeRating(platform, value) {
  if (value === null || value === undefined || value === '') return null;
  const p = String(platform).toLowerCase();
  const label = String(value).trim().toLowerCase();
  if (label in LEETCODE_RATING) return LEETCODE_RATING[label];
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (p === 'atcoder') return clampRating(correctAtcoderDifficulty(n));
  return clampRating(n);
}
