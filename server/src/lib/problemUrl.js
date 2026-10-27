/**
 * Recognizes problem URLs from the synced platforms so a manual entry for, say, a Codeforces
 * problem lands on the same catalog doc the Codeforces sync uses (no duplicates).
 */
const PATTERNS = [
  { platform: 'codeforces', re: /codeforces\.com\/(?:problemset\/problem|contest|gym)\/(\d+)\/(?:problem\/)?([A-Za-z]\d?)/i, id: (m) => `${m[1]}${m[2].toUpperCase()}` },
  { platform: 'leetcode', re: /leetcode\.(?:com|cn)\/problems\/([a-z0-9-]+)/i, id: (m) => m[1].toLowerCase() },
  { platform: 'atcoder', re: /atcoder\.jp\/contests\/[^/]+\/tasks\/([A-Za-z0-9_]+)/i, id: (m) => m[1].toLowerCase() },
];

export function parseProblemUrl(url) {
  if (!url) return null;
  for (const p of PATTERNS) {
    const m = String(url).match(p.re);
    if (m) return { platform: p.platform, externalId: p.id(m) };
  }
  return null;
}

/** Stable id for problems on other platforms: normalized URL, or a slug of the title. */
export function fallbackExternalId(url, title) {
  if (url) {
    try {
      const u = new URL(url);
      return `${u.host.replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '')}`.toLowerCase();
    } catch {
      /* not a valid URL: fall through to title */
    }
  }
  const slug = String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `title:${slug || 'untitled'}`;
}
