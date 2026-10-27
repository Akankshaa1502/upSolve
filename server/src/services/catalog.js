import { Problem } from '../models/index.js';
import { getAdapter } from './adapters/index.js';

const REFRESH_EVERY_MS = 24 * 60 * 60 * 1000;
const RETRY_AFTER_FAILURE_MS = 10 * 60 * 1000;
const state = new Map(); // platform -> { at, ok, promise }

/**
 * Upserts normalized problems into the shared catalog. Platform-provided fields win for synced
 * platforms; `origin` is only set on insert so a manual problem keeps being "manual".
 * Returns Map(externalId -> _id).
 */
export async function upsertProblems(platform, problems, origin) {
  if (!problems.length) return new Map();
  const ops = problems.map((p) => {
    const set = { title: p.title };
    if (p.url) set.url = p.url;
    if (p.tags?.length) set.tags = p.tags;
    if (p.difficultyLabel) set.difficultyLabel = p.difficultyLabel;
    if (p.rating != null) set.rating = p.rating;
    return {
      updateOne: {
        filter: { platform, externalId: p.externalId },
        update: { $set: set, $setOnInsert: { origin } },
        upsert: true,
      },
    };
  });
  for (let i = 0; i < ops.length; i += 1000) {
    await Problem.bulkWrite(ops.slice(i, i + 1000), { ordered: false });
  }
  const ids = new Map();
  const externalIds = problems.map((p) => p.externalId);
  for (let i = 0; i < externalIds.length; i += 5000) {
    const docs = await Problem.find({ platform, externalId: { $in: externalIds.slice(i, i + 5000) } }, { externalId: 1 }).lean();
    for (const d of docs) ids.set(d.externalId, d._id);
  }
  return ids;
}

/**
 * Refreshes a platform's problem catalog at most once a day (best effort: failures are swallowed
 * and retried after 10 minutes). Concurrent callers share one in-flight refresh.
 */
export async function refreshCatalog(platform, { force = false } = {}) {
  const adapter = getAdapter(platform);
  if (!adapter?.fetchCatalog) return { refreshed: false, reason: 'no catalog for platform' };
  const s = state.get(platform);
  if (s?.promise) return s.promise;
  if (!force && s && Date.now() - s.at < (s.ok ? REFRESH_EVERY_MS : RETRY_AFTER_FAILURE_MS)) {
    return { refreshed: false, reason: 'fresh' };
  }
  const promise = (async () => {
    try {
      const problems = await adapter.fetchCatalog();
      await upsertProblems(platform, problems, 'catalog');
      state.set(platform, { at: Date.now(), ok: true });
      return { refreshed: true, count: problems.length };
    } catch (err) {
      state.set(platform, { at: Date.now(), ok: false });
      return { refreshed: false, reason: err.message };
    }
  })();
  state.set(platform, { ...s, promise });
  return promise;
}

export function resetCatalogStateForTests() {
  state.clear();
}
