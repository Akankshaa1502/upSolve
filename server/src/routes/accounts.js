import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { ok } from '../utils/respond.js';
import { ApiError } from '../utils/ApiError.js';
import { Attempt, PlatformAccount, SYNC_PLATFORMS } from '../models/index.js';
import { objectId } from './schemas.js';
import { getAdapter, AdapterError } from '../services/adapters/index.js';
import { syncAccount } from '../services/sync.js';

const router = Router();

const connectSchema = z.object({
  platform: z.enum(SYNC_PLATFORMS),
  handle: z.string().trim().min(1, 'Handle is required').max(64),
});

router.get('/', async (req, res) => {
  const accounts = await PlatformAccount.find({ user: req.userId }).sort({ platform: 1 }).lean();
  ok(res, { accounts });
});

/**
 * Connects (or re-points) a handle. We try to verify it exists; if the platform is down we still
 * save it (status "unavailable") so the user can sync later — a hard failure only for bad handles.
 */
router.post('/', validate(connectSchema), async (req, res) => {
  const { platform, handle } = req.valid.body;
  const adapter = getAdapter(platform);
  if (!adapter.validateHandle(handle)) throw ApiError.badRequest(`"${handle}" is not a valid ${adapter.displayName} handle`);

  let canonical = handle;
  let status = 'never';
  let lastSyncError;
  try {
    canonical = (await adapter.verifyHandle(handle)).handle;
  } catch (err) {
    if (!(err instanceof AdapterError)) throw err;
    if (err.code !== 'UNAVAILABLE') throw ApiError.badRequest(err.message);
    status = 'unavailable';
    lastSyncError = err.message;
  }

  const existing = await PlatformAccount.findOne({ user: req.userId, platform });
  if (existing && existing.handle.toLowerCase() !== canonical.toLowerCase()) {
    // Different handle: drop the old handle's imported attempts so data doesn't mix.
    await Attempt.deleteMany({ user: req.userId, platform, source: 'synced' });
  }
  const account = await PlatformAccount.findOneAndUpdate(
    { user: req.userId, platform },
    { $set: { handle: canonical, status, lastSyncError }, $unset: { lastSyncedAt: 1, lastSyncStats: 1 } },
    { upsert: true, new: true },
  );
  ok(res, { account }, existing ? 200 : 201);
});

router.delete('/:id', validate(objectId, 'params'), async (req, res) => {
  const account = await PlatformAccount.findOneAndDelete({ _id: req.valid.params.id, user: req.userId });
  if (!account) throw ApiError.notFound('Account not found');
  const purge = req.query.keepData !== 'true';
  const { deletedCount } = purge
    ? await Attempt.deleteMany({ user: req.userId, platform: account.platform, source: 'synced' })
    : { deletedCount: 0 };
  ok(res, { deleted: true, removedAttempts: deletedCount });
});

router.post('/:id/sync', validate(objectId, 'params'), async (req, res) => {
  const account = await syncAccount(req.valid.params.id, req.userId);
  ok(res, { account });
});

export default router;
