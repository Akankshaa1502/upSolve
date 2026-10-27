import mongoose from 'mongoose';

export const ATTEMPT_STATUSES = ['solved', 'attempted', 'gave_up'];

/**
 * One practice event on a problem.
 *  - manual: each entry is its own event.
 *  - synced: aggregated, exactly one doc per (user, problem) — upserted on every sync (idempotent).
 */
const attemptSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    problem: { type: mongoose.Schema.Types.ObjectId, ref: 'Problem', required: true },
    platform: { type: String, required: true }, // denormalized for cheap platform counts
    source: { type: String, enum: ['synced', 'manual'], required: true },
    status: { type: String, enum: ATTEMPT_STATUSES, required: true },
    date: { type: Date, required: true },
    timeTakenMin: { type: Number, min: 0, max: 24 * 60 },
    notes: { type: String, maxlength: 2000, default: '' },
    // synced only
    wrongSubmissions: { type: Number, default: 0 },
    submissionCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

attemptSchema.index({ user: 1, date: -1 });
attemptSchema.index({ user: 1, problem: 1 });
attemptSchema.index(
  { user: 1, problem: 1, source: 1 },
  { unique: true, partialFilterExpression: { source: 'synced' } },
);

export const Attempt = mongoose.model('Attempt', attemptSchema);
