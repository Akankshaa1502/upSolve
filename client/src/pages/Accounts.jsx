import { useState } from 'react';
import { api, describeError } from '../api.js';
import { formatDate, useApi } from '../hooks.js';

const PLATFORMS = [
  { id: 'codeforces', name: 'Codeforces', placeholder: 'e.g. tourist', note: 'Full submission history via the official API.' },
  { id: 'leetcode', name: 'LeetCode', placeholder: 'e.g. lee215', note: 'Best effort: LeetCode only shows your ~20 most recent accepted submissions publicly, so failed attempts are not imported.' },
  { id: 'atcoder', name: 'AtCoder', placeholder: 'e.g. chokudai', note: 'Best effort via AtCoder Problems (kenkoooo). AtCoder problems have no topic tags.' },
];

const STATUS = {
  never: ['Not synced yet', ''],
  syncing: ['Syncing…', 'info'],
  ok: ['Synced', 'good'],
  error: ['Sync failed', 'bad'],
  unavailable: ['Sync unavailable', 'warn'],
};

function PlatformCard({ platform, account, onChange }) {
  const [handle, setHandle] = useState(account?.handle ?? '');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function run(kind, fn) {
    setBusy(kind);
    setError('');
    setNotice('');
    try {
      await fn();
    } catch (err) {
      setError(err.code === 'UPSTREAM_UNAVAILABLE' ? `${err.message}. ${err.details?.reason ?? ''} Try again later; your other data is unaffected.` : describeError(err));
    } finally {
      setBusy('');
      onChange();
    }
  }

  const connect = (e) => {
    e.preventDefault();
    run('connect', async () => {
      const { account: acc } = await api('/accounts', { method: 'POST', body: { platform: platform.id, handle: handle.trim() } });
      setHandle(acc.handle);
      // Import right away so connecting feels like one step.
      const res = await api(`/accounts/${acc._id}/sync`, { method: 'POST' });
      setNotice(`Imported ${res.account.lastSyncStats.problems} problems.`);
    });
  };
  const sync = () => run('sync', async () => {
    const res = await api(`/accounts/${account._id}/sync`, { method: 'POST' });
    setNotice(`Sync complete: ${res.account.lastSyncStats.newAttempts} new problems.`);
  });
  const disconnect = () => {
    if (!window.confirm(`Disconnect ${platform.name}? Problems imported from it will be removed (manual entries are kept).`)) return;
    run('disconnect', async () => {
      await api(`/accounts/${account._id}`, { method: 'DELETE' });
      setHandle('');
    });
  };

  const [label, tone] = STATUS[account?.status] ?? ['Not connected', ''];
  return (
    <section className="card account-card">
      <div className="card-head">
        <h2>{platform.name}</h2>
        <span className={`pill ${tone}`}>{account ? label : 'Not connected'}</span>
      </div>
      <p className="muted small">{platform.note}</p>

      <form className="row" onSubmit={connect}>
        <input aria-label={`${platform.name} handle`} placeholder={platform.placeholder} value={handle} onChange={(e) => setHandle(e.target.value)} maxLength={64} required />
        <button className="btn" disabled={!!busy || !handle.trim() || handle.trim() === account?.handle}>
          {busy === 'connect' ? 'Connecting…' : account ? 'Change' : 'Connect'}
        </button>
      </form>

      {account && (
        <>
          <dl className="kv">
            <dt>Handle</dt><dd>{account.handle}</dd>
            <dt>Last sync</dt><dd>{account.lastSyncedAt ? formatDate(account.lastSyncedAt) + ' ' + new Date(account.lastSyncedAt).toLocaleTimeString() : 'never'}</dd>
            {account.lastSyncStats && (
              <><dt>Imported</dt><dd>{account.lastSyncStats.problems} problems ({account.lastSyncStats.solved} solved)</dd></>
            )}
          </dl>
          {account.status === 'unavailable' && !error && (
            <div className="alert warn small">{platform.name} sync unavailable: {account.lastSyncError}</div>
          )}
          {account.status === 'error' && !error && <div className="alert error small">{account.lastSyncError}</div>}
          <div className="row">
            <button className="btn primary" onClick={sync} disabled={!!busy}>{busy === 'sync' ? 'Syncing…' : 'Sync now'}</button>
            <button className="btn ghost danger" onClick={disconnect} disabled={!!busy}>Disconnect</button>
          </div>
        </>
      )}
      {error && <div className="alert error small" role="alert">{error}</div>}
      {notice && <div className="alert success small" role="status">{notice}</div>}
    </section>
  );
}

export default function Accounts() {
  const { data, error, reload } = useApi('/accounts');
  const byPlatform = Object.fromEntries((data?.accounts ?? []).map((a) => [a.platform, a]));
  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h1>Accounts</h1>
          <p className="muted">Connect public handles to import solved and attempted problems. Only public data is read; no passwords needed. Syncing again never creates duplicates.</p>
        </div>
      </div>
      {error && <div className="alert error">{error.message}</div>}
      <div className="grid-3">
        {data && PLATFORMS.map((p) => <PlatformCard key={p.id} platform={p} account={byPlatform[p.id]} onChange={reload} />)}
      </div>
      <p className="muted small">Using another site (CSES, CodeChef, Kattis…)? Log those problems by hand on the Problems page.</p>
    </div>
  );
}
