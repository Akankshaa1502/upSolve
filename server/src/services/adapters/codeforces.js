/**
 * Codeforces adapter — official API (https://codeforces.com/apiHelp).
 * The API allows roughly 1 request / 2 seconds, so all calls share a 2.1s per-host gap.
 */
import { fetchJson, HttpError } from '../../utils/http.js';
import { TtlCache } from '../../utils/cache.js';
import { normalizeTags } from '../../lib/tags.js';
import { normalizeRating } from '../../lib/difficulty.js';
import { AdapterError } from './AdapterError.js';

const BASE = 'https://codeforces.com/api';
const MIN_GAP_MS = 2100;
const HANDLE_RE = /^[A-Za-z0-9_.-]{3,24}$/;
const cache = new TtlCache({ ttlMs: 5 * 60 * 1000 });

async function call(method, params, ttlMs) {
  const qs = new URLSearchParams(params).toString();
  const url = `${BASE}/${method}${qs ? `?${qs}` : ''}`;
  return cache.wrap(
    url,
    async () => {
      let data;
      try {
        data = await fetchJson(url, { minGapMs: MIN_GAP_MS, timeoutMs: 60000 });
      } catch (err) {
        // CF reports bad handles as HTTP 400 with {status: FAILED, comment}.
        if (err instanceof HttpError && err.status === 400 && /not found/i.test(err.body || '')) {
          throw new AdapterError('NOT_FOUND', 'Codeforces handle not found');
        }
        throw new AdapterError('UNAVAILABLE', `Codeforces API unavailable: ${err.message}`);
      }
      if (data?.status !== 'OK') {
        if (/not found/i.test(data?.comment || '')) throw new AdapterError('NOT_FOUND', 'Codeforces handle not found');
        throw new AdapterError('UNAVAILABLE', `Codeforces API error: ${data?.comment || 'unknown'}`);
      }
      return data.result;
    },
    ttlMs,
  );
}

function toProblem(p) {
  const externalId = `${p.contestId}${p.index}`;
  const gym = p.contestId >= 100000;
  return {
    externalId,
    title: `${externalId}. ${p.name}`,
    url: `https://codeforces.com/${gym ? 'gym' : 'contest'}/${p.contestId}/problem/${p.index}`,
    tags: normalizeTags(p.tags),
    difficultyLabel: p.rating ? String(p.rating) : undefined,
    rating: normalizeRating('codeforces', p.rating ?? null),
  };
}

// Verdicts that say nothing about whether the solution was right.
const NEUTRAL_VERDICTS = new Set(['COMPILATION_ERROR', 'TESTING', 'SKIPPED', 'REJECTED']);

export const codeforces = {
  platform: 'codeforces',
  displayName: 'Codeforces',
  partialHistory: false,

  validateHandle(handle) {
    return HANDLE_RE.test(handle);
  },

  async verifyHandle(handle) {
    if (!this.validateHandle(handle)) throw new AdapterError('INVALID', 'Invalid Codeforces handle');
    const [info] = await call('user.info', { handles: handle });
    return { handle: info.handle, rating: info.rating ?? null };
  },

  /** Every submission → one aggregated record per problem. */
  async fetchActivity(handle) {
    const submissions = await call('user.status', { handle }, 60 * 1000);
    const byProblem = new Map();
    // Oldest first so "wrong before first AC" is easy to count.
    for (const s of [...submissions].sort((a, b) => a.creationTimeSeconds - b.creationTimeSeconds)) {
      if (!s.problem?.contestId || !s.problem.index) continue;
      if (NEUTRAL_VERDICTS.has(s.verdict)) continue;
      const problem = toProblem(s.problem);
      let agg = byProblem.get(problem.externalId);
      if (!agg) {
        agg = { problem, solvedAt: null, lastAt: null, wrong: 0, count: 0 };
        byProblem.set(problem.externalId, agg);
      }
      const at = new Date(s.creationTimeSeconds * 1000);
      agg.count++;
      agg.lastAt = at;
      if (s.verdict === 'OK') {
        if (!agg.solvedAt) agg.solvedAt = at;
      } else if (!agg.solvedAt) {
        agg.wrong++;
      }
    }
    const aggs = [...byProblem.values()];
    return {
      problems: aggs.map((a) => a.problem),
      attempts: aggs.map((a) => ({
        externalId: a.problem.externalId,
        status: a.solvedAt ? 'solved' : 'attempted',
        date: a.solvedAt ?? a.lastAt,
        wrongSubmissions: a.wrong,
        submissionCount: a.count,
      })),
    };
  },

  /** Full problemset with tags and ratings — the recommendation candidate pool. */
  async fetchCatalog() {
    const result = await call('problemset.problems', {}, 6 * 60 * 60 * 1000);
    return result.problems.filter((p) => p.contestId && p.index).map(toProblem);
  },
};
