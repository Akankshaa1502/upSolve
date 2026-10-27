import { addDays } from './dates.js';

/** A problem comes back after 1, then 3, then 7, then 21 days. */
export const REVIEW_INTERVALS_DAYS = [1, 3, 7, 21];

/**
 * How long a solve "should" take at a given rating before we call it slow:
 * 30 minutes at 800, +5 minutes per 100 rating points, capped at 150 minutes.
 * (LeetCode Medium ≈ 1600 → 70 min.) Unknown rating → 60 min.
 */
export function slowThresholdMinutes(rating) {
  if (rating === null || rating === undefined) return 60;
  return Math.max(30, Math.min(150, 30 + (rating - 800) / 20));
}

export function isSlowSolve(timeTakenMin, rating) {
  return typeof timeTakenMin === 'number' && timeTakenMin > slowThresholdMinutes(rating);
}

/** Why (if at all) an attempt should enter the revisit queue. */
export function reviewReasonFor({ status, timeTakenMin, rating }) {
  if (status === 'attempted') return 'attempted';
  if (status === 'gave_up') return 'gave_up';
  if (status === 'solved' && isSlowSolve(timeTakenMin, rating)) return 'slow';
  return null;
}

/** First due date for a newly scheduled problem. */
export function firstDueAt(from) {
  return addDays(from, REVIEW_INTERVALS_DAYS[0]);
}

/**
 * Next state after the user revisits a problem.
 * solved → move to the next interval (1→3→7→21), completing after the 21-day review.
 * failed → start over at 1 day.
 */
export function applyReviewResult({ stage }, result, now = new Date()) {
  if (result === 'failed') {
    return { stage: 0, dueAt: addDays(now, REVIEW_INTERVALS_DAYS[0]), status: 'active' };
  }
  const nextStage = stage + 1;
  if (nextStage >= REVIEW_INTERVALS_DAYS.length) {
    return { stage: nextStage, dueAt: now, status: 'completed' };
  }
  return { stage: nextStage, dueAt: addDays(now, REVIEW_INTERVALS_DAYS[nextStage]), status: 'active' };
}
