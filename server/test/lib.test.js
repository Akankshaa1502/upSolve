import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { weaknessScore, targetDifficulty, median, recommendProblems } from '../src/lib/scoring.js';
import { normalizeRating } from '../src/lib/difficulty.js';
import { reviewReasonFor, applyReviewResult, firstDueAt, slowThresholdMinutes } from '../src/lib/reviewSchedule.js';
import { computeTopicStats, computeStreak, computeHeatmap, computePlatformCounts, computeTotals } from '../src/lib/analytics.js';
import { dayKey, endOfLocalDay, DAY_MS } from '../src/lib/dates.js';
import { normalizeTags } from '../src/lib/tags.js';

const NOW = new Date('2026-10-27T12:00:00Z');
const daysAgo = (n) => new Date(NOW.getTime() - n * DAY_MS);

describe('weaknessScore', () => {
  test('is bounded between 0 and 100', () => {
    const strongest = weaknessScore({ attemptedProblems: 1000, solvedProblems: 1000, failedAttempts: 0, lastPracticed: NOW }, NOW);
    const weakest = weaknessScore({ attemptedProblems: 1000, solvedProblems: 0, failedAttempts: 1e6, lastPracticed: daysAgo(365) }, NOW);
    assert.ok(strongest >= 0 && strongest < 1);
    assert.ok(weakest > 99 && weakest <= 100);
  });

  test('lower solve rate → weaker', () => {
    const base = { attemptedProblems: 10, failedAttempts: 2, lastPracticed: daysAgo(3) };
    assert.ok(weaknessScore({ ...base, solvedProblems: 3 }, NOW) > weaknessScore({ ...base, solvedProblems: 9 }, NOW));
  });

  test('more failures → weaker', () => {
    const base = { attemptedProblems: 10, solvedProblems: 6, lastPracticed: daysAgo(3) };
    assert.ok(weaknessScore({ ...base, failedAttempts: 8 }, NOW) > weaknessScore({ ...base, failedAttempts: 1 }, NOW));
  });

  test('longer gap → weaker, capped at 30 days', () => {
    const base = { attemptedProblems: 10, solvedProblems: 6, failedAttempts: 2 };
    const fresh = weaknessScore({ ...base, lastPracticed: daysAgo(0) }, NOW);
    const stale = weaknessScore({ ...base, lastPracticed: daysAgo(20) }, NOW);
    const month = weaknessScore({ ...base, lastPracticed: daysAgo(30) }, NOW);
    const year = weaknessScore({ ...base, lastPracticed: daysAgo(365) }, NOW);
    assert.ok(stale > fresh);
    assert.equal(month, year);
  });

  test('matches the documented formula', () => {
    // solve rate (4+1)/(6+2)=0.625, failures 3/(3+3)=0.5, gap 15/30=0.5
    // 100 × (0.5×0.375 + 0.3×0.5 + 0.2×0.5) = 43.75 → 43.8
    const w = weaknessScore({ attemptedProblems: 6, solvedProblems: 4, failedAttempts: 3, lastPracticed: daysAgo(15) }, NOW);
    assert.equal(w, 43.8);
  });
});

describe('targetDifficulty', () => {
  test('median + 100..200', () => {
    assert.deepEqual(targetDifficulty([1200, 1400, 1300]), { level: 1300, min: 1400, max: 1500, center: 1450 });
  });
  test('defaults to 1000 with no history', () => {
    assert.equal(targetDifficulty([]).level, 1000);
  });
  test('only the 30 most recent solves count', () => {
    const recent = Array(30).fill(1600);
    const old = Array(100).fill(800);
    assert.equal(targetDifficulty([...recent, ...old]).level, 1600);
  });
  test('median handles even counts and ignores non-numbers', () => {
    assert.equal(median([1000, 1200, null, NaN]), 1100);
    assert.equal(median([]), null);
  });
});

