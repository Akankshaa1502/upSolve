import { Link } from 'react-router-dom';
import { tz } from '../api.js';
import { useApi } from '../hooks.js';
import TopicChart from '../components/TopicChart.jsx';
import PlatformChart from '../components/PlatformChart.jsx';
import Heatmap from '../components/Heatmap.jsx';
import TopicTable from '../components/TopicTable.jsx';
import ReviewItem from '../components/ReviewItem.jsx';
import ProblemLink, { PlatformBadge } from '../components/ProblemLink.jsx';

function Stat({ label, value, sub }) {
  return (
    <div className="card stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub muted">{sub}</div>}
    </div>
  );
}

function Recommendations() {
  const { data, error, loading } = useApi('/recommendations/today', { tz });
  return (
    <section className="card">
      <div className="card-head">
        <h2>Today's 3 problems</h2>
        {data && <span className="muted small">Target {data.target.min}–{data.target.max}</span>}
      </div>
      {loading && <p className="muted">Picking problems…</p>}
      {error && <div className="alert error">{error.message}</div>}
      {data && !data.problems.length && (
        <p className="muted empty">No candidates yet. Connect Codeforces on the <Link to="/accounts">Accounts</Link> page to load the problem catalog.</p>
      )}
      {data && data.problems.length > 0 && (
        <ol className="rec-list">
          {data.problems.map((p) => (
            <li key={p.id}>
              <div className="rec-title"><ProblemLink problem={p} /></div>
              <div className="meta">
                <PlatformBadge platform={p.platform} />
                <span className="badge subtle">{p.rating}</span>
                {p.tags.slice(0, 4).map((t) => (
                  <span key={t} className={`badge tag ${t === p.focusTopic ? 'focus' : ''}`}>{t}</span>
                ))}
              </div>
              <div className="muted small">{p.reason}</div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function DueToday() {
  const { data, error, loading, reload } = useApi('/reviews', { scope: 'due', tz });
  const reviews = data?.reviews ?? [];
  return (
    <section className="card">
      <div className="card-head">
        <h2>Due today</h2>
        <Link to="/revisit" className="small">Open queue →</Link>
      </div>
      {loading && !data && <p className="muted">Loading…</p>}
      {error && <div className="alert error">{error.message}</div>}
      {data && !reviews.length && <p className="muted empty">Nothing due. Failed or slow problems come back after 1, 3, 7 and 21 days.</p>}
      <ul className="review-list">
        {reviews.slice(0, 5).map((r) => <ReviewItem key={r._id} review={r} onChange={reload} compact />)}
      </ul>
      {reviews.length > 5 && <Link to="/revisit" className="small">+{reviews.length - 5} more</Link>}
    </section>
  );
}

export default function Dashboard() {
  const { data, error, loading } = useApi('/analytics/summary', { tz });

  if (loading && !data) return <p className="muted">Loading your stats…</p>;
  if (error) return <div className="alert error">{error.message}</div>;

  const { totals, streak, level, reviews, topics, platforms, heatmap } = data;
  const weakest = topics.filter((t) => t.attempts >= 2).slice(0, 3);

  return (
    <div className="stack-lg">
      <div className="page-head">
        <h1>Dashboard</h1>
        <Link to="/problems?add=1" className="btn primary">+ Log a problem</Link>
      </div>

      {totals.problems === 0 && (
        <div className="alert info">
          Welcome! <Link to="/accounts">Connect a platform</Link> or <Link to="/problems?add=1">log a problem</Link> to get started.
        </div>
      )}

      <div className="stats">
        <Stat label="Problems solved" value={totals.solved} sub={`${totals.problems} tried · ${totals.attempted + totals.gaveUp} open`} />
        <Stat label="Current streak" value={`${streak.current} day${streak.current === 1 ? '' : 's'}`}
          sub={streak.activeToday ? `Longest ${streak.longest}` : streak.current ? 'Practise today to keep it' : `Longest ${streak.longest}`} />
        <Stat label="Current level" value={level.level} sub={`Median of recent solves · aim ${level.min}–${level.max}`} />
        <Stat label="Due for revisit" value={reviews.dueToday} sub={`${reviews.active} in the queue`} />
      </div>

      <div className="grid-2">
        <Recommendations />
        <DueToday />
      </div>

      <section className="card">
        <div className="card-head">
          <h2>Activity</h2>
          <span className="muted small">Last 12 months</span>
        </div>
        <Heatmap days={heatmap} />
      </section>

      <div className="grid-2 wide-left">
        <section className="card">
          <div className="card-head">
            <h2>Topic strength</h2>
            <span className="muted small">0–100, higher is stronger</span>
          </div>
          {weakest.length > 0 && (
            <p className="small">Weakest right now: {weakest.map((t, i) => <span key={t.topic}><b>{t.topic}</b>{i < weakest.length - 1 ? ', ' : ''}</span>)}</p>
          )}
          <TopicChart topics={topics} />
        </section>
        <section className="card">
          <div className="card-head"><h2>By platform</h2></div>
          <PlatformChart platforms={platforms} />
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <h2>All topics</h2>
          <span className="muted small">Weakness blends solve rate (50%), failures (30%) and time since practice (20%)</span>
        </div>
        <TopicTable topics={topics} />
      </section>
    </div>
  );
}
