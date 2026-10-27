/**
 * Pure recommendation math. No database, no I/O: everything comes in as plain arguments,
 * which keeps it easy to unit test (see test/lib.test.js).
 */
import { daysBetween } from './dates.js';
import { seededRandom } from './rng.js';

export const WEIGHTS = { solveRate: 0.5, failures: 0.3, recency: 0.2 };
export const RECENCY_HORIZON_DAYS = 30;
export const DEFAULT_MEDIAN_RATING = 1000;
export const STRETCH_MIN = 100;
export const STRETCH_MAX = 200;
export const RECENT_SOLVED_WINDOW = 30;

/*
 * WEAKNESS SCORE (0 = strong, 100 = very weak)
 *
 * We blend three signals for a topic:
 *  1. Solve rate (50%): how many of the topic's problems you solved out of those you tried.
 *     We "smooth" it as (solved + 1) / (tried + 2), so one lucky or unlucky problem does not
 *     swing the score to 0% or 100%. A lower solve rate means a weaker topic.
 *  2. Failures (30%): the number of failed attempts (gave up, unsolved, wrong submissions),
 *     squashed into 0..1 as failures / (failures + 3). More failures mean a weaker topic, but
 *     each extra failure matters a little less than the one before it.
 *  3. Recency (20%): days since you last practised the topic divided by 30, capped at 1.
 *     A topic you have not touched in a month or more counts as fully "rusty".
 *
 *  weakness = 100 × (0.5 × (1 − smoothedSolveRate) + 0.3 × failurePressure + 0.2 × recencyGap)
 */
export function weaknessScore({ attemptedProblems = 0, solvedProblems = 0, failedAttempts = 0, lastPracticed = null }, now = new Date()) {
  const smoothedSolveRate = (solvedProblems + 1) / (attemptedProblems + 2);
  const failurePressure = failedAttempts / (failedAttempts + 3);
  const gapDays = lastPracticed ? Math.max(0, daysBetween(lastPracticed, now)) : RECENCY_HORIZON_DAYS;
  const recencyGap = Math.min(gapDays / RECENCY_HORIZON_DAYS, 1);
  const raw =
    WEIGHTS.solveRate * (1 - smoothedSolveRate) + WEIGHTS.failures * failurePressure + WEIGHTS.recency * recencyGap;
  return Math.round(raw * 1000) / 10; // one decimal place
}

export function median(values) {
  const nums = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (nums.length === 0) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

/*
 * TARGET DIFFICULTY
 *
 * Take the ratings of your most recent solved problems (up to the last 30, newest first; LeetCode
 * Easy/Medium/Hard already mapped to 1200/1600/2000) and find the median, i.e. your "current level".
 * Recommendations aim 100 to 200 points above that: hard enough to stretch you, not so hard you stall.
 * With no rated solves yet we assume a level of 1000.
 *
 * @param {number[]} recentSolvedRatings newest first
 */
export function targetDifficulty(recentSolvedRatings) {
  const level = median(recentSolvedRatings.slice(0, RECENT_SOLVED_WINDOW)) ?? DEFAULT_MEDIAN_RATING;
  const base = Math.round(level);
  return { level: base, min: base + STRETCH_MIN, max: base + STRETCH_MAX, center: base + (STRETCH_MIN + STRETCH_MAX) / 2 };
}

/*
 * DAILY PICKS
 *
 * 1. Drop anything already solved, anything without a rating or tags.
 * 2. Keep problems rated inside the target window [level+100, level+200]. If that leaves too few,
 *    widen the window step by step (±100 each time, up to 3 times).
 * 3. Score each candidate: 70% "how weak is its weakest-known topic" + 30% "how close is the rating
 *    to the middle of the window", plus a tiny seeded random nudge so ties rotate day to day.
 * 4. Take the best ones, preferring a different focus topic for each of the picks.
 *
 * Same inputs + same seed → same output, so the 3 problems stay fixed for the whole day.
 */
export function recommendProblems({ topics, target, candidates, solvedIds = new Set(), count = 3, seed = 'upsolve' }) {
  const weakness = new Map(topics.map((t) => [t.topic, t.weakness]));
  const rand = seededRandom(seed);
  const usable = candidates.filter(
    (c) => Number.isFinite(c.rating) && c.tags?.length && !solvedIds.has(String(c.id)),
  );

  let pool = [];
  for (let widen = 0; widen <= 3; widen++) {
    const lo = target.min - widen * 100;
    const hi = target.max + widen * 100;
    pool = usable.filter((c) => c.rating >= lo && c.rating <= hi);
    if (pool.length >= count * 3) break;
  }

  const scored = pool.map((c) => {
    // Focus topic = the candidate's tag the user is weakest at (only topics the user has history in).
    let focusTopic = null;
    let topicWeakness = 0;
    for (const tag of c.tags) {
      const w = weakness.get(tag);
      if (w !== undefined && w > topicWeakness) {
        topicWeakness = w;
        focusTopic = tag;
      }
    }
    const ratingFit = 1 - Math.min(Math.abs(c.rating - target.center) / 300, 1);
    const score = 0.7 * (topicWeakness / 100) + 0.3 * ratingFit + rand() * 0.05;
    return { ...c, focusTopic, topicWeakness, score: Math.round(score * 1000) / 1000 };
  });
  scored.sort((a, b) => b.score - a.score || String(a.id).localeCompare(String(b.id)));

  const picks = [];
  const usedTopics = new Set();
  for (const c of scored) {
    if (picks.length === count) break;
    if (c.focusTopic && usedTopics.has(c.focusTopic)) continue;
    picks.push(c);
    if (c.focusTopic) usedTopics.add(c.focusTopic);
  }
  // Not enough distinct topics: fill the remaining slots with the next best regardless of topic.
  for (const c of scored) {
    if (picks.length === count) break;
    if (!picks.includes(c)) picks.push(c);
  }
  return picks;
}
