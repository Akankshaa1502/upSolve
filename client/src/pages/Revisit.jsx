import { useState } from 'react';
import { tz } from '../api.js';
import { useApi } from '../hooks.js';
import ReviewItem from '../components/ReviewItem.jsx';
import { PageTitle } from '../components/Terminal.jsx';

const SCOPES = [
  ['due', 'Due today'],
  ['upcoming', 'Upcoming'],
  ['completed', 'Completed'],
];

const EMPTY = {
  due: 'Nothing due today. Nice work!',
  upcoming: 'Nothing scheduled. Problems you give up on, leave unsolved, or solve slowly will show up here.',
  completed: 'No finished reviews yet. A problem completes after you solve it at the 21-day review.',
};

export default function Revisit() {
  const [scope, setScope] = useState('due');
  const { data, error, loading, reload } = useApi('/reviews', { scope, tz });

  return (
    <div className="stack-lg">
      <div className="page-head">
        <PageTitle name="revisit"> spaced repetition: back after 1, 3, 7 and 21 days. "Still stuck" restarts at 1 day</PageTitle>
      </div>
      <div className="tabs" role="tablist">
        {SCOPES.map(([key, label]) => (
          <button key={key} role="tab" aria-selected={scope === key} className={scope === key ? 'active' : ''} onClick={() => setScope(key)}>
            {label}{scope === key && data ? ` (${data.reviews.length})` : ''}
          </button>
        ))}
      </div>
      <section className="card">
        {loading && !data && <p className="muted">Loading…</p>}
        {error && <div className="alert error">{error.message}</div>}
        {data && !data.reviews.length && <p className="muted empty">{EMPTY[scope]}</p>}
        <ul className="review-list">
          {data?.reviews.map((r) => <ReviewItem key={r._id} review={r} onChange={scope === 'completed' ? undefined : reload} />)}
        </ul>
      </section>
    </div>
  );
}
