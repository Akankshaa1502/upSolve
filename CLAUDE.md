# upsolve — project notes for Claude

A competitive-programming coach: imports solved/attempted problems from Codeforces, LeetCode and
AtCoder (plus manual entries from any platform), scores weak topics, recommends 3 problems a day and
brings failed/slow problems back on a 1/3/7/21-day spaced-repetition schedule.

## Plan (build order)
1. Setup + auth (Express, Mongoose, JWT, bcrypt, consistent response envelope, error handling)
2. Models + manual entry (User, PlatformAccount, Problem, Attempt, ReviewSchedule)
3. Codeforces adapter + idempotent sync service
4. Analytics + weakness scoring (pure functions, unit tested)
5. Recommendations + revisit queue (pure functions, unit tested)
6. React dashboard (Vite + Recharts)
7. LeetCode + AtCoder adapters (best-effort)
8. Polish: seed/demo data, README

## Folder structure
```
/server
  src/
    app.js              express app (no listen) — used by tests
    index.js            boots DB + listens
    config/             env parsing, db connection (supports MONGO_URI=memory)
    middleware/         auth (JWT), validate (zod), error handler
    models/             Mongoose models
    routes/             auth, problems/attempts, accounts (sync), analytics, recommendations, reviews
    services/
      adapters/         codeforces.js, leetcode.js, atcoder.js — same interface, normalized output
      sync.js           runs an adapter and upserts into the DB idempotently
      analytics.js      loads attempts → pure lib functions
      reviews.js        creates/advances ReviewSchedule docs
    lib/                PURE logic (no DB/IO): scoring.js, analytics.js, reviewSchedule.js, rng.js
    utils/              http (throttle/retry/backoff), ttl cache, ApiError, asyncHandler
  scripts/seed.js       demo user + realistic data
  test/                 node:test unit tests (lib) + API integration tests (in-memory Mongo)
/client                 Vite + React + Recharts SPA, proxies /api to the server
```

## Conventions
- ESM everywhere (`"type": "module"`). Tests use the built-in `node:test` runner (no Jest).
- Every API response: `{ ok: true, data }` or `{ ok: false, error: { code, message, details? } }`.
- Input validation with zod via `validate()` middleware. Throw `ApiError` for expected failures.
- Pure logic lives in `server/src/lib` and must stay free of Mongoose/IO so it is unit-testable.

## Decisions made autonomously
- **DB without install:** `MONGO_URI=memory` starts `mongodb-memory-server` (data is lost on restart;
  `SEED_ON_START=true` re-seeds the demo user). Any real Mongo URI (local/Atlas) works unchanged.
- **Problem catalog is shared** across users, unique on `(platform, externalId)`. Manual problems use
  the normalized URL (or a title slug) as `externalId`, so the same CSES problem entered twice is one doc.
- **Synced attempts are aggregated per problem**: one Attempt per `(user, problem, source=synced)`,
  upserted on every sync → sync is idempotent. Manual attempts are individual events (many allowed).
- **Revisit queue for synced problems** only covers unsolved problems last attempted in the past 60
  days, so importing a 5-year history does not flood "Due today".
- **"Solved slowly"** = time taken above an expected time derived from rating (see `lib/reviewSchedule.js`).
  Only manual entries carry time taken (platform APIs do not expose it).
- **Review outcome:** "solved" advances 1→3→7→21 days then completes; "failed" resets to day 1.
- **Daily recommendations** are deterministic per user+day (seeded RNG) instead of stored, so the
  3 picks are stable all day and no extra model is needed.
- **Difficulty normalization:** Codeforces rating as-is; LeetCode Easy/Medium/Hard → 1200/1600/2000;
  AtCoder kenkoooo difficulty (low-end corrected) used as an approximate rating. AtCoder has no tags.
- **LeetCode** only returns the last ~20 accepted submissions publicly, so it imports solved problems
  only. Failures become `status: unavailable` on the account and the UI shows "LeetCode sync unavailable".
- **Recommendation candidates** come from the catalog (mostly Codeforces problemset, refreshed at most
  every 24h on sync / seed). Untagged/unrated problems are never recommended.

- **Production** serves `client/dist` from Express (single-service deploy); a separate frontend host
  works via `VITE_API_URL` + `CLIENT_ORIGIN`.
- **Login rate limit:** 30 requests / 15 min / IP on `/api/auth/*`.

## Status (2026-10-27)
All 8 build phases done. 51 server tests pass. Verified live: Codeforces (tourist, 3157 problems),
LeetCode (lee215, 19 recent solves), AtCoder (tourist, 1067 problems); re-sync inserts 0 duplicates.
UI checked in headless Edge (light/dark, 390px mobile, no console errors).

## Commands
- `cd server && npm test` — unit + API tests
- `cd server && npm run dev` — API on :4000
- `cd server && npm run seed` — demo user `demo@upsolve.dev` / `demo1234`
- `cd client && npm run dev` — UI on :5173
