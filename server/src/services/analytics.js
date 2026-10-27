import { Attempt, Problem, ReviewSchedule } from '../models/index.js';
import { computeTopicStats, computePlatformCounts, computeTotals, computeHeatmap, computeStreak } from '../lib/analytics.js';
import { targetDifficulty, recommendProblems } from '../lib/scoring.js';
import { dayKey, endOfLocalDay } from '../lib/dates.js';
import { refreshCatalog } from './catalog.js';

/** Flattens a user's attempts + their problems into the rows the pure analytics functions expect. */
export async function loadRows(userId) {
  const attempts = await Attempt.find({ user: userId }, { problem: 1, platform: 1, status: 1, date: 1, source: 1, wrongSubmissions: 1 })
    .populate('problem', 'tags rating')
    .lean();
  return attempts
    .filter((a) => a.problem)
    .map((a) => ({
      problemId: a.problem._id,
      platform: a.platform,
      tags: a.problem.tags,
      rating: a.problem.rating,
      status: a.status,
      date: a.date,
      source: a.source,
      wrongSubmissions: a.wrongSubmissions,
    }));
}

/** Ratings of solved problems, most recently solved first (one per problem). */
function recentSolvedRatings(rows) {
  const seen = new Set();
  return rows
    .filter((r) => r.status === 'solved' && Number.isFinite(r.rating))
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .filter((r) => !seen.has(String(r.problemId)) && seen.add(String(r.problemId)))
    .map((r) => r.rating);
}

export async function getSummary(userId, { offsetMin = 0, now = new Date() } = {}) {
  const rows = await loadRows(userId);
  const [dueToday, activeReviews] = await Promise.all([
    ReviewSchedule.countDocuments({ user: userId, status: 'active', dueAt: { $lte: endOfLocalDay(now, offsetMin) } }),
    ReviewSchedule.countDocuments({ user: userId, status: 'active' }),
  ]);
  return {
    totals: computeTotals(rows),
    topics: computeTopicStats(rows, now),
    platforms: computePlatformCounts(rows),
    heatmap: computeHeatmap(rows, now, offsetMin, 365),
    streak: computeStreak(rows, now, offsetMin),
    level: targetDifficulty(recentSolvedRatings(rows)),
    reviews: { dueToday, active: activeReviews },
  };
}

export async function getTodayRecommendations(userId, { offsetMin = 0, now = new Date(), count = 3 } = {}) {
  const rows = await loadRows(userId);
  const topics = computeTopicStats(rows, now);
  const target = targetDifficulty(recentSolvedRatings(rows));
  // Never recommend something already touched: solved problems are done, unsolved ones live in Revisit.
  const touched = new Set(rows.map((r) => String(r.problemId)));

  const query = { rating: { $gte: target.min - 300, $lte: target.max + 300 }, 'tags.0': { $exists: true } };
  if (!(await Problem.exists(query))) await refreshCatalog('codeforces'); // first run with an empty catalog
  const candidates = (await Problem.find(query, { platform: 1, title: 1, url: 1, tags: 1, rating: 1, difficultyLabel: 1 }).lean())
    .map((p) => ({ ...p, id: String(p._id) }));

  const picks = recommendProblems({
    topics,
    target,
    candidates,
    solvedIds: touched,
    count,
    seed: `${userId}:${dayKey(now, offsetMin)}`,
  });
  return {
    date: dayKey(now, offsetMin),
    target,
    weakTopics: topics.slice(0, 5).map(({ topic, weakness }) => ({ topic, weakness })),
    problems: picks.map(({ id, platform, title, url, tags, rating, difficultyLabel, focusTopic, topicWeakness }) => ({
      id,
      platform,
      title,
      url,
      tags,
      rating,
      difficultyLabel,
      focusTopic,
      reason: focusTopic
        ? `Targets ${focusTopic} (weakness ${topicWeakness}) at ${rating}, a stretch above your level ${target.level}`
        : `Rated ${rating}, a stretch above your level ${target.level}`,
    })),
    catalogEmpty: candidates.length === 0,
  };
}
