/**
 * Demo data: a user with ~5 months of realistic practice so the dashboard looks alive without any
 * real platform accounts. Safe to re-run: it wipes and rebuilds only the demo user's data.
 *
 *   npm run seed                      (needs a real MONGO_URI)
 *   SEED_ON_START=true npm run dev    (works with MONGO_URI=memory)
 *
 * Problems: the real Codeforces problemset when the network is available (falls back to a small
 * synthetic "demo" catalog offline), plus real LeetCode and CSES problems.
 */
import bcrypt from 'bcryptjs';
import { pathToFileURL } from 'node:url';
import { User, Problem, Attempt, ReviewSchedule, PlatformAccount } from '../src/models/index.js';
import { upsertProblems, refreshCatalog } from '../src/services/catalog.js';
import { scheduleReview } from '../src/services/reviews.js';
import { applyReviewResult } from '../src/lib/reviewSchedule.js';
import { reviewReasonFor } from '../src/lib/reviewSchedule.js';
import { normalizeTags } from '../src/lib/tags.js';
import { normalizeRating } from '../src/lib/difficulty.js';
import { seededRandom } from '../src/lib/rng.js';
import { DAY_MS } from '../src/lib/dates.js';

export const DEMO_EMAIL = 'demo@upsolve.dev';
export const DEMO_PASSWORD = 'demo1234';

const LEETCODE = [
  [1, 'two-sum', 'Two Sum', 'Easy', ['Array', 'Hash Table']],
  [3, 'longest-substring-without-repeating-characters', 'Longest Substring Without Repeating Characters', 'Medium', ['Hash Table', 'String', 'Sliding Window']],
  [4, 'median-of-two-sorted-arrays', 'Median of Two Sorted Arrays', 'Hard', ['Array', 'Binary Search', 'Divide and Conquer']],
  [5, 'longest-palindromic-substring', 'Longest Palindromic Substring', 'Medium', ['Two Pointers', 'String', 'Dynamic Programming']],
  [11, 'container-with-most-water', 'Container With Most Water', 'Medium', ['Array', 'Two Pointers', 'Greedy']],
  [15, '3sum', '3Sum', 'Medium', ['Array', 'Two Pointers', 'Sorting']],
  [20, 'valid-parentheses', 'Valid Parentheses', 'Easy', ['String', 'Stack']],
  [21, 'merge-two-sorted-lists', 'Merge Two Sorted Lists', 'Easy', ['Linked List', 'Recursion']],
  [23, 'merge-k-sorted-lists', 'Merge k Sorted Lists', 'Hard', ['Linked List', 'Divide and Conquer', 'Heap (Priority Queue)']],
  [33, 'search-in-rotated-sorted-array', 'Search in Rotated Sorted Array', 'Medium', ['Array', 'Binary Search']],
  [42, 'trapping-rain-water', 'Trapping Rain Water', 'Hard', ['Array', 'Two Pointers', 'Dynamic Programming', 'Monotonic Stack']],
  [53, 'maximum-subarray', 'Maximum Subarray', 'Medium', ['Array', 'Divide and Conquer', 'Dynamic Programming']],
  [55, 'jump-game', 'Jump Game', 'Medium', ['Array', 'Dynamic Programming', 'Greedy']],
  [70, 'climbing-stairs', 'Climbing Stairs', 'Easy', ['Math', 'Dynamic Programming', 'Memoization']],
  [72, 'edit-distance', 'Edit Distance', 'Medium', ['String', 'Dynamic Programming']],
  [76, 'minimum-window-substring', 'Minimum Window Substring', 'Hard', ['Hash Table', 'String', 'Sliding Window']],
  [121, 'best-time-to-buy-and-sell-stock', 'Best Time to Buy and Sell Stock', 'Easy', ['Array', 'Dynamic Programming']],
  [128, 'longest-consecutive-sequence', 'Longest Consecutive Sequence', 'Medium', ['Array', 'Hash Table', 'Union Find']],
  [200, 'number-of-islands', 'Number of Islands', 'Medium', ['Array', 'Depth-First Search', 'Breadth-First Search', 'Union Find']],
  [207, 'course-schedule', 'Course Schedule', 'Medium', ['Depth-First Search', 'Breadth-First Search', 'Graph', 'Topological Sort']],
  [300, 'longest-increasing-subsequence', 'Longest Increasing Subsequence', 'Medium', ['Array', 'Binary Search', 'Dynamic Programming']],
  [322, 'coin-change', 'Coin Change', 'Medium', ['Array', 'Dynamic Programming', 'Breadth-First Search']],
  [743, 'network-delay-time', 'Network Delay Time', 'Medium', ['Graph', 'Heap (Priority Queue)', 'Shortest Path']],
  [875, 'koko-eating-bananas', 'Koko Eating Bananas', 'Medium', ['Array', 'Binary Search']],
  [1143, 'longest-common-subsequence', 'Longest Common Subsequence', 'Medium', ['String', 'Dynamic Programming']],
];

