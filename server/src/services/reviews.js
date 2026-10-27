import { ReviewSchedule } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { applyReviewResult, firstDueAt, REVIEW_INTERVALS_DAYS } from '../lib/reviewSchedule.js';
import { endOfLocalDay } from '../lib/dates.js';

/**
 * Puts a problem on the revisit queue (1/3/7/21 days) unless it is already being reviewed.
 * A problem whose review cycle already completed is restarted, since the user struggled again.
 */
export async function scheduleReview({ userId, problemId, reason, from = new Date() }) {
  const existing = await ReviewSchedule.findOne({ user: userId, problem: problemId });
  if (existing?.status === 'active') return existing;
  if (existing) {
    Object.assign(existing, { reason, stage: 0, dueAt: firstDueAt(from), status: 'active', completedAt: undefined });
    return existing.save();
  }
  try {
    return await ReviewSchedule.create({ user: userId, problem: problemId, reason, dueAt: firstDueAt(from) });
  } catch (err) {
    if (err?.code === 11000) return ReviewSchedule.findOne({ user: userId, problem: problemId }); // raced with another insert
    throw err;
  }
}

const POPULATE = { path: 'problem', select: 'platform title url tags rating difficultyLabel' };

export async function listReviews(userId, { scope = 'due', offsetMin = 0, now = new Date() }) {
  const filter = { user: userId };
  const endOfToday = endOfLocalDay(now, offsetMin);
  if (scope === 'due') Object.assign(filter, { status: 'active', dueAt: { $lte: endOfToday } });
  else if (scope === 'upcoming') Object.assign(filter, { status: 'active', dueAt: { $gt: endOfToday } });
  else if (scope === 'completed') filter.status = 'completed';
  const docs = await ReviewSchedule.find(filter)
    .sort(scope === 'completed' ? { completedAt: -1 } : { dueAt: 1 })
    .limit(200)
    .populate(POPULATE)
    .lean();
  return docs.map((d) => ({
    ...d,
    overdue: d.status === 'active' && d.dueAt < now,
    intervalDays: REVIEW_INTERVALS_DAYS[Math.min(d.stage, REVIEW_INTERVALS_DAYS.length - 1)],
    totalStages: REVIEW_INTERVALS_DAYS.length,
  }));
}

export async function recordReviewResult(userId, reviewId, result, now = new Date()) {
  const review = await ReviewSchedule.findOne({ _id: reviewId, user: userId });
  if (!review) throw ApiError.notFound('Review not found');
  if (review.status !== 'active') throw ApiError.conflict('This review is already completed');
  const next = applyReviewResult(review, result, now);
  review.stage = next.stage;
  review.dueAt = next.dueAt;
  review.status = next.status;
  if (next.status === 'completed') review.completedAt = now;
  review.history.push({ at: now, result });
  await review.save();
  return review.populate(POPULATE);
}