describe('normalizeRating', () => {
  test('LeetCode labels', () => {
    assert.equal(normalizeRating('leetcode', 'Easy'), 1200);
    assert.equal(normalizeRating('leetcode', 'Medium'), 1600);
    assert.equal(normalizeRating('leetcode', 'HARD'), 2000);
  });
  test('Codeforces ratings pass through, unknowns are null', () => {
    assert.equal(normalizeRating('codeforces', 1700), 1700);
    assert.equal(normalizeRating('codeforces', null), null);
    assert.equal(normalizeRating('cses', 'tricky'), null);
  });
  test('AtCoder negative difficulties are corrected and clamped', () => {
    assert.equal(normalizeRating('atcoder', -1000), 800);
    assert.equal(normalizeRating('atcoder', 1500), 1500);
  });
});

describe('recommendProblems', () => {
  const topics = [
    { topic: 'dp', weakness: 80 },
    { topic: 'graphs', weakness: 70 },
    { topic: 'greedy', weakness: 20 },
    { topic: 'math', weakness: 60 },
  ];
  const target = targetDifficulty([1300]); // window 1400..1500
  const candidates = [
    { id: 'a', tags: ['dp'], rating: 1400 },
    { id: 'b', tags: ['dp'], rating: 1500 },
    { id: 'c', tags: ['graphs'], rating: 1500 },
    { id: 'd', tags: ['greedy'], rating: 1400 },
    { id: 'e', tags: ['math'], rating: 1400 },
    { id: 'f', tags: ['dp'], rating: 2400 }, // too hard
    { id: 'g', tags: [], rating: 1400 }, // untagged
    { id: 'h', tags: ['dp', 'graphs'], rating: null }, // unrated
    { id: 'i', tags: ['math'], rating: 1500 },
    { id: 'j', tags: ['greedy'], rating: 1500 },
  ];

  test('returns 3 picks aimed at weak topics with distinct focus topics', () => {
    const picks = recommendProblems({ topics, target, candidates, seed: 'u1:2026-10-27' });
    assert.equal(picks.length, 3);
    assert.deepEqual(new Set(picks.map((p) => p.focusTopic)), new Set(['dp', 'graphs', 'math']));
  });

  test('never recommends a solved problem', () => {
    const solvedIds = new Set(['a', 'b', 'c']);
    const picks = recommendProblems({ topics, target, candidates, solvedIds, seed: 'x' });
    for (const p of picks) assert.ok(!solvedIds.has(p.id));
  });

  test('never recommends unrated, untagged, or far-off problems while closer ones exist', () => {
    const picks = recommendProblems({ topics, target, candidates, seed: 'x' });
    for (const p of picks) assert.ok(!['f', 'g', 'h'].includes(p.id));
  });

  test('is deterministic for the same seed', () => {
    const a = recommendProblems({ topics, target, candidates, seed: 's' }).map((p) => p.id);
    const b = recommendProblems({ topics, target, candidates, seed: 's' }).map((p) => p.id);
    assert.deepEqual(a, b);
  });

  test('widens the window when the target band is empty', () => {
    const picks = recommendProblems({ topics, target: targetDifficulty([2000]), candidates, seed: 's' });
    assert.ok(picks.length > 0);
    assert.ok(picks.every((p) => p.rating >= 2100 - 300 && p.rating <= 2200 + 300));
  });

  test('returns empty list when nothing is usable', () => {
    assert.deepEqual(recommendProblems({ topics, target, candidates: [] }), []);
  });
});

describe('review schedule', () => {
  test('reasons', () => {
    assert.equal(reviewReasonFor({ status: 'attempted' }), 'attempted');
    assert.equal(reviewReasonFor({ status: 'gave_up' }), 'gave_up');
    assert.equal(reviewReasonFor({ status: 'solved', timeTakenMin: 200, rating: 1600 }), 'slow');
    assert.equal(reviewReasonFor({ status: 'solved', timeTakenMin: 20, rating: 1600 }), null);
    assert.equal(reviewReasonFor({ status: 'solved' }), null);
  });

  test('slow threshold grows with rating and is capped', () => {
    assert.equal(slowThresholdMinutes(800), 30);
    assert.equal(slowThresholdMinutes(1600), 70);
    assert.equal(slowThresholdMinutes(3500), 150);
  });

  test('1 → 3 → 7 → 21 days, then completed', () => {
    let s = { stage: 0, dueAt: firstDueAt(NOW) };
    assert.equal(s.dueAt.getTime() - NOW.getTime(), 1 * DAY_MS);
    const gaps = [];
    for (let i = 0; i < 3; i++) {
      s = applyReviewResult(s, 'solved', NOW);
      gaps.push((s.dueAt.getTime() - NOW.getTime()) / DAY_MS);
    }
    assert.deepEqual(gaps, [3, 7, 21]);
    assert.equal(applyReviewResult(s, 'solved', NOW).status, 'completed');
  });

  test('failing resets to day 1', () => {
    const s = applyReviewResult({ stage: 2 }, 'failed', NOW);
    assert.equal(s.stage, 0);
    assert.equal(s.status, 'active');
    assert.equal(s.dueAt.getTime() - NOW.getTime(), DAY_MS);
  });
});

