import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { ok } from '../utils/respond.js';
import { ATTEMPT_STATUSES } from '../models/index.js';
import { objectId } from './schemas.js';
import { createManualAttempt, updateManualAttempt, deleteManualAttempt, listAttempts } from '../services/attempts.js';

const router = Router();

const notFuture = (d) => d.getTime() <= Date.now() + 24 * 60 * 60 * 1000; // allow timezone slack
const date = z.coerce.date().refine(notFuture, 'Date cannot be in the future');

const createSchema = z.object({
  platform: z.string().trim().min(1, 'Platform is required').max(40),
  title: z.string().trim().min(1, 'Title is required').max(200),
  url: z.union([z.literal(''), z.string().trim().url('Enter a valid URL').max(500)]).optional().transform((v) => v || undefined),
  tags: z.array(z.string().trim().min(1).max(40)).max(15).default([]),
  difficulty: z.union([z.string().trim().max(40), z.number().min(0).max(5000)]).optional()
    .transform((v) => (v === '' ? undefined : v)),
  status: z.enum(ATTEMPT_STATUSES),
  date: date.optional(),
  timeTakenMin: z.coerce.number().int().min(0).max(1440).optional(),
  notes: z.string().max(2000).optional(),
});

const updateSchema = z
  .object({
    status: z.enum(ATTEMPT_STATUSES).optional(),
    date: date.optional(),
    timeTakenMin: z.coerce.number().int().min(0).max(1440).nullable().optional(),
    notes: z.string().max(2000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

const listSchema = z.object({
  status: z.enum(ATTEMPT_STATUSES).optional(),
  platform: z.string().trim().toLowerCase().max(40).optional(),
  source: z.enum(['synced', 'manual']).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

router.get('/', validate(listSchema, 'query'), async (req, res) => {
  ok(res, await listAttempts(req.userId, req.valid.query));
});

router.post('/', validate(createSchema), async (req, res) => {
  ok(res, await createManualAttempt(req.userId, req.valid.body), 201);
});

router.patch('/:id', validate(objectId, 'params'), validate(updateSchema), async (req, res) => {
  ok(res, { attempt: await updateManualAttempt(req.userId, req.valid.params.id, req.valid.body) });
});

router.delete('/:id', validate(objectId, 'params'), async (req, res) => {
  await deleteManualAttempt(req.userId, req.valid.params.id);
  ok(res, { deleted: true });
});

export default router;
