const router = require('express').Router();
const Joi = require('joi');
const { prisma } = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { getPagination, buildPaginationMeta } = require('../lib/paginate');
const { generateSessionSummary } = require('../services/ai');
const { aiRateLimiter } = require('../middleware/rateLimiter');

const sessionSchema = Joi.object({
  campaignId: Joi.string().uuid().required(),
  title: Joi.string().min(1).max(120).required(),
  description: Joi.string().max(2000).optional().allow(''),
  scheduledAt: Joi.date().iso().optional().allow(null),
  notes: Joi.string().max(3000).optional().allow(''),
});

const updateSchema = sessionSchema.fork(
  ['campaignId', 'title'],
  (s) => s.optional()
).append({
  status: Joi.string().valid('planned', 'active', 'completed').optional(),
  summary: Joi.string().max(5000).optional().allow(''),
  xpAwarded: Joi.number().integer().min(0).optional(),
  startedAt: Joi.date().iso().optional().allow(null),
  endedAt: Joi.date().iso().optional().allow(null),
});

router.use(authenticate);

// GET /api/sessions?campaignId=...
router.get('/', async (req, res) => {
  const { page, limit, skip, take } = getPagination(req.query);
  const where = {};
  if (req.query.campaignId) where.campaignId = req.query.campaignId;
  if (req.query.status) where.status = req.query.status;

  // Only GM or campaign player can see sessions
  where.OR = [
    { gmId: req.user.id },
    { campaign: { players: { some: { userId: req.user.id } } } },
  ];

  const [data, total] = await Promise.all([
    prisma.gameSession.findMany({
      where, skip, take,
      orderBy: { scheduledAt: 'desc' },
      include: {
        campaign: { select: { id: true, name: true } },
        gm: { select: { id: true, username: true, displayName: true } },
        _count: { select: { logs: true, combats: true, encounters: true } },
      },
    }),
    prisma.gameSession.count({ where }),
  ]);
  res.json({ data, pagination: buildPaginationMeta(total, page, limit) });
});

// GET /api/sessions/:id
router.get('/:id', async (req, res) => {
  const session = await prisma.gameSession.findFirst({
    where: {
      id: req.params.id,
      OR: [
        { gmId: req.user.id },
        { campaign: { players: { some: { userId: req.user.id } } } },
      ],
    },
    include: {
      campaign: { select: { id: true, name: true, system: true, genre: true } },
      gm: { select: { id: true, username: true, displayName: true } },
      logs: { orderBy: { createdAt: 'asc' }, take: 50 },
      encounters: true,
      combats: true,
    },
  });
  if (!session) return res.status(404).json({ error: 'Session not found.' });
  res.json({ data: session });
});

// POST /api/sessions
router.post('/', async (req, res) => {
  const { error, value } = sessionSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  // Verify user is GM of this campaign
  const campaign = await prisma.campaign.findFirst({ where: { id: value.campaignId, gmId: req.user.id } });
  if (!campaign) return res.status(403).json({ error: 'Only the campaign GM can create sessions.' });

  const session = await prisma.gameSession.create({
    data: { ...value, gmId: req.user.id },
    include: { campaign: { select: { id: true, name: true } } },
  });
  res.status(201).json({ data: session });
});

// PUT /api/sessions/:id
router.put('/:id', async (req, res) => {
  const session = await prisma.gameSession.findFirst({ where: { id: req.params.id, gmId: req.user.id } });
  if (!session) return res.status(404).json({ error: 'Session not found or access denied.' });

  const { error, value } = updateSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const updated = await prisma.gameSession.update({ where: { id: req.params.id }, data: value });
  res.json({ data: updated });
});

// DELETE /api/sessions/:id
router.delete('/:id', async (req, res) => {
  const session = await prisma.gameSession.findFirst({ where: { id: req.params.id, gmId: req.user.id } });
  if (!session) return res.status(404).json({ error: 'Session not found or access denied.' });

  await prisma.gameSession.delete({ where: { id: req.params.id } });
  res.json({ message: 'Session deleted.' });
});

// POST /api/sessions/:id/start
router.post('/:id/start', async (req, res) => {
  const session = await prisma.gameSession.findFirst({ where: { id: req.params.id, gmId: req.user.id } });
  if (!session) return res.status(404).json({ error: 'Session not found or access denied.' });
  if (session.status === 'completed') return res.status(400).json({ error: 'Session is already completed.' });

  const updated = await prisma.gameSession.update({
    where: { id: req.params.id },
    data: { status: 'active', startedAt: new Date() },
  });
  res.json({ data: updated });
});

// POST /api/sessions/:id/end
router.post('/:id/end', async (req, res) => {
  const session = await prisma.gameSession.findFirst({ where: { id: req.params.id, gmId: req.user.id } });
  if (!session) return res.status(404).json({ error: 'Session not found or access denied.' });

  const schema = Joi.object({ xpAwarded: Joi.number().integer().min(0).default(0) });
  const { value } = schema.validate(req.body);

  const updated = await prisma.gameSession.update({
    where: { id: req.params.id },
    data: { status: 'completed', endedAt: new Date(), xpAwarded: value.xpAwarded },
  });
  res.json({ data: updated });
});

// POST /api/sessions/:id/logs
router.post('/:id/logs', async (req, res) => {
  const session = await prisma.gameSession.findFirst({
    where: {
      id: req.params.id,
      OR: [
        { gmId: req.user.id },
        { campaign: { players: { some: { userId: req.user.id } } } },
      ],
    },
  });
  if (!session) return res.status(404).json({ error: 'Session not found.' });

  const schema = Joi.object({
    type: Joi.string().valid('narration', 'action', 'dialogue', 'roll', 'system').required(),
    content: Joi.string().min(1).max(5000).required(),
    metadata: Joi.object().default({}),
  });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const log = await prisma.sessionLog.create({
    data: { sessionId: req.params.id, userId: req.user.id, ...value },
  });
  res.status(201).json({ data: log });
});

// GET /api/sessions/:id/logs
router.get('/:id/logs', async (req, res) => {
  const { page, limit, skip, take } = getPagination(req.query);
  const [data, total] = await Promise.all([
    prisma.sessionLog.findMany({
      where: { sessionId: req.params.id },
      skip, take,
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { id: true, username: true, displayName: true } } },
    }),
    prisma.sessionLog.count({ where: { sessionId: req.params.id } }),
  ]);
  res.json({ data, pagination: buildPaginationMeta(total, page, limit) });
});

// POST /api/sessions/:id/ai/summary
router.post('/:id/ai/summary', aiRateLimiter, async (req, res) => {
  const session = await prisma.gameSession.findFirst({
    where: { id: req.params.id, gmId: req.user.id },
    include: {
      logs: { orderBy: { createdAt: 'asc' } },
      campaign: { select: { id: true } },
    },
  });
  if (!session) return res.status(404).json({ error: 'Session not found or access denied.' });

  const result = await generateSessionSummary({
    sessionId: session.id,
    userId: req.user.id,
    campaignId: session.campaign.id,
    logs: session.logs,
    title: session.title,
  });

  if (result.parsedResult?.summary) {
    await prisma.gameSession.update({
      where: { id: session.id },
      data: { summary: result.parsedResult.summary },
    });
  }

  res.json({ data: result.parsedResult || result.rawResponse, tokensUsed: result.tokensUsed });
});

module.exports = router;
