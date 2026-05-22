import React, { useEffect, useState } from 'react';

// VIZ 1: GAME STATE BOARD — SVG hex grid with party + enemy tokens.
function authHeaders() {
  const t = localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function hexPoints(cx, cy, size) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30); // pointy-top
    pts.push([cx + size * Math.cos(angle), cy + size * Math.sin(angle)]);
  }
  return pts.map((p) => p.join(',')).join(' ');
}

export default function GameStateBoard() {
  const [state, setState] = useState(null);
  const [err, setErr] = useState('');
  const [hover, setHover] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/custom-views/game-state', { headers: authHeaders() });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Failed to load board');
        setState(d);
      } catch (e) { setErr(e.message); }
    })();
  }, []);

  if (err) return <div className="card"><strong>Game State Board</strong> — {err}</div>;
  if (!state) return <div className="card">Loading hex board...</div>;

  const size = state.hex_size;
  const xs = state.hexes.map((h) => h.pixel.x);
  const ys = state.hexes.map((h) => h.pixel.y);
  const minX = Math.min(...xs) - size * 1.2;
  const maxX = Math.max(...xs) + size * 1.2;
  const minY = Math.min(...ys) - size * 1.2;
  const maxY = Math.max(...ys) + size * 1.2;
  const width = maxX - minX;
  const height = maxY - minY;

  return (
    <div className="card">
      <h2 style={{ marginTop: 0, color: '#f8fafc' }}>Game State Board</h2>
      <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 0 }}>
        Hex battle map (radius {state.radius}). Party (circles) and enemies (diamonds)
        positioned at axial coordinates. Hover a token for details.
      </p>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <svg
          viewBox={`${minX} ${minY} ${width} ${height}`}
          style={{ width: '100%', maxWidth: 720, height: 'auto', background: '#0b1220', borderRadius: 8 }}
        >
          {state.hexes.map((h, i) => (
            <polygon
              key={i}
              points={hexPoints(h.pixel.x, h.pixel.y, size)}
              fill={h.color}
              fillOpacity={0.65}
              stroke="#1e293b"
              strokeWidth={0.8}
            />
          ))}
          {state.party.map((p) => (
            <g key={p.id} onMouseEnter={() => setHover(p)} onMouseLeave={() => setHover(null)}>
              <circle cx={p.pixel.x} cy={p.pixel.y} r={size * 0.55} fill={p.color}
                stroke="#fff" strokeWidth={2} />
              <text x={p.pixel.x} y={p.pixel.y + 3} fontSize={10} fill="#0f172a"
                textAnchor="middle" fontWeight="700">
                {p.name.split(' ')[0].slice(0, 3).toUpperCase()}
              </text>
            </g>
          ))}
          {state.enemies.map((e) => (
            <g key={e.id} onMouseEnter={() => setHover(e)} onMouseLeave={() => setHover(null)}>
              <polygon
                points={`${e.pixel.x},${e.pixel.y - size * 0.55} ${e.pixel.x + size * 0.55},${e.pixel.y} ${e.pixel.x},${e.pixel.y + size * 0.55} ${e.pixel.x - size * 0.55},${e.pixel.y}`}
                fill={e.color} stroke="#fca5a5" strokeWidth={2}
              />
              <text x={e.pixel.x} y={e.pixel.y + 3} fontSize={9} fill="#fecaca"
                textAnchor="middle" fontWeight="700">
                CR{e.cr}
              </text>
            </g>
          ))}
        </svg>

        <div style={{ minWidth: 220, color: '#cbd5e1' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', marginBottom: 6 }}>
            Legend
          </div>
          {Object.entries(state.legend).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 4 }}>
              <span style={{ width: 14, height: 14, background: v, borderRadius: 3, display: 'inline-block' }} />
              {k}
            </div>
          ))}
          <div style={{ marginTop: 12, fontSize: 12, color: '#94a3b8' }}>
            Party: {state.party.length} - Enemies: {state.enemies.length}
          </div>
          {hover && (
            <div style={{ marginTop: 12, padding: 10, background: '#0f172a', borderRadius: 6, fontSize: 12 }}>
              <div style={{ fontWeight: 700, color: '#f8fafc' }}>{hover.name}</div>
              <div>HP {hover.hp}/{hover.maxHp}</div>
              <div>Pos ({hover.q}, {hover.r})</div>
              {hover.cr && <div>CR {hover.cr}</div>}
              {hover.class && <div>{hover.class}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
