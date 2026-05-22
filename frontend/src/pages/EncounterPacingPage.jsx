import React, { useState } from 'react';

export default function EncounterPacingPage() {
  const [payload, setPayload] = useState(JSON.stringify({ players: 4, avg_level: 5, monster_cr: 7, session_minutes: 180 }, null, 2));
  const [result, setResult] = useState(null);
  const run = async () => {
    const res = await fetch('/api/encounter-pacing/plan', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token') || ''}` }, body: JSON.stringify(JSON.parse(payload)) });
    setResult(await res.json());
  };
  return (
    <div style={{ padding: 32 }}>
      <h1>Encounter Pacing Planner</h1>
      <textarea style={{ width: '100%', minHeight: 180 }} value={payload} onChange={(event) => setPayload(event.target.value)} />
      <button className="btn btn-primary" onClick={run}>Plan Pacing</button>
      {result && <div className="card"><h2>{result.pacing} · {result.difficulty}</h2><p>{result.adjustment}</p><p>{result.beats.join(' → ')}</p></div>}
    </div>
  );
}