// CSES Problem Set — entered "manually" from a platform we don't sync. Ratings are rough estimates.
const CSES = [
  [1068, 'Weird Algorithm', 800, ['implementation']],
  [1083, 'Missing Number', 800, ['math']],
  [1069, 'Repetitions', 800, ['implementation', 'strings']],
  [1094, 'Increasing Array', 900, ['greedy']],
  [1640, 'Sum of Two Values', 1100, ['two pointers', 'sortings']],
  [1084, 'Apartments', 1100, ['greedy', 'sortings', 'two pointers']],
  [1633, 'Dice Combinations', 1300, ['dp']],
  [1192, 'Counting Rooms', 1300, ['graphs', 'dfs and similar']],
  [1666, 'Building Roads', 1400, ['graphs', 'dsu']],
  [1635, 'Coin Combinations I', 1500, ['dp']],
  [1193, 'Labyrinth', 1500, ['graphs']],
  [1158, 'Book Shop', 1600, ['dp']],
  [1671, 'Shortest Routes I', 1600, ['graphs', 'shortest paths']],
];

// How likely the demo user is to solve a problem of each topic (their "true" skill profile).
const SKILL = {
  implementation: 0.92, math: 0.85, greedy: 0.82, sortings: 0.88, 'brute force': 0.85, strings: 0.75,
  'constructive algorithms': 0.62, 'number theory': 0.55, 'binary search': 0.5, 'two pointers': 0.65,
  hashing: 0.8, 'data structures': 0.48, dp: 0.32, graphs: 0.35, 'dfs and similar': 0.4, trees: 0.3,
  'shortest paths': 0.3, dsu: 0.4, combinatorics: 0.42, bitmasks: 0.5,
};
const DEMO_TOPICS = Object.keys(SKILL);

const NOTES = [
  'Missed the edge case n = 1.',
  'Needed the editorial hint for the transition.',
  'TLE with O(n^2); prefix sums fixed it.',
  'Forgot to use long long.',
  'Clean solve, sort then greedy.',
  'Couldn\'t see the graph modelling.',
  '',
  '',
];

function syntheticCatalog() {
  const rand = seededRandom('demo-catalog');
  const problems = [];
  let n = 1;
  for (const topic of DEMO_TOPICS) {
    for (let rating = 800; rating <= 2000; rating += 100) {
      const extra = DEMO_TOPICS[Math.floor(rand() * DEMO_TOPICS.length)];
      problems.push({
        externalId: `demo-${n}`,
        title: `Demo ${n}. ${topic} practice (${rating})`,
        tags: [...new Set([topic, extra])],
        difficultyLabel: String(rating),
        rating,
      });
      n++;
    }
  }
  return problems;
}

