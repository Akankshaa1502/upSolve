import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, describeError } from '../api.js';
import { STATUS_LABELS, formatDate, useApi } from '../hooks.js';
import AddProblemForm from '../components/AddProblemForm.jsx';
import ProblemLink, { DifficultyBadge, PlatformBadge } from '../components/ProblemLink.jsx';

function AttemptRow({ attempt, onChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const manual = attempt.source === 'manual';

  async function run(fn) {
    setBusy(true);
    setError('');
    try {
      await fn();
      onChange();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }
  const setStatus = (status) => run(() => api(`/attempts/${attempt._id}`, { method: 'PATCH', body: { status } }));
  const remove = () => {
    if (window.confirm('Delete this entry?')) run(() => api(`/attempts/${attempt._id}`, { method: 'DELETE' }));
  };

  return (
    <tr>
      <td>
        <ProblemLink problem={attempt.problem} />
        {attempt.notes && <div className="muted small note">{attempt.notes}</div>}
        {error && <div className="alert error small">{error}</div>}
      </td>
      <td><PlatformBadge platform={attempt.platform} /></td>
      <td><DifficultyBadge problem={attempt.problem} /></td>
      <td className="tags-cell">{attempt.problem?.tags.slice(0, 3).map((t) => <span key={t} className="badge tag">{t}</span>)}</td>
      <td>
        {manual ? (
          <select className={`status-select s-${attempt.status}`} value={attempt.status} disabled={busy} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        ) : (
          <span className={`status s-${attempt.status}`}>{STATUS_LABELS[attempt.status]}</span>
        )}
      </td>
      <td className="num nowrap">{formatDate(attempt.date)}</td>
      <td className="num">{attempt.timeTakenMin != null ? `${attempt.timeTakenMin}m` : '—'}</td>
      <td>
        <span className="muted small">{manual ? 'manual' : 'synced'}</span>
        {manual && <button className="btn ghost sm danger" disabled={busy} onClick={remove} aria-label="Delete entry">✕</button>}
      </td>
    </tr>
  );
}

export default function Problems() {
  const [params, setParams] = useSearchParams();
  const [showForm, setShowForm] = useState(params.get('add') === '1');
  const [filters, setFilters] = useState({ status: '', platform: '', source: '', q: '' });
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi('/attempts', { ...filters, page, limit: 25 });

  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => (f.q === q ? f : { ...f, q }));
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const setFilter = (k) => (e) => {
    setFilters({ ...filters, [k]: e.target.value });
    setPage(1);
  };
  const closeForm = () => {
    setShowForm(false);
    setParams({});
  };

  return (
    <div className="stack-lg">
      <div className="page-head">
        <h1>Problems</h1>
        {!showForm && <button className="btn primary" onClick={() => setShowForm(true)}>+ Log a problem</button>}
      </div>
      {showForm && <AddProblemForm onSaved={reload} onCancel={closeForm} />}

      <div className="filters">
        <input type="search" placeholder="Search title or tag…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        <select value={filters.status} onChange={setFilter('status')} aria-label="Status">
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filters.platform} onChange={setFilter('platform')} aria-label="Platform">
          <option value="">All platforms</option>
          <option value="codeforces">Codeforces</option>
          <option value="leetcode">LeetCode</option>
          <option value="atcoder">AtCoder</option>
          <option value="cses">CSES</option>
        </select>
        <select value={filters.source} onChange={setFilter('source')} aria-label="Source">
          <option value="">Synced + manual</option>
          <option value="synced">Synced</option>
          <option value="manual">Manual</option>
        </select>
      </div>

      <section className="card flush">
        {error && <div className="alert error">{error.message}</div>}
        {data && !data.items.length && <p className="muted empty pad">No entries match.</p>}
        {data && data.items.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Problem</th><th>Platform</th><th>Difficulty</th><th>Tags</th><th>Status</th><th className="num">Date</th><th className="num">Time</th><th />
                </tr>
              </thead>
              <tbody>
                {data.items.map((a) => <AttemptRow key={a._id} attempt={a} onChange={reload} />)}
              </tbody>
            </table>
          </div>
        )}
        {loading && !data && <p className="muted pad">Loading…</p>}
      </section>

      {data && data.pages > 1 && (
        <div className="pager">
          <button className="btn sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
          <span className="muted small">Page {data.page} of {data.pages} · {data.total} entries</span>
          <button className="btn sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Next →</button>
        </div>
      )}
    </div>
  );
}