describe('analytics', () => {
  const rows = [
    { problemId: 'p1', platform: 'codeforces', tags: ['dp'], status: 'attempted', date: daysAgo(2), source: 'synced', wrongSubmissions: 10 },
    { problemId: 'p1', platform: 'codeforces', tags: ['dp'], status: 'solved', date: daysAgo(1), source: 'manual' },
    { problemId: 'p2', platform: 'leetcode', tags: ['dp', 'greedy'], status: 'gave_up', date: daysAgo(0), source: 'manual' },
    { problemId: 'p3', platform: 'leetcode', tags: ['greedy'], status: 'solved', date: daysAgo(5), source: 'synced', wrongSubmissions: 0 },
  ];

  test('topic stats count distinct problems and capped failures', () => {
    const dp = computeTopicStats(rows, NOW).find((t) => t.topic === 'dp');
    assert.equal(dp.attempts, 2);
    assert.equal(dp.solved, 1);
    assert.equal(dp.solveRate, 0.5);
    assert.equal(dp.failedAttempts, 1 + 3 + 1); // synced unsolved + capped WA + gave_up
    assert.equal(dp.lastPracticed.getTime(), daysAgo(0).getTime());
  });

  test('topics sorted weakest first', () => {
    const stats = computeTopicStats(rows, NOW);
    for (let i = 1; i < stats.length; i++) assert.ok(stats[i - 1].weakness >= stats[i].weakness);
  });

  test('platform counts and totals use distinct problems', () => {
    assert.deepEqual(computePlatformCounts(rows), [
      { platform: 'leetcode', solved: 1, unsolved: 1, total: 2 },
      { platform: 'codeforces', solved: 1, unsolved: 0, total: 1 },
    ]);
    assert.deepEqual(computeTotals(rows), { problems: 3, solved: 2, attempted: 0, gaveUp: 1, entries: 4 });
  });

  test('streaks', () => {
    // active today, -1, -2, and -5
    assert.deepEqual(computeStreak(rows, NOW), { current: 3, longest: 3, activeToday: true });
    // nothing today but yesterday active → streak still alive
    const noToday = rows.filter((r) => r.date.getTime() !== daysAgo(0).getTime());
    assert.equal(computeStreak(noToday, NOW).current, 2);
    assert.equal(computeStreak([], NOW).current, 0);
  });

  test('heatmap is zero-filled, oldest first, ends today', () => {
    const map = computeHeatmap(rows, NOW, 0, 7);
    assert.equal(map.length, 7);
    assert.equal(map[6].date, '2026-10-27');
    assert.equal(map[6].count, 1);
    assert.equal(map[1].count, 1); // 5 days ago
    assert.equal(map[0].count, 0);
    assert.equal(map[3].count, 0);
  });
});

describe('dates & tags', () => {
  test('dayKey respects timezone offset', () => {
    const late = new Date('2026-10-27T20:00:00Z');
    assert.equal(dayKey(late, 0), '2026-10-27');
    assert.equal(dayKey(late, 330), '2026-10-28'); // IST
  });
  test('endOfLocalDay', () => {
    assert.equal(endOfLocalDay(NOW, 0).toISOString(), '2026-10-27T23:59:59.999Z');
    assert.equal(endOfLocalDay(NOW, 330).toISOString(), '2026-10-27T18:29:59.999Z');
  });
  test('tags normalize across platforms', () => {
    assert.deepEqual(normalizeTags(['Dynamic Programming', 'dp', 'Hash Table', '*special', ' Greedy ']), ['dp', 'hashing', 'greedy']);
  });
});
