import mongoose from 'mongoose';

/** Shared problem catalog. One doc per (platform, externalId), regardless of how many users touch it. */
const problemSchema = new mongoose.Schema(
  {
    platform: { type: String, required: true, lowercase: true, trim: true, maxlength: 40 },
    externalId: { type: String, required: true, trim: true, maxlength: 300 },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    url: { type: String, trim: true, maxlength: 500 },
    tags: { type: [String], default: [] },
    // Original label from the platform ("Medium", "1600", "A") for display.
    difficultyLabel: { type: String, trim: true, maxlength: 40 },
    // Normalized Codeforces-like rating used for analytics/recommendations. null = unknown.
    rating: { type: Number, default: null },
    // catalog: imported problem list · synced: seen in a user's submissions · manual: user-entered
    origin: { type: String, enum: ['catalog', 'synced', 'manual'], default: 'catalog' },
  },
  { timestamps: true },
);

problemSchema.index({ platform: 1, externalId: 1 }, { unique: true });
problemSchema.index({ rating: 1, tags: 1 });

export const Problem = mongoose.model('Problem', problemSchema);
