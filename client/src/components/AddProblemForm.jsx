import { useState } from 'react';
import { api, describeError } from '../api.js';

const today = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};

const EMPTY = { platform: '', title: '', url: '', tags: '', difficulty: '', status: 'solved', date: today(), timeTakenMin: '', notes: '' };
const PLATFORM_SUGGESTIONS = ['Codeforces', 'LeetCode', 'AtCoder', 'CSES', 'CodeChef', 'HackerRank', 'SPOJ', 'Kattis', 'GeeksforGeeks', 'USACO'];

/** Manual entry for a problem from any platform. */
export default function AddProblemForm({ onSaved, onCancel }) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const body = {
        platform: form.platform.trim(),
        title: form.title.trim(),
        url: form.url.trim() || undefined,
        tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
        difficulty: form.difficulty.trim() || undefined,
        status: form.status,
        // Noon local time keeps the chosen calendar day in any timezone.
        date: form.date ? new Date(`${form.date}T12:00:00`).toISOString() : undefined,
        timeTakenMin: form.timeTakenMin === '' ? undefined : Number(form.timeTakenMin),
        notes: form.notes || undefined,
      };
      const res = await api('/attempts', { method: 'POST', body });
      setMessage(res.review ? `Saved. It will come back for review on ${new Date(res.review.dueAt).toLocaleDateString()}.` : 'Saved.');
      setForm({ ...EMPTY, platform: form.platform, date: form.date });
      onSaved?.();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card form-grid" onSubmit={submit}>
      <div className="card-head full"><h2>Log a problem</h2></div>
      <label>Platform*
        <input list="platforms" required maxLength={40} value={form.platform} onChange={set('platform')} placeholder="e.g. CSES" />
        <datalist id="platforms">{PLATFORM_SUGGESTIONS.map((p) => <option key={p} value={p} />)}</datalist>
      </label>
      <label>Title*
        <input required maxLength={200} value={form.title} onChange={set('title')} placeholder="e.g. Book Shop" />
      </label>
      <label className="full">URL
        <input type="url" maxLength={500} value={form.url} onChange={set('url')} placeholder="https://…" />
      </label>
      <label>Tags <span className="muted">(comma-separated)</span>
        <input value={form.tags} onChange={set('tags')} placeholder="dp, greedy" />
      </label>
      <label>Difficulty <span className="muted">(rating or Easy/Medium/Hard)</span>
        <input maxLength={40} value={form.difficulty} onChange={set('difficulty')} placeholder="1400 or Medium" />
      </label>
      <label>Status*
        <select value={form.status} onChange={set('status')}>
          <option value="solved">Solved</option>
          <option value="attempted">Attempted (not solved)</option>
          <option value="gave_up">Gave up</option>
        </select>
      </label>
      <label>Date
        <input type="date" max={today()} value={form.date} onChange={set('date')} />
      </label>
      <label>Time taken <span className="muted">(minutes)</span>
        <input type="number" min={0} max={1440} value={form.timeTakenMin} onChange={set('timeTakenMin')} />
      </label>
      <label className="full">Notes
        <textarea rows={2} maxLength={2000} value={form.notes} onChange={set('notes')} placeholder="What tripped you up?" />
      </label>
      {error && <div className="alert error full" role="alert">{error}</div>}
      {message && <div className="alert success full" role="status">{message}</div>}
      <div className="full row">
        <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        {onCancel && <button type="button" className="btn ghost" onClick={onCancel}>Close</button>}
      </div>
    </form>
  );
}
