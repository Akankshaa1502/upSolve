/**
 * API integration tests against an in-memory MongoDB. Platform adapters are replaced with fakes,
 * so these tests never touch the network.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import '../src/models/index.js';
import { connectDb, disconnectDb } from '../src/config/db.js';
import { createApp } from '../src/app.js';
import { setAdapterForTests, AdapterError } from '../src/services/adapters/index.js';
import { resetCatalogStateForTests } from '../src/services/catalog.js';
import { Attempt, Problem, ReviewSchedule } from '../src/models/index.js';
import { parseProblemUrl } from '../src/lib/problemUrl.js';

const DAY = 86400000;
const app = createApp();
let token;
const auth = () => ({ Authorization: `Bearer ${token}` });

const fakeCatalog = [];
for (const tag of ['dp', 'graphs', 'greedy', 'math']) {
  for (let r = 800; r <= 2000; r += 100) {
    fakeCatalog.push({ externalId: `${r}${tag}`, title: `${tag} ${r}`, url: `https://codeforces.com/contest/${r}/problem/${tag}`, tags: [tag], rating: r, difficultyLabel: String(r) });
  }
}

const fakeCodeforces = {
  platform: 'codeforces',
  displayName: 'Codeforces',
  partialHistory: false,
  validateHandle: (h) => /^[A-Za-z0-9_.-]{3,24}$/.test(h),
  async verifyHandle(handle) {
    if (handle === 'ghost_user') throw new AdapterError('NOT_FOUND', 'Codeforces handle not found');
    return { handle };
  },
  async fetchActivity() {
    const now = Date.now();
    return {
      problems: [
        { externalId: '1000dp', title: 'dp 1000', tags: ['dp'], rating: 1000 },
        { externalId: '1100greedy', title: 'greedy 1100', tags: ['greedy'], rating: 1100 },
        { externalId: '1200graphs', title: 'graphs 1200', tags: ['graphs'], rating: 1200 },
      ],
      attempts: [
        { externalId: '1000dp', status: 'solved', date: new Date(now - 5 * DAY), wrongSubmissions: 2, submissionCount: 3 },
        { externalId: '1100greedy', status: 'solved', date: new Date(now - 3 * DAY), wrongSubmissions: 0, submissionCount: 1 },
        { externalId: '1200graphs', status: 'attempted', date: new Date(now - 2 * DAY), wrongSubmissions: 4, submissionCount: 4 },
      ],
    };
  },
  async fetchCatalog() {
    return fakeCatalog;
  },
};

const brokenLeetcode = {
  platform: 'leetcode',
  displayName: 'LeetCode',
  partialHistory: true,
  validateHandle: () => true,
  verifyHandle: async (handle) => ({ handle }),
  fetchActivity: async () => {
    throw new AdapterError('UNAVAILABLE', 'LeetCode sync unavailable (HTTP 403)');
  },
};

before(async () => {
  setAdapterForTests('codeforces', fakeCodeforces);
  setAdapterForTests('leetcode', brokenLeetcode);
  resetCatalogStateForTests();
  await connectDb('memory');
});
after(disconnectDb);

describe('auth', () => {
  test('register validates input', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'nope', password: '1' });
    assert.equal(res.status, 400);
    assert.equal(res.body.ok, false);
    assert.equal(res.body.error.code, 'BAD_REQUEST');
    assert.ok(res.body.error.details.length >= 2);
  });

  test('register → token, no password hash leaked', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'Ann@Example.com', password: 'hunter22', name: 'Ann' });
    assert.equal(res.status, 201);
    assert.ok(res.body.data.token);
    assert.equal(res.body.data.user.email, 'ann@example.com');
    assert.equal(res.body.data.user.passwordHash, undefined);
    token = res.body.data.token;
  });

  test('duplicate email → 409', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'ann@example.com', password: 'hunter22' });
    assert.equal(res.status, 409);
  });

  test('login ok / wrong password', async () => {
    const good = await request(app).post('/api/auth/login').send({ email: 'ann@example.com', password: 'hunter22' });
    assert.equal(good.status, 200);
    const bad = await request(app).post('/api/auth/login').send({ email: 'ann@example.com', password: 'wrongpass' });
    assert.equal(bad.status, 401);
    assert.equal(bad.body.error.message, 'Invalid email or password');
  });

  test('protected routes need a valid token', async () => {
    assert.equal((await request(app).get('/api/attempts')).status, 401);
    assert.equal((await request(app).get('/api/attempts').set('Authorization', 'Bearer garbage')).status, 401);
    const me = await request(app).get('/api/auth/me').set(auth());
    assert.equal(me.body.data.user.name, 'Ann');
  });

  test('unknown routes and malformed JSON use the error envelope', async () => {
    const nf = await request(app).get('/api/nope');
    assert.equal(nf.status, 404);
    assert.equal(nf.body.ok, false);
    const bad = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{bad');
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error.message, 'Malformed JSON body');
  });
});

describe('manual entry', () => {
  test('rejects invalid entries', async () => {
    const res = await request(app).post('/api/attempts').set(auth()).send({ platform: '', title: '', status: 'maybe', url: 'not a url' });
    assert.equal(res.status, 400);
    const future = await request(app).post('/api/attempts').set(auth())
      .send({ platform: 'CSES', title: 'X', status: 'solved', date: new Date(Date.now() + 10 * DAY).toISOString() });
    assert.equal(future.status, 400);
  });

  test('gave up → scheduled for review in 1 day', async () => {
    const res = await request(app).post('/api/attempts').set(auth()).send({
      platform: 'CSES', title: 'Book Shop', url: 'https://cses.fi/problemset/task/1158/', tags: ['Dynamic Programming'],
      difficulty: 1600, status: 'gave_up', timeTakenMin: 50, notes: 'knapsack?',
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.attempt.problem.platform, 'cses');
    assert.deepEqual(res.body.data.attempt.problem.tags, ['dp']);
    assert.equal(res.body.data.review.reason, 'gave_up');
    const dueIn = new Date(res.body.data.review.dueAt) - Date.now();
    assert.ok(dueIn > 0.9 * DAY && dueIn <= DAY);
  });

  test('same URL twice reuses the problem (no duplicate)', async () => {
    await request(app).post('/api/attempts').set(auth()).send({ platform: 'cses', title: 'Book Shop', url: 'https://cses.fi/problemset/task/1158', status: 'solved', timeTakenMin: 20 });
    assert.equal(await Problem.countDocuments({ platform: 'cses' }), 1);
    assert.equal(await ReviewSchedule.countDocuments({}), 1);
  });

  test('slow solve is scheduled, fast solve is not', async () => {
    const slow = await request(app).post('/api/attempts').set(auth()).send({ platform: 'kattis', title: 'Slowpoke', difficulty: 1000, status: 'solved', timeTakenMin: 120 });
    assert.equal(slow.body.data.review.reason, 'slow');
    const fast = await request(app).post('/api/attempts').set(auth()).send({ platform: 'kattis', title: 'Speedy', difficulty: 1000, status: 'solved', timeTakenMin: 10 });
    assert.equal(fast.body.data.review, null);
  });

  test('known platform URLs map to the synced problem id', () => {
    assert.deepEqual(parseProblemUrl('https://codeforces.com/problemset/problem/1234/c'), { platform: 'codeforces', externalId: '1234C' });
    assert.deepEqual(parseProblemUrl('https://codeforces.com/contest/1850/problem/A'), { platform: 'codeforces', externalId: '1850A' });
    assert.deepEqual(parseProblemUrl('https://leetcode.com/problems/two-sum/description/'), { platform: 'leetcode', externalId: 'two-sum' });
    assert.deepEqual(parseProblemUrl('https://atcoder.jp/contests/abc300/tasks/abc300_a'), { platform: 'atcoder', externalId: 'abc300_a' });
    assert.equal(parseProblemUrl('https://cses.fi/problemset/task/1158'), null);
  });

  test('list, filter, edit and delete', async () => {
    const list = await request(app).get('/api/attempts?platform=kattis').set(auth());
    assert.equal(list.body.data.total, 2);
    const id = list.body.data.items[0]._id;
    const patched = await request(app).patch(`/api/attempts/${id}`).set(auth()).send({ notes: 'edited' });
    assert.equal(patched.body.data.attempt.notes, 'edited');
    assert.equal((await request(app).patch(`/api/attempts/${id}`).set(auth()).send({})).status, 400);
    assert.equal((await request(app).delete(`/api/attempts/${id}`).set(auth())).status, 200);
    assert.equal((await request(app).delete(`/api/attempts/${id}`).set(auth())).status, 404);
    assert.equal((await request(app).delete('/api/attempts/not-an-id').set(auth())).status, 400);
    const search = await request(app).get('/api/attempts?q=book').set(auth());
    assert.equal(search.body.data.total, 2);
  });
});

describe('platform sync', () => {
  let accountId;

  test('rejects malformed and unknown handles', async () => {
    assert.equal((await request(app).post('/api/accounts').set(auth()).send({ platform: 'codeforces', handle: 'a b' })).status, 400);
    assert.equal((await request(app).post('/api/accounts').set(auth()).send({ platform: 'topcoder', handle: 'abc' })).status, 400);
    const ghost = await request(app).post('/api/accounts').set(auth()).send({ platform: 'codeforces', handle: 'ghost_user' });
    assert.equal(ghost.status, 400);
    assert.match(ghost.body.error.message, /not found/);
  });

  test('connect + sync imports attempts and schedules recent failures', async () => {
    const res = await request(app).post('/api/accounts').set(auth()).send({ platform: 'codeforces', handle: 'ann_cf' });
    assert.equal(res.status, 201);
    accountId = res.body.data.account._id;
    const sync = await request(app).post(`/api/accounts/${accountId}/sync`).set(auth());
    assert.equal(sync.status, 200);
    assert.equal(sync.body.data.account.status, 'ok');
    assert.deepEqual(
      { ...sync.body.data.account.lastSyncStats },
      { problems: 3, solved: 2, attempted: 1, newAttempts: 3 },
    );
    const graphs = await Problem.findOne({ platform: 'codeforces', externalId: '1200graphs' });
    assert.ok(await ReviewSchedule.exists({ problem: graphs._id, reason: 'attempted' }));
  });

  test('sync is idempotent', async () => {
    const before = await Attempt.countDocuments({ source: 'synced' });
    const again = await request(app).post(`/api/accounts/${accountId}/sync`).set(auth());
    assert.equal(again.body.data.account.lastSyncStats.newAttempts, 0);
    assert.equal(await Attempt.countDocuments({ source: 'synced' }), before);
    assert.equal(await Problem.countDocuments({ platform: 'codeforces', externalId: '1200graphs' }), 1);
  });

  test('sync loads the catalog for recommendations', async () => {
    assert.ok((await Problem.countDocuments({ platform: 'codeforces' })) >= fakeCatalog.length);
  });

  test('unavailable platform degrades gracefully', async () => {
    const acc = await request(app).post('/api/accounts').set(auth()).send({ platform: 'leetcode', handle: 'ann_lc' });
    const res = await request(app).post(`/api/accounts/${acc.body.data.account._id}/sync`).set(auth());
    assert.equal(res.status, 502);
    assert.equal(res.body.error.code, 'UPSTREAM_UNAVAILABLE');
    assert.equal(res.body.error.message, 'LeetCode sync unavailable');
    const list = await request(app).get('/api/accounts').set(auth());
    assert.equal(list.body.data.accounts.find((a) => a.platform === 'leetcode').status, 'unavailable');
  });
});

describe('analytics, recommendations, reviews', () => {
  test('summary has totals, topics, platforms, heatmap and streak', async () => {
    const res = await request(app).get('/api/analytics/summary?tz=330').set(auth());
    assert.equal(res.status, 200);
    const d = res.body.data;
    assert.ok(d.totals.problems >= 5);
    assert.ok(d.topics.some((t) => t.topic === 'dp'));
    for (const t of d.topics) assert.ok(t.weakness >= 0 && t.weakness <= 100);
    assert.ok(d.platforms.some((p) => p.platform === 'codeforces'));
    assert.equal(d.heatmap.length, 365);
    assert.ok(d.streak.current >= 1);
    assert.equal(typeof d.level.level, 'number');
  });

  test('3 recommendations, none already solved or attempted', async () => {
    const res = await request(app).get('/api/recommendations/today').set(auth());
    assert.equal(res.status, 200);
    const { problems, target } = res.body.data;
    assert.equal(problems.length, 3);
    const touched = new Set((await Attempt.find({}).lean()).map((a) => String(a.problem)));
    for (const p of problems) {
      assert.ok(!touched.has(p.id));
      assert.ok(p.rating >= target.min - 300 && p.rating <= target.max + 300);
    }
    const again = await request(app).get('/api/recommendations/today').set(auth());
    assert.deepEqual(again.body.data.problems.map((p) => p.id), problems.map((p) => p.id));
  });

  test('due today → solve advances, fail resets', async () => {
    const due = await request(app).get('/api/reviews?scope=due').set(auth());
    assert.ok(due.body.data.reviews.length >= 1); // synced problem attempted 2 days ago
    const review = due.body.data.reviews[0];
    const solved = await request(app).post(`/api/reviews/${review._id}/result`).set(auth()).send({ result: 'solved' });
    assert.equal(solved.body.data.review.stage, 1);
    const failed = await request(app).post(`/api/reviews/${review._id}/result`).set(auth()).send({ result: 'failed' });
    assert.equal(failed.body.data.review.stage, 0);
    assert.equal(failed.body.data.review.history.length, 2);
    const bad = await request(app).post(`/api/reviews/${review._id}/result`).set(auth()).send({ result: 'meh' });
    assert.equal(bad.status, 400);
    const upcoming = await request(app).get('/api/reviews?scope=upcoming').set(auth());
    assert.ok(upcoming.body.data.reviews.some((r) => r._id === review._id));
  });

  test('users cannot see each other\'s data', async () => {
    const other = await request(app).post('/api/auth/register').send({ email: 'bob@example.com', password: 'hunter22' });
    const bob = { Authorization: `Bearer ${other.body.data.token}` };
    const list = await request(app).get('/api/attempts').set(bob);
    assert.equal(list.body.data.total, 0);
    const reviews = await ReviewSchedule.find({}).lean();
    const res = await request(app).post(`/api/reviews/${reviews[0]._id}/result`).set(bob).send({ result: 'solved' });
    assert.equal(res.status, 404);
  });
});
