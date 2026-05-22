import React, { useEffect, useMemo, useState } from 'react';

function authHeaders() {
  const t = localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

const TERRAINS = ['forest', 'plains', 'mountain', 'cave', 'swamp', 'crypt', 'urban'];

// NON-VIZ 2: ENCOUNTER BUILDER WIZARD
// Steps: 1) party level/size  2) terrain  3) CR budget hint  4) pick monsters  5) preview
export default function EncounterBuilder() {
  const [step, setStep] = useState(1);
  const [partyLevel, setPartyLevel] = useState(5);
  const [partySize, setPartySize] = useState(4);
  const [terrain, setTerrain] = useState('forest');
  const [budget, setBudget] = useState('hard');
  const [monsterList, setMonsterList] = useState([]);
  const [picks, setPicks] = useState({}); // {id: count}
  const [preview, setPreview] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (step !== 4) return;
    (async () => {
      try {
        const r = await fetch(`/api/custom-views/monsters?terrain=${terrain}`, { headers: authHeaders() });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Failed');
        setMonsterList(d.monsters || []);
      } catch (e) { setErr(e.message); }
    })();
  }, [step, terrain]);

  const pickedArray = useMemo(() =>
    Object.entries(picks).filter(([, c]) => c > 0).map(([id, count]) => ({ id, count })),
  [picks]);

  const totalPicked = pickedArray.reduce((s, p) => s + p.count, 0);

  const runPreview = async () => {
    setBusy(true); setErr(''); setPreview(null);
    try {
      const r = await fetch('/api/custom-views/encounter-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          party_level: partyLevel,
          party_size: partySize,
          terrain,
          monsters: pickedArray,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setPreview(d);
      setStep(5);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const stepperLabel = ['', 'Party', 'Terrain', 'Budget', 'Monsters', 'Preview'];

  return (
    <div className="card">
      <h2 style={{ marginTop: 0, color: '#f8fafc' }}>Encounter Builder Wizard</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[1, 2, 3, 4, 5].map((s) => (
          <div key={s} style={{
            flex: 1, padding: '8px 10px', textAlign: 'center', borderRadius: 6,
            background: s === step ? '#1e3a8a' : s < step ? '#065f46' : '#1e293b',
            color: '#e2e8f0', fontSize: 12,
          }}>
            {s}. {stepperLabel[s]}
          </div>
        ))}
      </div>

      {err && <div style={{ padding: 8, background: '#7f1d1d', color: '#fee2e2', borderRadius: 6, marginBottom: 10, fontSize: 13 }}>{err}</div>}

      {step === 1 && (
        <div>
          <h3 style={{ color: '#e2e8f0' }}>Step 1 — Party</h3>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div className="label">Party level (1–12)</div>
              <input className="input" type="number" min={1} max={12} value={partyLevel}
                onChange={(e) => setPartyLevel(Math.max(1, Math.min(12, +e.target.value || 1)))} />
            </div>
            <div>
              <div className="label">Party size (1–8)</div>
              <input className="input" type="number" min={1} max={8} value={partySize}
                onChange={(e) => setPartySize(Math.max(1, Math.min(8, +e.target.value || 1)))} />
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <button className="btn" onClick={() => setStep(2)}>Next: Terrain</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div>
          <h3 style={{ color: '#e2e8f0' }}>Step 2 — Terrain</h3>
          <div className="label">Terrain</div>
          <select className="select" value={terrain} onChange={(e) => setTerrain(e.target.value)}>
            {TERRAINS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => setStep(1)}>Back</button>
            <button className="btn" onClick={() => setStep(3)}>Next: Budget</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div>
          <h3 style={{ color: '#e2e8f0' }}>Step 3 — CR Budget</h3>
          <div className="label">Target difficulty</div>
          <select className="select" value={budget} onChange={(e) => setBudget(e.target.value)}>
            <option value="easy">easy</option>
            <option value="medium">medium</option>
            <option value="hard">hard</option>
            <option value="deadly">deadly</option>
          </select>
          <p style={{ color: '#94a3b8', fontSize: 13 }}>
            We'll target this difficulty when scoring your monster selection.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => setStep(2)}>Back</button>
            <button className="btn" onClick={() => setStep(4)}>Next: Pick monsters</button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div>
          <h3 style={{ color: '#e2e8f0' }}>Step 4 — Pick Monsters ({terrain})</h3>
          <div style={{ maxHeight: 280, overflow: 'auto', border: '1px solid #334155', borderRadius: 6 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', color: '#cbd5e1', fontSize: 13 }}>
              <thead style={{ background: '#0b1220', position: 'sticky', top: 0 }}>
                <tr>
                  <th style={{ textAlign: 'left', padding: 8 }}>Monster</th>
                  <th style={{ textAlign: 'left', padding: 8 }}>CR</th>
                  <th style={{ textAlign: 'left', padding: 8 }}>XP</th>
                  <th style={{ textAlign: 'left', padding: 8 }}>Type</th>
                  <th style={{ textAlign: 'left', padding: 8 }}>Count</th>
                </tr>
              </thead>
              <tbody>
                {monsterList.map((m) => (
                  <tr key={m.id} style={{ borderTop: '1px solid #1e293b' }}>
                    <td style={{ padding: 8 }}>{m.name}</td>
                    <td style={{ padding: 8 }}>{m.cr}</td>
                    <td style={{ padding: 8 }}>{m.xp}</td>
                    <td style={{ padding: 8 }}>{m.type}</td>
                    <td style={{ padding: 8 }}>
                      <input className="input" type="number" min={0} max={20}
                        value={picks[m.id] || 0}
                        onChange={(e) =>
                          setPicks({ ...picks, [m.id]: Math.max(0, Math.min(20, +e.target.value || 0)) })}
                        style={{ width: 70 }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 10, color: '#94a3b8', fontSize: 13 }}>
            Selected: {totalPicked}
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => setStep(3)}>Back</button>
            <button className="btn btn-success" disabled={busy || totalPicked === 0} onClick={runPreview}>
              {busy ? 'Scoring...' : 'Preview balance'}
            </button>
          </div>
        </div>
      )}

      {step === 5 && preview && (
        <div>
          <h3 style={{ color: '#e2e8f0' }}>Step 5 — Preview</h3>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 10, marginBottom: 14,
          }}>
            {[
              ['Difficulty', preview.difficulty],
              ['Balance score', `${preview.balance_score} / 100`],
              ['Adjusted XP', preview.adjusted_xp],
              ['Multiplier', `x${preview.encounter_multiplier}`],
              ['Terrain fit', `${preview.terrain_fit_pct}%`],
              ['Monsters', preview.monster_count],
            ].map(([k, v]) => (
              <div key={k} style={{ background: '#0b1220', padding: 10, borderRadius: 6 }}>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>{k}</div>
                <div style={{ fontSize: 16, color: '#f8fafc', fontWeight: 600 }}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{ padding: 12, background: '#0b1220', borderRadius: 6, color: '#cbd5e1', fontSize: 13 }}>
            <div><strong>Recommendation:</strong> {preview.recommendation}</div>
            <div style={{ marginTop: 6 }}>
              <strong>Party thresholds:</strong>{' '}
              easy {preview.party_thresholds.easy} - medium {preview.party_thresholds.medium} -
              hard {preview.party_thresholds.hard} - deadly {preview.party_thresholds.deadly}
            </div>
          </div>
          <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => setStep(4)}>Adjust monsters</button>
            <button className="btn" onClick={() => { setStep(1); setPicks({}); setPreview(null); }}>
              Start over
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
