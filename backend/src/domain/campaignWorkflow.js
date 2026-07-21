'use strict';
const crypto = require('crypto');

class CampaignWorkflowError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

function buildSessionSnapshot(input) {
  if (!input || typeof input !== 'object') throw new CampaignWorkflowError('INVALID_INPUT', 'session snapshot is required');
  if (!input.campaignId || !input.sessionId || !input.ruleset || !input.ruleset.version) throw new CampaignWorkflowError('INVALID_INPUT', 'campaign, session, and versioned ruleset are required');
  if (!Array.isArray(input.participants) || input.participants.length === 0) throw new CampaignWorkflowError('INVALID_INPUT', 'participants are required');
  const blockers = [];
  const participantIds = new Set();
  for (const participant of input.participants) {
    if (!participant.userId || participantIds.has(participant.userId)) blockers.push({ code: 'INVALID_PARTICIPANT' });
    participantIds.add(participant.userId);
    if (!participant.consent || !Array.isArray(participant.consent.lines) || !Array.isArray(participant.consent.veils)) blockers.push({ code: 'CONSENT_SETTINGS_REQUIRED', userId: participant.userId });
  }
  for (const event of input.events || []) {
    if (!event.id || !event.type || !event.at || !event.actorId) blockers.push({ code: 'INVALID_EVENT' });
    if (event.ruleDecision && (!event.ruleDecision.sourceRef || !event.ruleDecision.sourceLicense)) blockers.push({ code: 'UNGROUNDED_RULE_DECISION', eventId: event.id });
    for (const tag of event.contentTags || []) {
      if (input.participants.some((participant) => participant.consent?.lines.includes(tag))) blockers.push({ code: 'CONSENT_LINE_VIOLATION', eventId: event.id, tag });
    }
  }
  const canonical = { campaignId: input.campaignId, sessionId: input.sessionId, ruleset: input.ruleset, participants: input.participants, characters: input.characters || [], encounters: input.encounters || [], events: input.events || [], aiProvenance: input.aiProvenance || [] };
  return { ...canonical, snapshotHash: crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex'), blockers, status: blockers.length ? 'blocked' : 'draft_export_ready' };
}

function publishSession(snapshot, actor) {
  if (!snapshot || snapshot.status !== 'draft_export_ready') throw new CampaignWorkflowError('INVALID_TRANSITION', 'session is not publishable');
  if (!actor || !['gm', 'admin'].includes(actor.role)) throw new CampaignWorkflowError('FORBIDDEN', 'GM approval required');
  return { ...snapshot, status: 'published', approvedBy: actor.id, approvedAt: new Date().toISOString(), exportFormat: 'campaign-session.v1+json' };
}

module.exports = { CampaignWorkflowError, buildSessionSnapshot, publishSession };
