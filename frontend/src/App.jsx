import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useNavigate, Link, useLocation } from 'react-router-dom';
import Login from './pages/Login.jsx';
import CustomViewsPage from './pages/CustomViewsPage.jsx';
import EncounterPacingPage from './pages/EncounterPacingPage.jsx';

import CodexCustomVizFeature from './pages/CodexCustomVizFeature';
import CodexOperationsFeature from './pages/CodexOperationsFeature';

function Sidebar({ onLogout, user }) {
  const loc = useLocation();
  const link = (path, label) => (
    <Link
      to={path}
      style={{
        display: 'block',
        padding: '10px 14px',
        borderRadius: 6,
        marginBottom: 4,
        background: loc.pathname === path ? '#1e3a8a' : 'transparent',
        color: loc.pathname === path ? '#fff' : '#cbd5e1',
      }}
    >
      {label}
    </Link>
  );
  return (
    <aside style={{
      width: 240, background: '#0b1220', padding: 20,
      borderRight: '1px solid #1e293b', display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 18, color: '#f8fafc' }}>
        GM Master
      </div>
      <nav style={{ flex: 1 }}>
        {link('/', 'Dashboard')}
        {link('/custom-views', 'GM Views')}
        {link('/encounter-pacing', 'Encounter Pacing')}
      </nav>
      <div style={{ borderTop: '1px solid #1e293b', paddingTop: 12 }}>
        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>
          {user?.email || 'User'}
        </div>
        <button className="btn btn-secondary" style={{ width: '100%' }} onClick={onLogout}>
          Logout
        </button>
      </div>
    </aside>
  );
}

function Dashboard() {
  return (
    <div style={{ padding: 32 }}>
      <h1 style={{ marginTop: 0 }}>AI BoardGame / TTRPG Game Master</h1>
      <p style={{ color: '#94a3b8', maxWidth: 720 }}>
        Welcome, Game Master. Use <Link to="/custom-views">GM Views</Link> for the hex
        battle map, dice probability analyzer, character-sheet PDF exports, and the
        encounter balance wizard.
      </p>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('token');
    const u = localStorage.getItem('user');
    if (token && u) {
      try { setUser(JSON.parse(u)); } catch { /* ignore */ }
    }
    setReady(true);
  }, []);

  const handleLogin = (u, token) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(u));
    setUser(u);
    navigate('/custom-views');
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    navigate('/login');
  };

  if (!ready) return <div style={{ padding: 40 }}>Loading...</div>;

  if (!user) {
    return (
      <Routes>
        <Route path="/codex/custom-viz" element={<CodexCustomVizFeature />} />
        <Route path="/codex/operations" element={<CodexOperationsFeature />} />

        <Route path="/login" element={<Login onLogin={handleLogin} />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar onLogout={handleLogout} user={user} />
      <main style={{ flex: 1, overflow: 'auto' }}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/custom-views" element={<CustomViewsPage />} />
          <Route path="/encounter-pacing" element={<EncounterPacingPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