/** Picks ~110 Codeforces-catalog problems (800–1700) spread across the demo topics. */
async function pickPracticeProblems(rand) {
  let platform = 'codeforces';
  let pool = await Problem.find({ platform, rating: { $gte: 800, $lte: 1700 }, 'tags.0': { $exists: true } }).lean();
  if (pool.length < 200) {
    platform = 'demo';
    const ids = await upsertProblems('demo', syntheticCatalog(), 'catalog');
    pool = await Problem.find({ _id: { $in: [...ids.values()] }, rating: { $lte: 1700 } }).lean();
  }
  pool = pool.filter((p) => p.tags.some((t) => SKILL[t] !== undefined));
  const picked = [];
  const used = new Set();
  while (picked.length < 110 && used.size < pool.length) {
    const p = pool[Math.floor(rand() * pool.length)];
    if (used.has(String(p._id))) continue;
    used.add(String(p._id));
    // Bias toward easier problems, like a real practice history.
    if (p.rating > 1400 && rand() < 0.5) continue;
    picked.push(p);
  }
  return { platform, problems: picked };
}

function solveProbability(problem, rand) {
  const known = problem.tags.map((t) => SKILL[t]).filter((v) => v !== undefined);
  const skill = known.length ? Math.min(...known) : 0.6;
  const ratingPenalty = Math.max(0, (problem.rating ?? 1200) - 1200) / 1500;
  return Math.max(0.08, Math.min(0.97, skill - ratingPenalty + (rand() - 0.5) * 0.1));
}

/** Days with practice: dense recently (with a live streak), sparser further back. */
function practiceDays(rand, now) {
  const days = [];
  for (let d = 150; d >= 0; d--) {
    const p = d <= 8 ? 1 : d <= 45 ? 0.62 : 0.35;
    if (rand() < p) days.push(d);
  }
  return days.map((d) => new Date(now.getTime() - d * DAY_MS - Math.floor(rand() * 10) * 3600000));
}

