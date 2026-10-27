/**
 * Normalizes topic tags from different platforms into one vocabulary (Codeforces-style, lowercase),
 * so "Dynamic Programming" on LeetCode and "dp" on Codeforces count as the same topic.
 */
const ALIASES = {
  'dynamic programming': 'dp',
  'memoization': 'dp',
  'graph': 'graphs',
  'graph theory': 'graphs',
  'breadth-first search': 'graphs',
  'depth-first search': 'dfs and similar',
  'dfs': 'dfs and similar',
  'bfs': 'graphs',
  'shortest path': 'shortest paths',
  'binary search': 'binary search',
  'two pointers': 'two pointers',
  'sliding window': 'two pointers',
  'math': 'math',
  'mathematics': 'math',
  'number theory': 'number theory',
  'combinatorics': 'combinatorics',
  'greedy': 'greedy',
  'sorting': 'sortings',
  'sort': 'sortings',
  'sortings': 'sortings',
  'string': 'strings',
  'strings': 'strings',
  'string matching': 'strings',
  'hash table': 'hashing',
  'hash function': 'hashing',
  'rolling hash': 'hashing',
  'tree': 'trees',
  'binary tree': 'trees',
  'binary search tree': 'trees',
  'segment tree': 'data structures',
  'binary indexed tree': 'data structures',
  'heap (priority queue)': 'data structures',
  'stack': 'data structures',
  'monotonic stack': 'data structures',
  'queue': 'data structures',
  'linked list': 'data structures',
  'union find': 'dsu',
  'disjoint set union': 'dsu',
  'bit manipulation': 'bitmasks',
  'bitmask': 'bitmasks',
  'backtracking': 'brute force',
  'recursion': 'brute force',
  'simulation': 'implementation',
  'geometry': 'geometry',
  'topological sort': 'graphs',
  'prefix sum': 'prefix sums',
  'game theory': 'games',
  'interactive': 'interactive',
};

// Tags that describe format, not skill, so they would only add noise to weakness analysis.
const IGNORED = new Set(['*special', 'schedules', 'expression parsing', 'database', 'shell', 'concurrency']);

export function normalizeTag(raw) {
  const t = String(raw || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!t || IGNORED.has(t)) return null;
  return ALIASES[t] ?? t;
}

export function normalizeTags(list) {
  const out = new Set();
  for (const raw of list || []) {
    const t = normalizeTag(raw);
    if (t) out.add(t.slice(0, 40));
  }
  return [...out];
}
