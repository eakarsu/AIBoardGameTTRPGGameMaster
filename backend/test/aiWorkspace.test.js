'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const features = require('../aiWorkspaceFeatures.json');
const { createAIWorkspaceRouter, FIELD_KEYS, validateFields } = require('../aiWorkspace.cjs');

const completeFields = Object.fromEntries(FIELD_KEYS.map((key) => [key, `${key} example`]));

function createMemoryPool() {
  const rows = [];
  let nextId = 1;
  return {
    rows,
    async query(text, values = []) {
      if (/^CREATE TABLE/i.test(text)) return { rows: [] };
      if (/^SELECT \* FROM ai_workspace_runs/i.test(text)) {
        return { rows: rows.filter((row) => row.user_id === values[0] && row.feature === values[1]) };
      }
      if (/^SELECT id FROM ai_workspace_runs/i.test(text)) {
        return { rows: rows.filter((row) => row.id === String(values[0]) && row.user_id === values[1] && row.feature === values[2]).map(({ id }) => ({ id })) };
      }
      if (/^INSERT INTO ai_workspace_runs/i.test(text)) {
        const now = new Date().toISOString();
        const row = {
          id: String(nextId++), user_id: values[0], feature: values[1], input: values[2],
          result: values[3], result_json: values[4], model: values[5], usage: values[6],
          created_at: now, updated_at: now,
        };
        rows.unshift(row);
        return { rows: [row] };
      }
      if (/^UPDATE ai_workspace_runs/i.test(text)) {
        const row = rows.find((item) => item.id === String(values[7]) && item.user_id === values[0] && item.feature === values[1]);
        if (!row) return { rows: [] };
        Object.assign(row, { input: values[2], result: values[3], result_json: values[4], model: values[5], usage: values[6], updated_at: new Date().toISOString() });
        return { rows: [row] };
      }
      if (/^DELETE FROM ai_workspace_runs/i.test(text)) {
        const index = rows.findIndex((row) => row.id === String(values[0]) && row.user_id === values[1]);
        if (index < 0) return { rows: [] };
        return { rows: [{ id: rows.splice(index, 1)[0].id }] };
      }
      throw new Error(`Unexpected query: ${text}`);
    },
  };
}

async function createTestServer() {
  const pool = createMemoryPool();
  const providerCalls = [];
  const app = express();
  app.use(express.json());
  app.use('/api/report-workspace', createAIWorkspaceRouter({
    pool,
    features,
    env: { OPENROUTER_API_KEY: 'test-key', OPENROUTER_MODEL: 'test/model' },
    authenticateToken(req, _res, next) { req.user = { id: 'user-1' }; next(); },
    fetchImpl: async (url, options) => {
      providerCalls.push({ url, options, body: JSON.parse(options.body) });
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            model: 'test/model',
            usage: { prompt_tokens: 20, completion_tokens: 30, total_tokens: 50 },
            choices: [{ message: { content: '# Verified fixture report\n\n- First finding\n- Second finding' } }],
          };
        },
      };
    },
  }));
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  return { baseUrl: `http://127.0.0.1:${server.address().port}/api/report-workspace`, pool, providerCalls, server };
}

test('catalog exposes at least 15 tools with three complete source scenarios each', () => {
  assert.ok(features.length >= 15);
  for (const feature of features) {
    assert.match(feature.id, /\S/);
    assert.match(feature.title, /\S/);
    assert.equal(feature.samples.length, 3);
    for (const sample of feature.samples) {
      assert.match(sample.label, /\S/);
      assert.match(sample.value, /\S/);
    }
  }
});

test('field validation retains all required and optional report fields', () => {
  assert.deepEqual(validateFields(completeFields), completeFields);
  assert.throws(() => validateFields({ ...completeFields, goal: '' }), /desired outcome/);
  assert.throws(() => validateFields({ ...completeFields, unexpected: 'value' }), /invalid or too long/);
});

test('OpenRouter report lifecycle generates, lists, edits, and deletes saved reports', async (t) => {
  const { baseUrl, pool, providerCalls, server } = await createTestServer();
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const feature = features[0];

  let response = await fetch(`${baseUrl}/runs?feature=${encodeURIComponent(feature.id)}`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { items: [] });

  response = await fetch(`${baseUrl}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ feature: feature.id, fields: completeFields }),
  });
  assert.equal(response.status, 200);
  const created = (await response.json()).item;
  assert.equal(created.input.context, completeFields.context);
  assert.match(created.result, /Verified fixture report/);
  assert.equal(created.model, 'test/model');
  assert.equal(providerCalls.length, 1);
  assert.equal(providerCalls[0].url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(providerCalls[0].body.messages[1].content.includes('SOURCE DATA\nsource_data example'), true);
  assert.equal(pool.rows.length, 1);

  response = await fetch(`${baseUrl}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ feature: feature.id, id: created.id, fields: { ...completeFields, goal: 'updated goal' } }),
  });
  assert.equal(response.status, 200);
  const updated = (await response.json()).item;
  assert.equal(updated.id, created.id);
  assert.equal(updated.input.goal, 'updated goal');
  assert.equal(pool.rows.length, 1);

  response = await fetch(`${baseUrl}/runs/${created.id}`, { method: 'DELETE' });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { deleted: true });
  assert.equal(pool.rows.length, 0);
});

test('provider errors are readable and do not create saved rows', async (t) => {
  const pool = createMemoryPool();
  const app = express();
  app.use(express.json());
  app.use('/api/report-workspace', createAIWorkspaceRouter({
    pool,
    features,
    env: { OPENROUTER_API_KEY: 'test-key' },
    authenticateToken(req, _res, next) { req.user = { id: 'user-1' }; next(); },
    fetchImpl: async () => ({ ok: false, status: 429, async json() { return { error: { message: 'Try again later.' } }; } }),
  }));
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/report-workspace/run`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ feature: features[0].id, fields: completeFields }),
  });
  assert.equal(response.status, 429);
  assert.deepEqual(await response.json(), { error: 'Try again later.' });
  assert.equal(pool.rows.length, 0);
});
