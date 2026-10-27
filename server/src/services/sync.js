import { Attempt, PlatformAccount } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { getAdapter, AdapterError } from './adapters/index.js';
import { upsertProblems, refreshCatalog } from './catalog.js';
import { scheduleReview } from './reviews.js';
import { DAY_MS } from '../lib/dates.js';

const LOCK_TIMEOUT_MS = 5 * 60 * 1000;
// Unsolved synced problems older than this are history, not something to revisit.
const REVIEW_LOOKBACK_DAYS = 60;

/**
 * Imports a platform account's activity. Idempotent: problems upsert on (platform, externalId),
 * synced attempts upsert on (user, problem, source=synced), reviews on (user, problem).
 * Running it twice in a row changes nothing the second time.
 */
export async function syncAccount(accountId, userId, now = new Date()) {
  // Atomic lock so double-clicking "Sync" can't run two imports at once.
  const account = await PlatformAccount.findOneAndUpdate(
    {
      _id: accountId,
      user: userId,
      $or: [{ status: { $ne: 'syncing' } }, { syncStartedAt: { $lt: new Date(now.getTime() - LOCK_TIMEOUT_MS) } }],
    },
    { $set: { status: 'syncing', syncStartedAt: now } },
    { new: true },
  );
  if (!account) {
    const exists = await PlatformAccount.exists({ _id: accountId, user: userId });
    throw exists ? ApiError.conflict('A sync is already running for this account') : ApiError.notFound('Account not found');
  }

  const adapter = getAdapter(account.platform);
  try {
    const activity = await adapter.fetchActivity(account.handle);
    const problemIds = await upsertProblems(account.platform, activity.problems, 'synced');

    const ops = [];
    for (const a of activity.attempts) {
      const problem = problemIds.get(a.externalId);
      if (!problem) continue;
      const filter = { user: userId, problem, source: 'synced' };
      const fields = { platform: account.platform, status: a.status, wrongSubmissions: a.wrongSubmissions, submissionCount: a.submissionCount };
      // Partial-history platforms (LeetCode) only show recent solves; keep the earliest date we ever saw.
      const update = adapter.partialHistory
        ? { $set: fields, $min: { date: a.date } }
        : { $set: { ...fields, date: a.date } };
      ops.push({ updateOne: { filter, update, upsert: true } });
    }
    let newAttempts = 0;
    for (let i = 0; i < ops.length; i += 1000) {
      const res = await Attempt.bulkWrite(ops.slice(i, i + 1000), { ordered: false });
      newAttempts += res.upsertedCount;
    }

    const cutoff = now.getTime() - REVIEW_LOOKBACK_DAYS * DAY_MS;
    for (const a of activity.attempts) {
      if (a.status !== 'attempted' || new Date(a.date).getTime() < cutoff) continue;
      const problemId = problemIds.get(a.externalId);
      if (problemId) await scheduleReview({ userId, problemId, reason: 'attempted', from: a.date });
    }

    // Keep the recommendation pool fresh (no-op if refreshed in the last 24h; failures ignored).
    if (adapter.fetchCatalog) await refreshCatalog(account.platform);

    const solved = activity.attempts.filter((a) => a.status === 'solved').length;
    account.set({
      status: 'ok',
      lastSyncedAt: new Date(),
      lastSyncError: undefined,
      lastSyncStats: { problems: activity.attempts.length, solved, attempted: activity.attempts.length - solved, newAttempts },
    });
    await account.save();
    return account;
  } catch (err) {
    const unavailable = err instanceof AdapterError && err.code === 'UNAVAILABLE';
    account.set({
      status: unavailable ? 'unavailable' : 'error',
      lastSyncError: err instanceof AdapterError ? err.message : 'Unexpected error while syncing',
    });
    await account.save();
    if (err instanceof AdapterError) {
      if (err.code === 'NOT_FOUND') throw ApiError.badRequest(err.message);
      throw ApiError.upstream(`${adapter.displayName} sync unavailable`, { reason: err.message, account: account.toJSON() });
    }
    throw err;
  }
}