export async function seedDemo({ log = () => {}, now = new Date() } = {}) {
  const rand = seededRandom('upsolve-demo');

  let user = await User.findOne({ email: DEMO_EMAIL });
  if (user) {
    await Promise.all([
      Attempt.deleteMany({ user: user._id }),
      ReviewSchedule.deleteMany({ user: user._id }),
      PlatformAccount.deleteMany({ user: user._id }),
    ]);
  } else {
    user = await User.create({ email: DEMO_EMAIL, name: 'Demo Coder', passwordHash: await bcrypt.hash(DEMO_PASSWORD, 12) });
  }

  log('Loading Codeforces problemset (falls back to a demo catalog if offline)...');
  const catalog = await refreshCatalog('codeforces');
  log(catalog.refreshed ? `  ${catalog.count} Codeforces problems in catalog` : `  catalog not refreshed (${catalog.reason})`);

  const lcIds = await upsertProblems(
    'leetcode',
    LEETCODE.map(([id, slug, title, diff, tags]) => ({
      externalId: slug,
      title: `${id}. ${title}`,
      url: `https://leetcode.com/problems/${slug}/`,
      tags: normalizeTags(tags),
      difficultyLabel: diff,
      rating: normalizeRating('leetcode', diff),
    })),
    'synced',
  );
  const csesIds = await upsertProblems(
    'cses',
    CSES.map(([id, title, rating, tags]) => ({
      externalId: `cses.fi/problemset/task/${id}`,
      title,
      url: `https://cses.fi/problemset/task/${id}`,
      tags,
      difficultyLabel: String(rating),
      rating,
    })),
    'manual',
  );
  const { platform: cfPlatform, problems: cfProblems } = await pickPracticeProblems(rand);
  const lcDocs = await Problem.find({ _id: { $in: [...lcIds.values()] } }).lean();
  const csesDocs = await Problem.find({ _id: { $in: [...csesIds.values()] } }).lean();

  const queue = [...cfProblems, ...lcDocs, ...csesDocs].sort(() => rand() - 0.5);
  const days = practiceDays(rand, now);
  const attempts = [];
  queue.forEach((problem, i) => {
    // Spread problems over practice days in order, so the newest problems land in the recent streak.
    const date = days[Math.min(days.length - 1, Math.floor((i / queue.length) * days.length))];
    const solved = rand() < solveProbability(problem, rand);
    const status = solved ? 'solved' : rand() < 0.65 ? 'attempted' : 'gave_up';
    const expected = 20 + Math.max(0, (problem.rating ?? 1200) - 800) / 15;
    const timeTakenMin = Math.round(expected * (0.5 + rand() * (solved ? 1.4 : 1.8)));
    attempts.push({
      user: user._id,
      problem: problem._id,
      platform: problem.platform,
      source: problem.platform === 'leetcode' ? 'synced' : 'manual',
      status,
      date,
      timeTakenMin: problem.platform === 'leetcode' ? undefined : timeTakenMin,
      notes: NOTES[Math.floor(rand() * NOTES.length)],
      wrongSubmissions: solved ? Math.floor(rand() * 2) : 1 + Math.floor(rand() * 3),
      submissionCount: 1 + Math.floor(rand() * 4),
    });
    // Some failed problems get re-solved later (that's what upsolving is).
    if (!solved && rand() < 0.35) {
      const later = new Date(Math.min(now.getTime(), date.getTime() + (2 + Math.floor(rand() * 10)) * DAY_MS));
      attempts.push({ ...attempts.at(-1), source: 'manual', status: 'solved', date: later, timeTakenMin: Math.round(expected * 0.8), notes: 'Upsolved after reading the editorial.' });
    }
  });
  // LeetCode only syncs solves; keep the synced ones as solved, one per problem.
  const seenSynced = new Set();
  const finalAttempts = attempts.filter((a) => {
    if (a.source !== 'synced') return true;
    if (a.status !== 'solved' || seenSynced.has(String(a.problem))) return false;
    seenSynced.add(String(a.problem));
    return true;
  });
  await Attempt.insertMany(finalAttempts);

  // Revisit queue: problems from the last 25 days, with past reviews simulated so the queue looks lived-in.
  const byId = new Map(queue.map((p) => [String(p._id), p]));
  let scheduled = 0;
  for (const a of finalAttempts) {
    if (now - a.date > 25 * DAY_MS) continue;
    const reason = reviewReasonFor({ status: a.status, timeTakenMin: a.timeTakenMin, rating: byId.get(String(a.problem))?.rating });
    if (!reason) continue;
    const review = await scheduleReview({ userId: user._id, problemId: a.problem, reason, from: a.date });
    while (review.status === 'active' && review.dueAt.getTime() < now.getTime() - DAY_MS) {
      const result = rand() < 0.8 ? 'solved' : 'failed';
      const at = review.dueAt;
      Object.assign(review, applyReviewResult(review, result, at));
      if (review.status === 'completed') review.completedAt = at;
      review.history.push({ at, result });
    }
    await review.save();
    scheduled++;
  }

  log(`Seeded ${DEMO_EMAIL} / ${DEMO_PASSWORD}: ${finalAttempts.length} attempts (${cfPlatform} + leetcode + cses), ${scheduled} reviews`);
  return { user, attempts: finalAttempts.length, reviews: scheduled, practicePlatform: cfPlatform };
}

// Run directly: `node scripts/seed.js`
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { env } = await import('../src/config/env.js');
  const { connectDb, disconnectDb } = await import('../src/config/db.js');
  if (env.mongoUri === 'memory') {
    console.error('MONGO_URI=memory is wiped when this script exits. Use SEED_ON_START=true with `npm run dev` instead,');
    console.error('or point MONGO_URI at a real MongoDB (local or Atlas) and run `npm run seed` again.');
    process.exit(1);
  }
  try {
    await connectDb(env.mongoUri);
    await seedDemo({ log: console.log });
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exitCode = 1;
  } finally {
    await disconnectDb();
  }
}
