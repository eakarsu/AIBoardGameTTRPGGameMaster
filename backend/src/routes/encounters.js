const router = require('express').Router();
const Joi = require('joi');
const { prisma } = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { getPagination, buildPaginationMeta } = require('../lib/paginate');
const { generateEncounter } = require('../services/ai');
const { aiRateLimiter } = require('../middleware/rateLimiter');

const encounterSchema = Joi.object({
  campaignId: Joi.string().uuid().optional().allow(null),
  sessionId: Joi.string().uuid().optional().allow(null),
  name: Joi.string().min(1).max(120).required(),
  description: Joi.string().max(2000).optional().allow(''),
  difficulty: Joi.string().valid('trivial', 'easy', 'medium', 'hard', 'deadly').default('medium'),
  environment: Joi.string().max(100).optional().allow(''),
  monsters: Joi.array().default([]),
  rewards: Joi.object().default({}),
  notes: Joi.string().max(2000).optional().allow(''),
});

router.use(authenticate);

// GET /api/encounters
router.get('/', async (req, res) => {
  const { page, limit, skip, take } = getPagination(req.query);
  const where = {};
  if (req.query.campaignId) where.campaignId = req.query.campaignId;
  if (req.query.sessionId) where.sessionId = req.query.sessionId;
  if (req.query.difficulty) where.difficulty = req.query.difficulty;
  if (req.query.status) where.status = req.query.status;

  const [data, total] = await Promise.all([
    prisma.encounter.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
    prisma.encounter.count({ where }),
  ]);
  res.json({ data, pagination: buildPaginationMeta(total, page, limit) });
});

// GET /api/encounters/:id
router.get('/:id', async (req, res) => {
  const encounter = await prisma.encounter.findUnique({ where: { id: req.params.id } });
  if (!encounter) return res.status(404).json({ error: 'Encounter not found.' });
  res.json({ data: encounter });
});

// POST /api/encounters
router.post('/', async (req, res) => {
  const { error, value } = encounterSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const encounter = await prisma.encounter.create({ data: value });
  res.status(201).json({ data: encounter });
});

// PUT /api/encounters/:id
router.put('/:id', async (req, res) => {
  const existing = await prisma.encounter.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Encounter not found.' });

  const schema = encounterSchema.fork(Object.keys(encounterSchema.describe().keys), (s) => s.optional()).append({
    status: Joi.string().valid('pending', 'active', 'completed', 'skipped').optional(),
  });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const updated = await prisma.encounter.update({ where: { id: req.params.id }, data: value });
  res.json({ data: updated });
});

// DELETE /api/encounters/:id
router.delete('/:id', async (req, res) => {
  const existing = await prisma.encounter.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Encounter not found.' });

  await prisma.encounter.delete({ where: { id: req.params.id } });
  res.json({ message: 'Encounter deleted.' });
});

// POST /api/encounters/ai/generate
router.post('/ai/generate', aiRateLimiter, async (req, res) => {
  const schema = Joi.object({
    campaignId: Joi.string().uuid().optional().allow(null),
    sessionId: Joi.string().uuid().optional().allow(null),
    partyLevel: Joi.number().integer().min(1).max(20).default(5),
    partySize: Joi.number().integer().min(1).max(10).default(4),
    partyClasses: Joi.array().items(Joi.string()).default([]),
    difficulty: Joi.string().valid('trivial', 'easy', 'medium', 'hard', 'deadly').default('medium'),
    environment: Joi.string().max(100).optional().allow(''),
    genre: Joi.string().optional().allow(''),
    system: Joi.string().optional().allow(''),
    save: Joi.boolean().default(false),
  });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const result = await generateEncounter({
    campaignId: value.campaignId,
    sessionId: value.sessionId,
    userId: req.user.id,
    ...value,
  });

  let saved = null;
  if (value.save && result.parsedResult) {
    const p = result.parsedResult;
    saved = await prisma.encounter.create({
      data: {
        campaignId: value.campaignId || null,
        sessionId: value.sessionId || null,
        name: p.name || 'AI-Generated Encounter',
        description: p.description || '',
        difficulty: p.difficulty || value.difficulty,
        environment: p.environment || value.environment || '',
        monsters: p.monsters || [],
        rewards: p.rewards || {},
        notes: p.gmNotes || '',
      },
    });
  }

  res.json({ data: result.parsedResult || result.rawResponse, saved, tokensUsed: result.tokensUsed });
});

module.exports = router;
