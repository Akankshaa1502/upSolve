import mongoose from 'mongoose';

export const SYNC_PLATFORMS = ['codeforces', 'leetcode', 'atcoder'];

const platformAccountSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    platform: { type: String, enum: SYNC_PLATFORMS, required: true },
    handle: { type: String, required: true, trim: true, maxlength: 64 },
    // never: not synced yet · ok · error: last sync failed · unavailable: platform API unreachable/blocked
    status: { type: String, enum: ['never', 'syncing', 'ok', 'error', 'unavailable'], default: 'never' },
    syncStartedAt: Date,
    lastSyncedAt: Date,
    lastSyncError: String,
    lastSyncStats: {
      problems: Number,
      solved: Number,
      attempted: Number,
      newAttempts: Number,
    },
  },
  { timestamps: true },
);

platformAccountSchema.index({ user: 1, platform: 1 }, { unique: true });

export const PlatformAccount = mongoose.model('PlatformAccount', platformAccountSchema);
