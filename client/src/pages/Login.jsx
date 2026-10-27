import { useState } from 'react';
import { useAuth } from '../auth.jsx';
import { describeError } from '../api.js';

export default function Login() {
  const { authenticate } = useAuth();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ email: '', password: '', name: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const payload = mode === 'register' ? form : { email: form.email, password: form.password };
      await authenticate(mode, payload);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  async function demo() {
    setError('');
    setBusy(true);
    try {
      await authenticate('login', { email: 'demo@upsolve.dev', password: 'demo1234' });
    } catch (err) {
      setError(`${describeError(err)}. Run the seed script first (see README).`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card card">
        <div className="brand big"><span className="brand-mark" aria-hidden>↑</span> upsolve</div>
        <p className="muted">Track every problem, find your weak topics, and revisit what you missed.</p>
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Log in</button>
          <button role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>Sign up</button>
        </div>
        <form onSubmit={submit} className="stack">
          {mode === 'register' && (
            <label>Name <span className="muted">(optional)</span>
              <input value={form.name} onChange={set('name')} maxLength={80} autoComplete="name" />
            </label>
          )}
          <label>Email
            <input type="email" required value={form.email} onChange={set('email')} autoComplete="email" />
          </label>
          <label>Password
            <input type="password" required minLength={mode === 'register' ? 8 : 1} value={form.password} onChange={set('password')}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'} />
          </label>
          {error && <div className="alert error" role="alert">{error}</div>}
          <button className="btn primary" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}</button>
        </form>
        <div className="divider"><span>or</span></div>
        <button className="btn" onClick={demo} disabled={busy}>Try the demo account</button>
      </div>
    </div>
  );
}
