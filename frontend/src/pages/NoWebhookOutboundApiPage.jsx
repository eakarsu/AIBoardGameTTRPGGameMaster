// === Batch 01 Gaps & Frontend Mounts ===
// Feature: No webhook outbound API
import React, { useState } from 'react';


export default function NoWebhookOutboundApiPage() {
  const [input, setInput] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const run = async () => {
    setBusy(true); setErr(''); setResult(null);
    try {
      const token = (typeof localStorage !== 'undefined') ? localStorage.getItem('token') : '';
      const r = await fetch('/api/gap-no-webhook-outbound-api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ input }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Request failed');
      setResult(data);
    } catch (e) {
      const data = e?.response?.data;
      if (data?.missing) setErr(`AI unavailable — set ${data.missing} in .env`);
      else setErr(data?.error || e.message || 'Failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: 24, color: '#e5e7eb', maxWidth: 980 }}>
      <h2 style={{ marginTop: 0 }}>No webhook outbound API</h2>
      <p style={{ color: '#9ca3af', fontSize: 13 }}>
        Endpoint: <code>/api/gap-no-webhook-outbound-api/run</code>. Submit context as text; the backend calls OpenRouter and returns structured JSON.
      </p>
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Enter context, JSON, or a free-form prompt..."
        rows={8}
        style={{ width: '100%', padding: 10, background: '#111827', color: '#f3f4f6', border: '1px solid #374151', borderRadius: 6, fontFamily: 'monospace' }}
      />
      <div style={{ marginTop: 10 }}>
        <button
          onClick={run}
          disabled={busy || !input.trim()}
          style={{ padding: '8px 16px', background: busy ? '#374151' : '#10b981', color: '#fff', border: 'none', borderRadius: 6, cursor: busy ? 'wait' : 'pointer' }}
        >
          {busy ? 'Running...' : 'Run'}
        </button>
      </div>
      {err && <div style={{ marginTop: 12, padding: 10, background: '#7f1d1d', borderRadius: 6, color: '#fee2e2' }}>{err}</div>}
      {result && (
        <pre style={{ marginTop: 16, padding: 12, background: '#1f2937', borderRadius: 6, color: '#d1d5db', maxHeight: 480, overflow: 'auto', fontSize: 12 }}>
{JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
