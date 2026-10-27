/**
 * Platform adapters. Each one exposes the same interface:
 *   platform, displayName, partialHistory
 *   validateHandle(handle) → boolean
 *   verifyHandle(handle)   → { handle, ... }           throws AdapterError
 *   fetchActivity(handle)  → { problems[], attempts[] } throws AdapterError
 *   fetchCatalog?()        → problems[]                 (optional, used for recommendations)
 * Problems are normalized to { externalId, title, url, tags, difficultyLabel, rating }.
 * Attempts are normalized to { externalId, status, date, wrongSubmissions, submissionCount }.
 */
import { codeforces } from './codeforces.js';
import { leetcode } from './leetcode.js';
import { atcoder } from './atcoder.js';

const adapters = { codeforces, leetcode, atcoder };

export function getAdapter(platform) {
  return adapters[platform];
}

/** Tests swap adapters for fakes so they never hit the network. */
export function setAdapterForTests(platform, adapter) {
  adapters[platform] = adapter;
}

export { AdapterError } from './AdapterError.js';
