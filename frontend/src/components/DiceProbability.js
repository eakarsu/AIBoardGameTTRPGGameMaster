import React, { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
} from 'recharts';

function authHeaders() {
  const t = localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

// VIZ 2: DICE PROBABILITY CHART — recharts bar of PMF for "NdM+/-K"
export default function DiceProbability() {
  const [expr, setExpr] = useState('3d6+2');
  const [input, setInput] = useState('3d6+2');
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setBusy(true); setErr('');
    try {
      const r = await fetch(`/api/custom-views/dice-probability?expr=${encodeURIComponent(input)}`, {
        headers: authHeaders(),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setData(d);
      setExpr(d.expression);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  return (
    <div className="card">
      <h2 style={{ marginTop: 0, color: '#f8fafc' }}>Dice Probability Chart</h2>
      <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 0 }}>
        Enter a dice expression like <code>3d6+2</code>, <code>1d20-1</code>, or <code>2d10</code>.
        Backend computes the exact probability mass function via convolution.
      </p>
      <form onSubmit={load} style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <div className="label">Expression</div>
          <input className="input" value={input} onChange={(e) => setInput(e.target.value)} style={{ width: '100%' }} />
        </div>
        <button className="btn" type="submit" disabled={busy}>{busy ? 'Computing...' : 'Compute'}</button>
      </form>
      {err && <div style={{ padding: 8, background: '#7f1d1d', color: '#fee2e2', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>{err}</div>}
      {data && (
        <>
          <div style={{ display: 'flex', gap: 24, marginBottom: 12, color: '#cbd5e1', fontSize: 13, flexWrap: 'wrap' }}>
            <div><strong>{expr}</strong></div>
            <div>Min: <strong>{data.min}</strong></div>
            <div>Max: <strong>{data.max}</strong></div>
            <div>Mean: <strong>{data.mean}</strong></div>
            <div>Stdev: <strong>{data.stdev}</strong></div>
          </div>
          <div style={{ width: '100%', height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.distribution} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="total" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }}
                  tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
                <Tooltip
                  contentStyle={{ background: '#0b1220', border: '1px solid #334155', color: '#e5e7eb' }}
                  formatter={(v, name) =>
                    name === 'probability' ? `${(v * 100).toFixed(2)}%` : v
                  }
                />
                <Bar dataKey="probability" fill="#22d3ee" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
