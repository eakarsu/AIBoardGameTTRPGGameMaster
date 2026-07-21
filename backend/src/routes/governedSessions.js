'use strict';
const crypto = require('crypto');
const express = require('express');
const { prisma } = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { CampaignWorkflowError, buildSessionSnapshot, publishSession } = require('../domain/campaignWorkflow');
const router = express.Router();

async function accessibleCampaign(campaignId, user) {
  return prisma.campaign.findFirst({ where: { id: campaignId, OR: [{ gmId: user.id }, { players: { some: { userId: user.id } } }] }, select: { id: true, gmId: true } });
}

router.post('/', authenticate, async (req, res, next) => {
  const key = req.get('Idempotency-Key');
  if (!key || key.length > 200) return res.status(400).json({ error: 'A valid Idempotency-Key header is required' });
  let snapshot;
  try { snapshot = buildSessionSnapshot(req.body); }
  catch (error) { return res.status(422).json({ error: error.message, code: error.code }); }
  try {
    if (!await accessibleCampaign(snapshot.campaignId, req.user)) return res.status(404).json({ error: 'Campaign not found' });
    const requestHash = crypto.createHash('sha256').update(JSON.stringify(req.body)).digest('hex');
    const existing = await prisma.governedSessionSnapshot.findUnique({ where: { campaignId_idempotencyKey: { campaignId: snapshot.campaignId, idempotencyKey: key } } });
    if (existing) {
      if (existing.requestHash !== requestHash) return res.status(409).json({ error: 'Idempotency-Key was reused with different input' });
      return res.json({ workflow: existing, replayed: true });
    }
    const workflow = await prisma.$transaction(async (tx) => {
      const created = await tx.governedSessionSnapshot.create({ data: { campaignId: snapshot.campaignId, sessionId: snapshot.sessionId, idempotencyKey: key, requestHash, status: snapshot.status, snapshot, createdBy: req.user.id } });
      await tx.governedSessionEvent.create({ data: { workflowId: created.id, actorId: req.user.id, eventType: 'session.snapshot.created', toStatus: created.status, evidenceHash: snapshot.snapshotHash } });
      return created;
    });
    res.status(201).json({ workflow });
  } catch (error) { if (error.code === 'P2021') return res.status(503).json({ error: 'Prisma migration is required', code: 'MIGRATION_REQUIRED' }); next(error); }
});

router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const workflow = await prisma.governedSessionSnapshot.findUnique({ where: { id: req.params.id }, include: { events: { orderBy: { createdAt: 'asc' } } } });
    if (!workflow || !await accessibleCampaign(workflow.campaignId, req.user)) return res.status(404).json({ error: 'Workflow not found' });
    res.json({ workflow });
  } catch (error) { next(error); }
});

router.post('/:id/publish', authenticate, async (req, res, next) => {
  try {
    const current = await prisma.governedSessionSnapshot.findUnique({ where: { id: req.params.id } });
    if (!current) return res.status(404).json({ error: 'Workflow not found' });
    const campaign = await accessibleCampaign(current.campaignId, req.user);
    if (!campaign || (campaign.gmId !== req.user.id && req.user.role !== 'admin')) return res.status(403).json({ error: 'Only the campaign GM can publish this session' });
    let published;
    try { published = publishSession(current.snapshot, req.user); }
    catch (error) { return res.status(error.code === 'FORBIDDEN' ? 403 : 409).json({ error: error.message, code: error.code }); }
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.governedSessionSnapshot.updateMany({ where: { id: current.id, version: current.version }, data: { snapshot: published, status: published.status, approvedBy: req.user.id, version: { increment: 1 } } });
      if (result.count !== 1) throw new CampaignWorkflowError('CONCURRENT_CHANGE', 'workflow was concurrently modified');
      await tx.governedSessionEvent.create({ data: { workflowId: current.id, actorId: req.user.id, eventType: 'session.published', fromStatus: current.status, toStatus: published.status, evidenceHash: published.snapshotHash } });
      return tx.governedSessionSnapshot.findUnique({ where: { id: current.id } });
    });
    res.json({ workflow: updated });
  } catch (error) { if (error instanceof CampaignWorkflowError) return res.status(409).json({ error: error.message, code: error.code }); next(error); }
});

router.get('/:id/export', authenticate, async (req, res, next) => {
  try {
    const workflow = await prisma.governedSessionSnapshot.findUnique({ where: { id: req.params.id } });
    if (!workflow || !await accessibleCampaign(workflow.campaignId, req.user)) return res.status(404).json({ error: 'Workflow not found' });
    if (workflow.status !== 'published') return res.status(409).json({ error: 'Only approved sessions may be exported' });
    res.type('application/json').set('Content-Disposition', `attachment; filename="session-${workflow.sessionId}.json"`).send(JSON.stringify({ schema: 'campaign-session.v1', snapshot: workflow.snapshot }, null, 2));
  } catch (error) { next(error); }
});
module.exports = router;
