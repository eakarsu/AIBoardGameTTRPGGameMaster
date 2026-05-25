// === Batch 01 Gaps & Frontend Mounts ===
// Feature: No webhook outbound API
import React, { useState } from 'react';


export default function NoWebhookOutboundApiPage() {
  const [input, setInput] = useState('');

  const sampleRequests = [
      {
          "label": "Scenario",
          "value": "Run No webhook outbound API for a realistic customer case.\nContext: a team needs a practical recommendation based on incomplete operating data.\nGoal: identify the best action, key risks, missing information, and expected business impact.\nReturn: summary, prioritized action plan, assumptions, and follow-up questions."
      },
      {
          "label": "Data sample",
          "value": "Analyze this No webhook outbound API data sample.\nInput records:\n- Record 1: urgent, customer impact high, owner unassigned\n- Record 2: medium priority, blocked by missing data\n- Record 3: recurring issue, automation opportunity\nReturn structured findings, anomalies, recommendations, and confidence."
      },
      {
          "label": "Executive review",
          "value": "Prepare an executive review for No webhook outbound API.\nAudience: business owner, operations lead, and implementation team.\nInclude impact, risk, estimated effort, decision points, and a concise next-step plan."
      }
  ];

  const applySampleRequest = (value) => {
    setInput(value);
    setResult(null);
  };
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
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          {sampleRequests.map((sample) => (
            <button
              key={sample.label}
              type="button"
              onClick={() => applySampleRequest(sample.value)}
              style={{ padding: '6px 10px', background: '#eef2ff', color: '#1e3a8a', border: '1px solid #c7d2fe', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
            >
              {sample.label}
            </button>
          ))}
        </div>

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
