/**
 * AtCoder adapter — BEST EFFORT via the community-run AtCoder Problems API by kenkoooo
 * (https://github.com/kenkoooo/AtCoderProblems/blob/master/doc/api.md).
 * Their guidelines ask for ≥1s between requests; submissions come in pages of 500.
 * AtCoder problems have no topic tags, so they count toward totals/heatmap but not topic analysis.
 */
import { fetchJson } from '../../utils/http.js';
import { TtlCache } from '../../utils/cache.js';
import { normalizeRating } from '../../lib/difficulty.js';
import { AdapterError } from './AdapterError.js';

const BASE = 'https://kenkoooo.com/atcoder';
const MIN_GAP_MS = 1100;
const MAX_PAGES = 40; // 20k submissions is plenty; prevents runaway loops
const HANDLE_RE = /^[A-Za-z0-9_]{3,16}$/;
const resourceCache = new TtlCache({ ttlMs: 24 * 60 * 60 * 1000 });

async function get(path, retries = 3) {
  try {
    return await fetchJson(`${BASE}${path}`, { minGapMs: MIN_GAP_MS, retries, timeoutMs: 60000, headers: { 'Accept-Encoding': 'gzip' } });
  } catch (err) {
    throw new AdapterError('UNAVAILABLE', `AtCoder sync unavailable (${err.message})`);
  }
}

async function loadProblemInfo() {
  return resourceCache.wrap('problems', async () => {
    const [problems, models] = await Promise.all([
      get('/resources/problems.json'),
      get('/resources/problem-models.json').catch(() => ({})), // difficulty is optional
    ]);
    const map = new Map();
    for (const p of problems) map.set(p.id, { ...p, difficulty: models?.[p.id]?.difficulty ?? null });
    return map;
  });
}

export const atcoder = {
  platform: 'atcoder',
  displayName: 'AtCoder',
  partialHistory: false,

  validateHandle(handle) {
    return HANDLE_RE.test(handle);
  },

  /** kenkoooo has no profile endpoint, so we can only check the format (a typo shows up as 0 imports). */
  async verifyHandle(handle) {
    if (!this.validateHandle(handle)) throw new AdapterError('INVALID', 'Invalid AtCoder username');
    return { handle };
  },

  async fetchActivity(handle) {
    const submissions = [];
    let fromSecond = 0;
    for (let page = 0; page < MAX_PAGES; page++) {
      const batch = await get(`/atcoder-api/v3/user/submissions?user=${encodeURIComponent(handle)}&from_second=${fromSecond}`);
      if (!Array.isArray(batch)) throw new AdapterError('UNAVAILABLE', 'AtCoder sync unavailable (unexpected response)');
      submissions.push(...batch);
      if (batch.length < 500) break;
      fromSecond = Math.max(...batch.map((s) => s.epoch_second)) + 1;
    }
    const info = submissions.length ? await loadProblemInfo() : new Map();

    const byProblem = new Map();
    for (const s of submissions.sort((a, b) => a.epoch_second - b.epoch_second)) {
      if (s.result === 'CE' || s.result === 'WJ') continue;
      let agg = byProblem.get(s.problem_id);
      if (!agg) byProblem.set(s.problem_id, (agg = { contestId: s.contest_id, solvedAt: null, lastAt: null, wrong: 0, count: 0 }));
      const at = new Date(s.epoch_second * 1000);
      agg.count++;
      agg.lastAt = at;
      if (s.result === 'AC') agg.solvedAt ??= at;
      else if (!agg.solvedAt) agg.wrong++;
    }

    const problems = [];
    const attempts = [];
    for (const [id, agg] of byProblem) {
      const p = info.get(id);
      problems.push({
        externalId: id,
        title: p?.title || id,
        url: `https://atcoder.jp/contests/${agg.contestId}/tasks/${id}`,
        tags: [],
        difficultyLabel: p?.difficulty != null ? String(Math.round(p.difficulty)) : undefined,
        rating: normalizeRating('atcoder', p?.difficulty ?? null),
      });
      attempts.push({
        externalId: id,
        status: agg.solvedAt ? 'solved' : 'attempted',
        date: agg.solvedAt ?? agg.lastAt,
        wrongSubmissions: agg.wrong,
        submissionCount: agg.count,
      });
    }
    return { problems, attempts };
  },
};
