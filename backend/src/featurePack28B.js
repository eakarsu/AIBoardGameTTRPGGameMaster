'use strict';
// Feature pack 28B — shared pure helpers (no DB / network on import).
function escapeCsvCell(v) {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function toCsv(rows, columns) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return '';
  const cols = columns && columns.length ? columns : Object.keys(list[0]);
  return [cols.join(','), ...list.map((r) => cols.map((c) => escapeCsvCell(r ? r[c] : '')).join(','))].join('\n');
}
function filterRecords(rows, opts = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const search = String(opts.search || '').trim().toLowerCase();
  const fields = opts.searchFields || [];
  const filters = opts.filters || {};
  return list.filter((row) => {
    if (!row || typeof row !== 'object') return false;
    if (search) {
      const hay = fields.length ? fields.map((f) => row[f]).join(' ') : Object.values(row).join(' ');
      if (!String(hay).toLowerCase().includes(search)) return false;
    }
    for (const [k, v] of Object.entries(filters)) {
      if (v === undefined || v === null || v === '') continue;
      if (String(row[k] ?? '').toLowerCase() !== String(v).toLowerCase()) return false;
    }
    return true;
  });
}
function readableLabel(key) {
  return String(key).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/^./, (c) => c.toUpperCase());
}
function formatAiSections(value) {
  // Preserve false / 0 / '' — never drop falsy values.
  const fmt = (v) => {
    if (v === false) return 'false';
    if (v === 0) return '0';
    if (v === '') return '(empty)';
    if (v === null || v === undefined) return '(not provided)';
    if (Array.isArray(v)) return v.length ? v.map((x) => (x && typeof x === 'object' ? JSON.stringify(x) : fmt(x))).join('; ') : '(none)';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [{ label: 'Result', value: fmt(value) }];
  return Object.entries(value).map(([k, v]) => ({ label: readableLabel(k), value: fmt(v) }));
}
function parseAiJson(text) {
  if (text && typeof text === 'object') return text;
  if (typeof text !== 'string') return null;
  try { return JSON.parse(text); } catch {}
  const stripped = text.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();
  try { return JSON.parse(stripped); } catch {}
  const s = text.indexOf('{'); const e = text.lastIndexOf('}');
  if (s !== -1 && e > s) { try { return JSON.parse(text.slice(s, e + 1)); } catch {} }
  return null;
}
function hasProviderKey(env = process.env) {
  return Boolean((env.OPENROUTER_API_KEY && env.OPENROUTER_API_KEY !== 'your_openrouter_api_key_here') || env.OPENAI_API_KEY);
}
async function callProvider({ prompt, env = process.env, fetchImpl }) {
  const doFetch = fetchImpl || globalThis.fetch;
  if (!doFetch) throw new Error('fetch is not available');
  if (env.OPENROUTER_API_KEY && env.OPENROUTER_API_KEY !== 'your_openrouter_api_key_here') {
    const r = await doFetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: env.OPENROUTER_MODEL || 'openai/gpt-4o-mini', messages: [{ role: 'user', content: prompt }], max_tokens: 1200 }),
    });
    if (!r.ok) throw new Error(`OpenRouter request failed with status ${r.status}`);
    const data = await r.json();
    return { provider: 'openrouter', parsed: parseAiJson(data.choices?.[0]?.message?.content || ''), raw: data.choices?.[0]?.message?.content || '' };
  }
  const r = await doFetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: env.OPENAI_MODEL || 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], max_tokens: 1200 }),
  });
  if (!r.ok) throw new Error(`OpenAI request failed with status ${r.status}`);
  const data = await r.json();
  return { provider: 'openai', parsed: parseAiJson(data.choices?.[0]?.message?.content || ''), raw: data.choices?.[0]?.message?.content || '' };
}
async function runAiFeature({ feature, records, computeFallback, prompt, env = process.env, fetchImpl }) {
  const fallback = computeFallback(Array.isArray(records) ? records : []);
  if (!hasProviderKey(env)) {
    return { aiGenerated: false, source: 'deterministic-fallback', label: 'Deterministic fallback — no AI provider configured', feature, data: fallback };
  }
  try {
    const { provider, parsed } = await callProvider({ prompt: prompt || `Analyse records for ${feature} and respond with JSON. Records: ${JSON.stringify(records).slice(0, 6000)}`, env, fetchImpl });
    if (!parsed || typeof parsed !== 'object') throw new Error('Provider returned non-JSON content');
    return { aiGenerated: true, source: provider, provider, feature, data: parsed };
  } catch (err) {
    return { aiGenerated: false, source: 'deterministic-fallback', label: 'Deterministic fallback — provider call failed', providerError: String(err.message || err), feature, data: fallback };
  }
}
function normalizeTaskInput(body = {}, { partial = false } = {}) {
  const out = {};
  const title = body.title ?? body.task_title;
  if (!partial || title !== undefined) {
    if (!title || !String(title).trim()) { const e = new Error('title is required'); e.status = 400; throw e; }
    out.title = String(title).trim();
  }
  for (const k of ['description', 'status', 'priority', 'assignee', 'related_type', 'related_id']) {
    if (body[k] !== undefined) out[k] = body[k] === null ? null : String(body[k]);
  }
  if (out.status !== undefined && out.status === '') out.status = 'todo';
  return out;
}
function createMemoryTaskStore() {
  let seq = 0; const rows = [];
  return {
    async list(owner) { return rows.filter((r) => !owner || r.owner === owner); },
    async create(data) { const row = { id: String(++seq), status: 'todo', priority: 'medium', description: '', assignee: '', related_type: '', related_id: '', ...data }; rows.push(row); return row; },
    async update(id, data, owner) { const row = rows.find((r) => r.id === String(id) && (!owner || r.owner === owner)); if (!row) return null; Object.assign(row, data); return row; },
  };
}
function createFeaturePackRouter({ auth, store, listMainRecords, aiFeatures, mainName = 'records', exportFilename = 'records', searchFields = [], filterFields = [], includeTasks = true }) {
  const express = require('express');
  const router = express.Router();
  if (auth) router.use(auth);
  const ownerOf = (req) => String(req.user?.email || req.user?.id || req.user?.userId || 'unknown');
  const applyFilters = (rows, req) => {
    const filters = {};
    for (const f of filterFields) if (req.query[f] !== undefined) filters[f] = req.query[f];
    return filterRecords(rows, { search: req.query.search || req.query.q || '', searchFields, filters });
  };
  if (includeTasks && store) {
    router.get('/tasks', async (req, res) => { try { res.json({ data: await store.list(ownerOf(req)) }); } catch (e) { res.status(e.status || 500).json({ error: e.message }); } });
    router.post('/tasks', async (req, res) => { try { const data = normalizeTaskInput(req.body); res.status(201).json({ data: await store.create({ ...data, owner: ownerOf(req) }) }); } catch (e) { res.status(e.status || 500).json({ error: e.message }); } });
    router.put('/tasks/:id', async (req, res) => { try { const data = normalizeTaskInput(req.body, { partial: true }); const row = await store.update(req.params.id, data, ownerOf(req)); if (!row) return res.status(404).json({ error: 'Task not found' }); res.json({ data: row }); } catch (e) { res.status(e.status || 500).json({ error: e.message }); } });
    router.patch('/tasks/:id', async (req, res) => { try { const data = normalizeTaskInput(req.body, { partial: true }); const row = await store.update(req.params.id, data, ownerOf(req)); if (!row) return res.status(404).json({ error: 'Task not found' }); res.json({ data: row }); } catch (e) { res.status(e.status || 500).json({ error: e.message }); } });
  }
  router.get('/records', async (req, res) => { try { const rows = applyFilters(await listMainRecords(req), req); res.json({ data: rows, total: rows.length }); } catch (e) { res.status(500).json({ error: e.message }); } });
  router.get('/records/export', async (req, res) => {
    try {
      const rows = applyFilters(await listMainRecords(req), req);
      const format = String(req.query.format || 'json').toLowerCase();
      if (format === 'csv') { res.setHeader('Content-Type', 'text/csv'); res.setHeader('Content-Disposition', `attachment; filename="${exportFilename}.csv"`); return res.send(toCsv(rows)); }
      if (format !== 'json') return res.status(400).json({ error: 'format must be csv or json' });
      res.setHeader('Content-Disposition', `attachment; filename="${exportFilename}.json"`);
      return res.json({ data: rows, total: rows.length, exported_at: new Date().toISOString() });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  for (const [name, fn] of Object.entries(aiFeatures || {})) {
    router.post(`/ai/${name}`, async (req, res) => {
      try {
        const records = await listMainRecords(req);
        const result = await runAiFeature({ feature: name, records, computeFallback: fn, env: process.env });
        res.json({ ...result, sections: formatAiSections(result.data) });
      } catch (e) { res.status(500).json({ error: e.message }); }
    });
  }
  router.get('/ai/features', (req, res) => res.json({ features: Object.keys(aiFeatures || {}), providerConfigured: hasProviderKey(process.env) }));
  return router;
}
module.exports = { escapeCsvCell, toCsv, filterRecords, formatAiSections, parseAiJson, hasProviderKey, callProvider, runAiFeature, normalizeTaskInput, createMemoryTaskStore, createFeaturePackRouter };

const AI_FEATURES = {
  'campaign-portfolio': (rows) => {
    const byStatus = {}; for (const r of rows) { const k = r.status || '(unspecified)'; byStatus[k] = (byStatus[k] || 0) + 1; }
    return { record_count: rows.length, status_counts: byStatus, active_campaigns: byStatus.active || 0, has_active: Boolean(byStatus.active), genres: [...new Set(rows.map((r) => r.genre).filter(Boolean))] };
  },
  'campaign-coverage': (rows) => {
    const bare = rows.filter((r) => !r.description && !r.setting).map((r) => ({ id: r.id || '', name: r.name || '' }));
    return { record_count: rows.length, campaigns_without_description_or_setting: bare.length, campaigns: bare, all_documented: bare.length === 0, paused_count: rows.filter((r) => r.status === 'paused').length };
  },
  'party-capacity': (rows) => {
    const totalSlots = rows.reduce((s, r) => s + Number(r.maxPlayers || 0), 0);
    return { record_count: rows.length, total_max_player_slots: totalSlots, average_max_players: rows.length ? Math.round((totalSlots / rows.length) * 100) / 100 : 0, campaigns_at_min_capacity: rows.filter((r) => Number(r.maxPlayers || 0) <= 1).length, has_capacity: totalSlots > 0 };
  },
};

module.exports.AI_FEATURES = AI_FEATURES;
