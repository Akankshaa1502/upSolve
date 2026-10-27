import { useState } from 'react';
import { relativeDays } from '../hooks.js';

const COLUMNS = [
  ['topic', 'Topic'],
  ['attempts', 'Tried'],
  ['solveRate', 'Solve rate'],
  ['failedAttempts', 'Failures'],
  ['lastPracticed', 'Last practised'],
  ['weakness', 'Weakness'],
];

/** Full per-topic stats; doubles as the accessible table view of the topic chart. */
export default function TopicTable({ topics }) {
  const [sort, setSort] = useState({ key: 'weakness', dir: -1 });
  const rows = [...topics].sort((a, b) => {
    const av = a[sort.key] ?? '';
    const bv = b[sort.key] ?? '';
    return (av > bv ? 1 : av < bv ? -1 : 0) * sort.dir;
  });
  const toggle = (key) => setSort((s) => ({ key, dir: s.key === key ? -s.dir : key === 'topic' ? 1 : -1 }));

  if (!topics.length) return <p className="muted empty">No topic data yet.</p>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {COLUMNS.map(([key, label]) => (
              <th key={key} className={key === 'topic' ? '' : 'num'} aria-sort={sort.key === key ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}>
                <button className="th-btn" onClick={() => toggle(key)}>
                  {label}{sort.key === key ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.topic}>
              <td>{t.topic}</td>
              <td className="num">{t.attempts}</td>
              <td className="num">{Math.round(t.solveRate * 100)}%</td>
              <td className="num">{t.failedAttempts}</td>
              <td className="num">{t.lastPracticed ? relativeDays(t.lastPracticed) : '—'}</td>
              <td className="num">
                <span className="meter" aria-hidden><span style={{ width: `${t.weakness}%` }} /></span>
                {t.weakness}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
