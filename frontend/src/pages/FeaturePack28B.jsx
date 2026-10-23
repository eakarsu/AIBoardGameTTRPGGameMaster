import React, { useCallback, useEffect, useState } from 'react';
import AIReport from '../components/AIReport';

// Feature pack 28B: authenticated tasks, main-record search/filter,
// CSV/JSON export, and compliant AI (deterministic fallback is labelled).
export default function FeaturePack28B() {
  const [records, setRecords] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [search, setSearch] = useState('');
  const [title, setTitle] = useState('');
  const [features, setFeatures] = useState([]);
  const [aiResult, setAiResult] = useState(null);
  const [error, setError] = useState('');
  const headers = useCallback(() => ({ Authorization: `Bearer ${localStorage.getItem('token') || ''}`, 'Content-Type': 'application/json' }), []);
  const load = useCallback(async () => {
    try {
      const q = search ? `?search=${encodeURIComponent(search)}` : '';
      const [r, t, f] = await Promise.all([
        fetch(`/api/feature-pack/records${q}`, { headers: headers() }),
        fetch('/api/feature-pack/tasks', { headers: headers() }),
        fetch('/api/feature-pack/ai/features', { headers: headers() }),
      ]);
      const rj = await r.json(); setRecords(rj.data || []);
      if (t.ok) { const tj = await t.json(); setTasks(tj.data || []); }
      if (f.ok) { const fj = await f.json(); setFeatures(fj.features || []); }
    } catch (e) { setError(String(e.message || e)); }
  }, [headers, search]);
  useEffect(() => { load(); }, [load]);
  async function createTask(e) {
    e.preventDefault(); if (!title.trim()) return;
    await fetch('/api/feature-pack/tasks', { method: 'POST', headers: headers(), body: JSON.stringify({ title: title.trim() }) });
    setTitle(''); load();
  }
  async function toggleTask(task) {
    await fetch(`/api/feature-pack/tasks/${task.id}`, { method: 'PUT', headers: headers(), body: JSON.stringify({ status: task.status === 'done' ? 'todo' : 'done' }) });
    load();
  }
  async function download(format) {
    const res = await fetch(`/api/feature-pack/records/export?format=${format}${search ? `&search=${encodeURIComponent(search)}` : ''}`, { headers: headers() });
    const blob = await res.blob(); const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `records.${format}`; a.click(); URL.revokeObjectURL(url);
  }
  async function runAi(feature) {
    const res = await fetch(`/api/feature-pack/ai/${feature}`, { method: 'POST', headers: headers(), body: '{}' });
    setAiResult(await res.json());
  }
  return (
    <div style={{ padding: 24 }}>
      <h1>Feature Pack — Tasks, Export &amp; AI</h1>
      {error ? <p role="alert">{error}</p> : null}
      <section><h2>Main records</h2>
        <input aria-label="Search main records" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search main records" />
        <button type="button" onClick={() => download('csv')}>Export CSV</button>
        <button type="button" onClick={() => download('json')}>Export JSON</button>
        <p>{records.length} record(s)</p>
      </section>
      <section><h2>Tasks</h2>
        <form onSubmit={createTask}><input aria-label="Task title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title" /><button type="submit">Add task</button></form>
        <ul>{tasks.map((t) => <li key={t.id}>{String(t.title)} — {String(t.status)} <button type="button" onClick={() => toggleTask(t)}>Toggle status</button></li>)}</ul>
      </section>
      <section><h2>AI features</h2>
        {aiResult && aiResult.aiGenerated === false ? <p>Deterministic fallback — no AI provider configured (aiGenerated: false)</p> : null}
        {features.map((f) => <button key={f} type="button" onClick={() => runAi(f)}>{f}</button>)}
        {aiResult ? <AIReport response={aiResult} title="Feature pack AI result" /> : null}
      </section>
    </div>
  );
}
