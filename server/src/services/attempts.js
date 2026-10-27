import { Attempt, Problem } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { normalizeTags } from '../lib/tags.js';
import { normalizeRating } from '../lib/difficulty.js';
import { parseProblemUrl, fallbackExternalId } from '../lib/problemUrl.js';
import { reviewReasonFor } from '../lib/reviewSchedule.js';
import { scheduleReview } from './reviews.js';

/**
 * Finds or creates the catalog problem for a manual entry. Known platform URLs map onto the same
 * doc the sync uses. Existing problems keep their platform data; user tags are merged in.
 */
async function resolveManualProblem({ platform, title, url, tags, difficulty }) {
  const parsed = parseProblemUrl(url);
  const key = parsed ?? { platform: platform.toLowerCase(), externalId: fallbackExternalId(url, title) };
  const userTags = normalizeTags(tags);

  const existing = await Problem.findOne(key);
  if (existing) {
    const merged = [...new Set([...existing.tags, ...userTags])];
    if (merged.length !== existing.tags.length) existing.tags = merged;
    if (existing.rating == null && difficulty) {
      existing.difficultyLabel = String(difficulty);
      existing.rating = normalizeRating(key.platform, difficulty);
    }
    if (existing.isModified()) await existing.save();
    return existing;
  }
  return Problem.create({
    ...key,
    title,
    url: url || undefined,
    tags: userTags,
    difficultyLabel: difficulty ? String(difficulty) : undefined,
    rating: normalizeRating(key.platform, difficulty ?? null),
    origin: 'manual',
  });
}

export async function createManualAttempt(userId, input) {
  const problem = await resolveManualProblem(input);
  const attempt = await Attempt.create({
    user: userId,
    problem: problem._id,
    platform: problem.platform,
    source: 'manual',
    status: input.status,
    date: input.date ?? new Date(),
    timeTakenMin: input.timeTakenMin,
    notes: input.notes ?? '',
  });
  const reason = reviewReasonFor({ status: attempt.status, timeTakenMin: attempt.timeTakenMin, rating: problem.rating });
  const review = reason ? await scheduleReview({ userId, problemId: problem._id, reason, from: attempt.date }) : null;
  return { attempt: await attempt.populate('problem'), review };
}

export async function updateManualAttempt(userId, attemptId, changes) {
  const attempt = await Attempt.findOne({ _id: attemptId, user: userId }).populate('problem');
  if (!attempt) throw ApiError.notFound('Attempt not found');
  if (attempt.source !== 'manual') throw ApiError.badRequest('Synced attempts are read-only; re-sync the account instead');
  attempt.set(changes);
  await attempt.save();
  const reason = reviewReasonFor({ status: attempt.status, timeTakenMin: attempt.timeTakenMin, rating: attempt.problem?.rating });
  if (reason) await scheduleReview({ userId, problemId: attempt.problem._id, reason, from: attempt.date });
  return attempt;
}

export async function deleteManualAttempt(userId, attemptId) {
  const attempt = await Attempt.findOne({ _id: attemptId, user: userId });
  if (!attempt) throw ApiError.notFound('Attempt not found');
  if (attempt.source !== 'manual') throw ApiError.badRequest('Synced attempts cannot be deleted individually');
  await attempt.deleteOne();
}

export async function listAttempts(userId, { status, platform, source, q, page, limit }) {
  const filter = { user: userId };
  if (status) filter.status = status;
  if (platform) filter.platform = platform;
  if (source) filter.source = source;
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const ids = await Problem.find({ $or: [{ title: rx }, { tags: rx }] }, { _id: 1 }).limit(5000).lean();
    filter.problem = { $in: ids.map((d) => d._id) };
  }
  const [items, total] = await Promise.all([
    Attempt.find(filter)
      .sort({ date: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('problem', 'platform title url tags rating difficultyLabel')
      .lean(),
    Attempt.countDocuments(filter),
  ]);
  return { items, total, page, limit, pages: Math.ceil(total / limit) };
}
