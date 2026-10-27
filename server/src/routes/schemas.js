import { z } from 'zod';
import mongoose from 'mongoose';
import { clampOffset } from '../lib/dates.js';

/** `:id` route param that must be a Mongo ObjectId. */
export const objectId = z.object({
  id: z.string().refine((v) => mongoose.isValidObjectId(v), 'Invalid id'),
});

/** `?tz=<minutes east of UTC>` sent by the browser so "today" means the user's today. */
export const tzQuery = z.object({
  tz: z.coerce.number().optional().transform((v) => clampOffset(v ?? 0)),
});
