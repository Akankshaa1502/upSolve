import { useState } from 'react';
import { api, describeError } from '../api.js';
import { formatDate } from '../hooks.js';
import ProblemLink, { DifficultyBadge, PlatformBadge } from './ProblemLink.jsx';

const REASONS = { attempted: 'Unsolved', gave_up: 'Gave up', slow: 'Solved slowly' };
const INTERVALS = [1, 3, 7, 21];

function dueLabel(dueAt) {
  const due = new Date(dueAt);
  if (due.toDateString() === new Date().toDateString()) return 'Due today';
  return due < new Date() ? `Overdue since ${formatDate(due)}` : `Due ${formatDate(due)}`;
}

/** One problem in the revisit queue with its 1/3/7/21-day progress and the two outcome buttons. */
export default function ReviewItem({ review, onChange, compact = false }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function record(result) {
    setBusy(true);
    setError('');
    try {
      await api(`/reviews/${review._id}/result`, { method: 'POST', body: { result } });
      onChange?.();
    } catch (err) {
      setError(describeError(err));
      setBusy(false);
    }
  }

  const active = review.status === 'active';
  return (
    <li className="review-item">
      <div className="review-main">
        <div className="review-title">
          <ProblemLink problem={review.problem} />
        </div>
        <div className="meta">
          {review.problem && <PlatformBadge platform={review.problem.platform} />}
          <DifficultyBadge problem={review.problem} />
          <span className={`badge reason r-${review.reason}`}>{REASONS[review.reason]}</span>
          {!compact && (
            <span className="stages" title="Review steps: 1, 3, 7 and 21 days">
              {INTERVALS.map((d, i) => (
                <span key={d} className={`stage ${i < review.stage ? 'done' : i === review.stage && active ? 'current' : ''}`}>{d}d</span>
              ))}
            </span>
          )}
          <span className="muted small">
            {active ? dueLabel(review.dueAt) : `Completed ${formatDate(review.completedAt)}`}
          </span>
        </div>
        {error && <div className="alert error small">{error}</div>}
      </div>
      {active && onChange && (
        <div className="review-actions">
          <button className="btn primary sm" disabled={busy} onClick={() => record('solved')}>Solved it</button>
          <button className="btn sm" disabled={busy} onClick={() => record('failed')}>Still stuck</button>
        </div>
      )}
    </li>
  );
}
