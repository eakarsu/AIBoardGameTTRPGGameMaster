'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSessionSnapshot, publishSession } = require('../src/domain/campaignWorkflow');

const base = () => ({ campaignId: 'c1', sessionId: 's1', ruleset: { name: 'Original Rules', version: '1', license: 'owner-supplied' }, participants: [{ userId: 'p1', consent: { lines: ['graphic-harm'], veils: [] } }], events: [{ id: 'e1', type: 'roll', at: '2026-01-01T00:00:00Z', actorId: 'p1', contentTags: [], ruleDecision: { sourceRef: 'rule:12', sourceLicense: 'owner-supplied' } }] });

test('builds an exportable, provenance-preserving session snapshot', () => {
  const result = buildSessionSnapshot(base());
  assert.equal(result.status, 'draft_export_ready');
  assert.equal(publishSession(result, { id: 'gm1', role: 'gm' }).status, 'published');
});

test('blocks consent violations and ungrounded rulings', () => {
  const input = base(); input.events[0].contentTags = ['graphic-harm']; delete input.events[0].ruleDecision.sourceRef;
  const result = buildSessionSnapshot(input);
  assert.equal(result.status, 'blocked');
  assert.ok(result.blockers.some((b) => b.code === 'CONSENT_LINE_VIOLATION'));
  assert.throws(() => publishSession(result, { id: 'gm1', role: 'gm' }), /not publishable/);
});
