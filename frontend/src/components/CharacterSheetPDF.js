import React, { useEffect, useState } from 'react';

function authHeaders() {
  const t = localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

// NON-VIZ 1: CHARACTER SHEET PDF — picker -> server-rendered pdfkit sheet.
export default function CharacterSheetPDF() {
  const [chars, setChars] = useState([]);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [okMsg, setOkMsg] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/custom-views/characters', { headers: authHeaders() });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Failed');
        setChars(d.characters || []);
        if (d.characters?.[0]) setPick(d.characters[0].id);
      } catch (e) { setErr(e.message); }
    })();
  }, []);

  const download = async () => {
    setBusy(true); setErr(''); setOkMsg('');
    try {
      const r = await fetch('/api/custom-views/character-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ characterId: pick }),
      });
      if (!r.ok) {
        const txt = await r.text();
        throw new Error(txt.slice(0, 200));
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${pick}-sheet.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setOkMsg(`Downloaded ${pick}-sheet.pdf`);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const sel = chars.find((c) => c.id === pick);

  return (
    <div className="card">
      <h2 style={{ marginTop: 0, color: '#f8fafc' }}>Character Sheet PDF</h2>
      <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 0 }}>
        Pick a character; the server renders a D&amp;D-style PDF with stats,
        skills, spells, and inventory using pdfkit.
      </p>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 280 }}>
          <div className="label">Character</div>
          <select className="select" value={pick} onChange={(e) => setPick(e.target.value)} style={{ width: '100%' }}>
            {chars.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} - {c.race} {c.class} (lvl {c.level})
              </option>
            ))}
          </select>
        </div>
        <button className="btn btn-success" onClick={download} disabled={busy || !pick}>
          {busy ? 'Generating...' : 'Download PDF'}
        </button>
      </div>
      {sel && (
        <div style={{ marginTop: 12, padding: 12, background: '#0b1220', borderRadius: 6, color: '#cbd5e1', fontSize: 13 }}>
          <strong>{sel.name}</strong> - {sel.race} {sel.class}, level {sel.level}
        </div>
      )}
      {err && <div style={{ marginTop: 10, padding: 8, background: '#7f1d1d', color: '#fee2e2', borderRadius: 6, fontSize: 13 }}>{err}</div>}
      {okMsg && <div style={{ marginTop: 10, padding: 8, background: '#064e3b', color: '#bbf7d0', borderRadius: 6, fontSize: 13 }}>{okMsg}</div>}
    </div>
  );
}
