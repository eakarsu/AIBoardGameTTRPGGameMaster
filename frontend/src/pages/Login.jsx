import React, { useState } from 'react';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const login = async (credentials) => {
    setBusy(true); setErr('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Login failed');
      onLogin(data.user, data.token);
    } catch (error) {
      setErr(error.message);
    } finally {
      setBusy(false);
    }
  };

  const submit = (event) => {
    event.preventDefault();
    login({ email, password });
  };

  const loginAsDemo = async () => {
    setBusy(true); setErr('');
    try {
      const response = await fetch('/api/auth/demo-credentials', { cache: 'no-store' });
      const credentials = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(credentials.error || 'Demo credentials are unavailable.');
      setEmail(credentials.email);
      setPassword(credentials.password);
      await login(credentials);
    } catch (error) {
      setErr(error.message);
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
          Sign in with your account or use the configured local demo account.
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
            aria-label="Fill demo credentials"
            onClick={async () => {
              if (import.meta.env.VITE_DEMO_EMAIL && import.meta.env.VITE_DEMO_PASSWORD) { setEmail(import.meta.env.VITE_DEMO_EMAIL); setPassword(import.meta.env.VITE_DEMO_PASSWORD); setErr(''); return; }
              try {
                const res = await fetch('/api/auth/demo-credentials', { cache: 'no-store' });
                const data = await res.json().catch(() => ({}));
                if (data.email && data.password) { setEmail(data.email); setPassword(data.password); setErr(''); return; }
              } catch {}
              setErr('Demo credentials are not configured for this environment.');
            }}
            disabled={busy}
            style={{ width: '100%', marginBottom: '12px', padding: '10px 14px', borderRadius: '8px', border: '1px solid currentColor', background: 'transparent', cursor: 'pointer' }}
          >
            Fill demo credentials
          </button>
        <button
          type="button"
          onClick={loginAsDemo}
          disabled={busy}
          aria-label="Log In as Demo"
          style={{ width: '100%', marginBottom: '12px', padding: '10px 14px', borderRadius: '8px', border: '1px solid currentColor', background: 'transparent', cursor: 'pointer' }}
        >
          Log In as Demo
        </button>
        <button className="btn" type="submit" disabled={busy} style={{ width: '100%' }}>
          {busy ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}
