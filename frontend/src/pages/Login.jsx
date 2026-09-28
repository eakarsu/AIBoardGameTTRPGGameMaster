import React, { useState } from 'react';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
          Fill the local demo account, then click Sign In to access GM Views.
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
          onClick={async () => {
            setErr('');
            try {
              const response = await fetch('/api/auth/demo-credentials', { cache: 'no-store' });
              const credentials = await response.json();
              if (!response.ok) throw new Error(credentials.error || 'Demo credentials are unavailable.');
              setEmail(credentials.email);
              setPassword(credentials.password);
            } catch (error) {
              setErr(error.message);
            }
          }}
          aria-label="Auto Fill Demo Credentials"
          style={{ width: '100%', marginBottom: '12px', padding: '10px 14px', borderRadius: '8px', border: '1px solid currentColor', background: 'transparent', cursor: 'pointer' }}
        >
          Auto Fill Demo Credentials
        </button>
        <button className="btn" type="submit" disabled={busy} style={{ width: '100%' }}>
          {busy ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}
