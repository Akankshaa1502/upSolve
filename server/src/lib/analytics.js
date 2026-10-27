/**
 * Pure analytics over a user's attempt history. Input rows look like:
 *   { problemId, platform, tags, rating, status, date, source, wrongSubmissions }
 */
import { dayKey, prevDayKey } from './dates.js';
import { weaknessScore } from './scoring.js';

const MAX_WRONG_PER_PROBLEM = 3; // so one problem with 40 WA submissions doesn't dominate a topic

function failuresOf(row) {
  const unsuccessful = row.status === 'solved' ? 0 : 1;
  const wrong = row.source === 'synced' ? Math.min(row.wrongSubmissions || 0, MAX_WRONG_PER_PROBLEM) : 0;
  return unsuccessful + wrong;
}

/**
 * Per-topic stats. "attempts" = distinct problems tried in the topic, "solved" = distinct problems
 * solved, "failedAttempts" = unsuccessful attempt entries + (capped) wrong submissions.
 */
export function computeTopicStats(rows, now = new Date()) {
  const topics = new Map();
  for (const row of rows) {
    for (const tag of row.tags || []) {
      let t = topics.get(tag);
      if (!t) {
        t = { topic: tag, tried: new Set(), solved: new Set(), failedAttempts: 0, lastPracticed: null };
        topics.set(tag, t);
      }
      const pid = String(row.problemId);
      t.tried.add(pid);
      if (row.status === 'solved') t.solved.add(pid);
      t.failedAttempts += failuresOf(row);
      const d = new Date(row.date);
      if (!t.lastPracticed || d > t.lastPracticed) t.lastPracticed = d;
    }
  }
  return [...topics.values()]
    .map((t) => {
      const stat = {
        topic: t.topic,
        attempts: t.tried.size,
        solved: t.solved.size,
        failedAttempts: t.failedAttempts,
        solveRate: t.tried.size ? Math.round((t.solved.size / t.tried.size) * 1000) / 1000 : 0,
        lastPracticed: t.lastPracticed,
      };
      stat.weakness = weaknessScore(
        { attemptedProblems: stat.attempts, solvedProblems: stat.solved, failedAttempts: stat.failedAttempts, lastPracticed: stat.lastPracticed },
        now,
      );
      return stat;
    })
    .sort((a, b) => b.weakness - a.weakness || b.attempts - a.attempts);
}

/** Distinct problems per platform, split into solved vs. not (yet) solved. */
export function computePlatformCounts(rows) {
  const byPlatform = new Map();
  for (const row of rows) {
    let p = byPlatform.get(row.platform);
    if (!p) byPlatform.set(row.platform, (p = new Map()));
    const pid = String(row.problemId);
    p.set(pid, p.get(pid) === 'solved' || row.status === 'solved' ? 'solved' : 'unsolved');
  }
  return [...byPlatform.entries()]
    .map(([platform, problems]) => {
      const solved = [...problems.values()].filter((s) => s === 'solved').length;
      return { platform, solved, unsolved: problems.size - solved, total: problems.size };
    })
    .sort((a, b) => b.total - a.total);
}

export function computeTotals(rows) {
  const status = new Map();
  for (const row of rows) {
    const pid = String(row.problemId);
    const prev = status.get(pid);
    // solved wins over everything; gave_up/attempted keep the latest-known non-solved state
    if (prev !== 'solved') status.set(pid, row.status === 'solved' ? 'solved' : row.status);
  }
  const values = [...status.values()];
  return {
    problems: values.length,
    solved: values.filter((s) => s === 'solved').length,
    attempted: values.filter((s) => s === 'attempted').length,
    gaveUp: values.filter((s) => s === 'gave_up').length,
    entries: rows.length,
  };
}

/** Activity count per local day for the last `days` days (oldest first, zero-filled). */
export function computeHeatmap(rows, now = new Date(), offsetMin = 0, days = 365) {
  const counts = new Map();
  for (const row of rows) {
    const k = dayKey(row.date, offsetMin);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const out = [];
  let k = dayKey(now, offsetMin);
  for (let i = 0; i < days; i++) {
    out.push({ date: k, count: counts.get(k) || 0 });
    k = prevDayKey(k);
  }
  return out.reverse();
}

/**
 * Streaks over active days. The current streak still counts if today has no activity yet
 * but yesterday did (you have until midnight to keep it alive).
 */
export function computeStreak(rows, now = new Date(), offsetMin = 0) {
  const active = new Set(rows.map((r) => dayKey(r.date, offsetMin)));
  const today = dayKey(now, offsetMin);

  let current = 0;
  let k = active.has(today) ? today : prevDayKey(today);
  while (active.has(k)) {
    current++;
    k = prevDayKey(k);
  }

  let longest = 0;
  for (const day of active) {
    if (active.has(prevDayKey(day))) continue; // only start counting at the first day of a run
    let len = 0;
    let d = day;
    while (active.has(d)) {
      len++;
      d = new Date(Date.parse(`${d}T00:00:00.000Z`) + 86400000).toISOString().slice(0, 10);
    }
    longest = Math.max(longest, len);
  }
  return { current, longest, activeToday: active.has(today) };
}
