import { Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Problems from './pages/Problems.jsx';
import Accounts from './pages/Accounts.jsx';
import Revisit from './pages/Revisit.jsx';

function Shell({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const signOut = () => {
    logout();
    navigate('/', { replace: true });
  };
  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-inner">
          <NavLink to="/" className="brand">
            <span className="brand-mark" aria-hidden>↑</span> upsolve
          </NavLink>
          <nav className="nav">
            <NavLink to="/" end>Dashboard</NavLink>
            <NavLink to="/revisit">Revisit</NavLink>
            <NavLink to="/problems">Problems</NavLink>
            <NavLink to="/accounts">Accounts</NavLink>
          </nav>
          <div className="user">
            <span className="muted user-email">{user.email}</span>
            <button className="btn ghost sm" onClick={signOut}>Log out</button>
          </div>
        </div>
      </header>
      <main className="page">{children}</main>
    </div>
  );
}

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <div className="center muted">Loading…</div>;
  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/revisit" element={<Revisit />} />
        <Route path="/problems" element={<Problems />} />
        <Route path="/accounts" element={<Accounts />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}
