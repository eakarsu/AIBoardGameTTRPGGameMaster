import React, { useState } from 'react';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('gm@gamemaster.ai');
  const [password, setPassword] = useState('password123');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Login failed');
      onLogin(data.user, data.token);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#0f172a',
    }}>
      <form onSubmit={submit} className="card" style={{ width: 380 }}>
        <h2 style={{ marginTop: 0, color: '#f8fafc' }}>GM Master Login</h2>
        <p style={{ color: '#94a3b8', fontSize: 13 }}>
          Default GM credentials are prefilled. Sign in to access GM Views.
        </p>
        <div style={{ marginBottom: 12 }}>
          <div className="label">Email</div>
          <input className="input" style={{ width: '100%' }}
            value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <div className="label">Password</div>
          <input className="input" type="password" style={{ width: '100%' }}
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {err && <div style={{
          padding: 8, background: '#7f1d1d', color: '#fee2e2',
          borderRadius: 6, marginBottom: 12, fontSize: 13,
        }}>{err}</div>}
        <button
          type="button"
          onClick={() => { setEmail(import.meta.env.VITE_DEMO_EMAIL || ''); setPassword(import.meta.env.VITE_DEMO_PASSWORD || ''); }}
          disabled={!import.meta.env.VITE_DEMO_EMAIL || !import.meta.env.VITE_DEMO_PASSWORD}
          aria-label="Auto Fill Demo Credentials"
          style={{ width: '100%', marginBottom: '12px', padding: '10px 14px', borderRadius: '8px', border: '1px solid currentColor', background: 'transparent', cursor: 'pointer' }}
        >
          Auto Fill Demo Credentials
        </button>
        <button className="btn" type="submit" disabled={busy} style={{ width: '100%' }}>
          {busy ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
