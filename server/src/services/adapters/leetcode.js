/**
 * LeetCode adapter — BEST EFFORT.
 * LeetCode has no official API. We use the public GraphQL endpoint the website itself uses, and only
 * for public profile data (no passwords, no session cookies). It only exposes the ~20 most recent
 * accepted submissions, so we can import recent solves but never failed attempts.
 * Any failure is reported as UNAVAILABLE so the UI can show "LeetCode sync unavailable".
 */
import { fetchJson } from '../../utils/http.js';
import { TtlCache } from '../../utils/cache.js';
import { normalizeTags } from '../../lib/tags.js';
import { normalizeRating } from '../../lib/difficulty.js';
import { AdapterError } from './AdapterError.js';

const ENDPOINT = 'https://leetcode.com/graphql';
const HANDLE_RE = /^[A-Za-z0-9_.-]{1,40}$/;
const activityCache = new TtlCache({ ttlMs: 10 * 60 * 1000 });
const questionCache = new TtlCache({ ttlMs: 7 * 24 * 60 * 60 * 1000, maxEntries: 5000 });

async function gql(query, variables) {
  let data;
  try {
    data = await fetchJson(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Referer: 'https://leetcode.com/' },
      body: JSON.stringify({ query, variables }),
      minGapMs: 700,
      retries: 2,
    });
  } catch (err) {
    throw new AdapterError('UNAVAILABLE', `LeetCode sync unavailable (${err.message})`);
  }
  if (data?.errors?.length) {
    const msg = data.errors[0]?.message || 'GraphQL error';
    if (/does not exist|not found/i.test(msg)) throw new AdapterError('NOT_FOUND', 'LeetCode user not found');
    throw new AdapterError('UNAVAILABLE', `LeetCode sync unavailable (${msg})`);
  }
  if (!data?.data) throw new AdapterError('UNAVAILABLE', 'LeetCode sync unavailable (empty response)');
  return data.data;
}

const USER_QUERY = `query user($username: String!) { matchedUser(username: $username) { username } }`;
const RECENT_AC_QUERY = `query recentAc($username: String!, $limit: Int!) {
  recentAcSubmissionList(username: $username, limit: $limit) { id title titleSlug timestamp }
}`;
const QUESTION_QUERY = `query q($titleSlug: String!) {
  question(titleSlug: $titleSlug) { questionFrontendId title titleSlug difficulty topicTags { name } }
}`;

async function fetchQuestion(slug) {
  return questionCache.wrap(slug, async () => {
    const { question } = await gql(QUESTION_QUERY, { titleSlug: slug });
    if (!question) return null;
    return {
      externalId: question.titleSlug,
      title: `${question.questionFrontendId}. ${question.title}`,
      url: `https://leetcode.com/problems/${question.titleSlug}/`,
      tags: normalizeTags(question.topicTags.map((t) => t.name)),
      difficultyLabel: question.difficulty,
      rating: normalizeRating('leetcode', question.difficulty),
    };
  });
}

export const leetcode = {
  platform: 'leetcode',
  displayName: 'LeetCode',
  // Only recent solves are visible, so sync must never move an existing solve date forward.
  partialHistory: true,

  validateHandle(handle) {
    return HANDLE_RE.test(handle);
  },

  async verifyHandle(handle) {
    if (!this.validateHandle(handle)) throw new AdapterError('INVALID', 'Invalid LeetCode username');
    const { matchedUser } = await gql(USER_QUERY, { username: handle });
    if (!matchedUser) throw new AdapterError('NOT_FOUND', 'LeetCode user not found');
    return { handle: matchedUser.username };
  },

  async fetchActivity(handle) {
    return activityCache.wrap(handle.toLowerCase(), async () => {
      const { recentAcSubmissionList } = await gql(RECENT_AC_QUERY, { username: handle, limit: 20 });
      if (!Array.isArray(recentAcSubmissionList)) {
        throw new AdapterError('UNAVAILABLE', 'LeetCode sync unavailable (unexpected response)');
      }
      // Earliest visible accepted submission per problem.
      const firstAc = new Map();
      for (const s of recentAcSubmissionList) {
        const at = new Date(Number(s.timestamp) * 1000);
        const prev = firstAc.get(s.titleSlug);
        if (!prev || at < prev.at) firstAc.set(s.titleSlug, { at, count: (prev?.count || 0) + 1 });
        else prev.count++;
      }
      const problems = [];
      const attempts = [];
      for (const [slug, { at, count }] of firstAc) {
        const problem = await fetchQuestion(slug);
        if (!problem) continue;
        problems.push(problem);
        attempts.push({ externalId: slug, status: 'solved', date: at, wrongSubmissions: 0, submissionCount: count });
      }
      return { problems, attempts };
    });
  },
};
