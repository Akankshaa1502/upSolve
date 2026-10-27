import mongoose from 'mongoose';

/** Spaced-repetition entry: a problem comes back after 1, 3, 7 and 21 days. One per (user, problem). */
const reviewScheduleSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    problem: { type: mongoose.Schema.Types.ObjectId, ref: 'Problem', required: true },
    reason: { type: String, enum: ['attempted', 'gave_up', 'slow'], required: true },
    stage: { type: Number, default: 0, min: 0 }, // index into REVIEW_INTERVALS_DAYS
    dueAt: { type: Date, required: true },
    status: { type: String, enum: ['active', 'completed'], default: 'active' },
    completedAt: Date,
    history: [
      {
        _id: false,
        at: { type: Date, required: true },
        result: { type: String, enum: ['solved', 'failed'], required: true },
      },
    ],
  },
  { timestamps: true },
);

reviewScheduleSchema.index({ user: 1, problem: 1 }, { unique: true });
reviewScheduleSchema.index({ user: 1, status: 1, dueAt: 1 });

export const ReviewSchedule = mongoose.model('ReviewSchedule', reviewScheduleSchema);
