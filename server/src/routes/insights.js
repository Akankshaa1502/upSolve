import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { ok } from '../utils/respond.js';
import { objectId, tzQuery } from './schemas.js';
import { getSummary, getTodayRecommendations } from '../services/analytics.js';
import { listReviews, recordReviewResult } from '../services/reviews.js';

/** Analytics, recommendations and the revisit queue: everything derived from attempt history. */
export const analyticsRouter = Router();
analyticsRouter.get('/summary', validate(tzQuery, 'query'), async (req, res) => {
  ok(res, await getSummary(req.userId, { offsetMin: req.valid.query.tz }));
});

export const recommendationsRouter = Router();
recommendationsRouter.get('/today', validate(tzQuery, 'query'), async (req, res) => {
  ok(res, await getTodayRecommendations(req.userId, { offsetMin: req.valid.query.tz }));
});

export const reviewsRouter = Router();
const listSchema = tzQuery.extend({ scope: z.enum(['due', 'upcoming', 'completed', 'all']).default('due') });
reviewsRouter.get('/', validate(listSchema, 'query'), async (req, res) => {
  const { scope, tz } = req.valid.query;
  ok(res, { scope, reviews: await listReviews(req.userId, { scope, offsetMin: tz }) });
});

const resultSchema = z.object({ result: z.enum(['solved', 'failed']) });
reviewsRouter.post('/:id/result', validate(objectId, 'params'), validate(resultSchema), async (req, res) => {
  ok(res, { review: await recordReviewResult(req.userId, req.valid.params.id, req.valid.body.result) });
});
