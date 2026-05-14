const router = require('express').Router();
const Joi = require('joi');
const { prisma } = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { getPagination, buildPaginationMeta } = require('../lib/paginate');
const { generateLore } = require('../services/ai');
const { aiRateLimiter } = require('../middleware/rateLimiter');

const loreSchema = Joi.object({
  campaignId: Joi.string().uuid().required(),
  category: Joi.string().valid('location', 'faction', 'history', 'item', 'deity', 'creature', 'culture', 'event', 'other').required(),
  title: Joi.string().min(1).max(150).required(),
  content: Joi.string().min(1).max(10000).required(),
  tags: Joi.array().items(Joi.string()).default([]),
  isSecret: Joi.boolean().default(false),
});

router.use(authenticate);

// GET /api/lore
router.get('/', async (req, res) => {
  const { page, limit, skip, take } = getPagination(req.query);
  const where = {};
  if (req.query.campaignId) where.campaignId = req.query.campaignId;
  if (req.query.category) where.category = req.query.category;

  // Non-GM only sees non-secret lore
  const isGM = await prisma.campaign.findFirst({
    where: { id: req.query.campaignId, gmId: req.user.id },
  });
  if (!isGM) where.isSecret = false;

  const [data, total] = await Promise.all([
    prisma.loreEntry.findMany({ where, skip, take, orderBy: { updatedAt: 'desc' } }),
    prisma.loreEntry.count({ where }),
  ]);
  res.json({ data, pagination: buildPaginationMeta(total, page, limit) });
});

// GET /api/lore/:id
router.get('/:id', async (req, res) => {
  const entry = await prisma.loreEntry.findUnique({ where: { id: req.params.id } });
  if (!entry) return res.status(404).json({ error: 'Lore entry not found.' });

  if (entry.isSecret) {
    const isGM = await prisma.campaign.findFirst({ where: { id: entry.campaignId, gmId: req.user.id } });
    if (!isGM) return res.status(403).json({ error: 'This lore is secret.' });
  }

  res.json({ data: entry });
});

// POST /api/lore
router.post('/', async (req, res) => {
  const { error, value } = loreSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const isGM = await prisma.campaign.findFirst({ where: { id: value.campaignId, gmId: req.user.id } });
  if (!isGM) return res.status(403).json({ error: 'Only the campaign GM can add lore.' });

  const entry = await prisma.loreEntry.create({ data: value });
  res.status(201).json({ data: entry });
});

// PUT /api/lore/:id
router.put('/:id', async (req, res) => {
  const existing = await prisma.loreEntry.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Lore entry not found.' });

  const isGM = await prisma.campaign.findFirst({ where: { id: existing.campaignId, gmId: req.user.id } });
  if (!isGM) return res.status(403).json({ error: 'Only the campaign GM can edit lore.' });

  const schema = loreSchema.fork(Object.keys(loreSchema.describe().keys), (s) => s.optional());
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const updated = await prisma.loreEntry.update({ where: { id: req.params.id }, data: value });
  res.json({ data: updated });
});

// DELETE /api/lore/:id
router.delete('/:id', async (req, res) => {
  const existing = await prisma.loreEntry.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Lore entry not found.' });

  const isGM = await prisma.campaign.findFirst({ where: { id: existing.campaignId, gmId: req.user.id } });
  if (!isGM) return res.status(403).json({ error: 'Only the campaign GM can delete lore.' });

  await prisma.loreEntry.delete({ where: { id: req.params.id } });
  res.json({ message: 'Lore entry deleted.' });
});

// POST /api/lore/:id/reveal - GM reveals secret lore
router.post('/:id/reveal', async (req, res) => {
  const existing = await prisma.loreEntry.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Lore entry not found.' });

  const isGM = await prisma.campaign.findFirst({ where: { id: existing.campaignId, gmId: req.user.id } });
  if (!isGM) return res.status(403).json({ error: 'Only the GM can reveal lore.' });

  const updated = await prisma.loreEntry.update({
    where: { id: req.params.id },
    data: { isSecret: false, revealedAt: new Date() },
  });
  res.json({ data: updated, message: 'Lore revealed to players.' });
});

// POST /api/lore/ai/generate
router.post('/ai/generate', aiRateLimiter, async (req, res) => {
  const schema = Joi.object({
    campaignId: Joi.string().uuid().optional().allow(null),
    category: Joi.string().valid('location', 'faction', 'history', 'item', 'deity', 'creature', 'culture', 'event').optional(),
    existingLore: Joi.string().max(2000).optional().allow(''),
    genre: Joi.string().optional().allow(''),
    system: Joi.string().optional().allow(''),
    save: Joi.boolean().default(false),
  });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const result = await generateLore({
    campaignId: value.campaignId,
    userId: req.user.id,
    category: value.category,
    existingLore: value.existingLore,
    genre: value.genre,
    system: value.system,
  });

  let saved = null;
  if (value.save && result.parsedResult && value.campaignId) {
    const p = result.parsedResult;
    saved = await prisma.loreEntry.create({
      data: {
        campaignId: value.campaignId,
        category: p.category || value.category || 'other',
        title: p.title || 'Generated Lore',
        content: p.content || '',
        tags: p.tags || [],
        isSecret: p.isSecret || false,
      },
    });
  }

  res.json({ data: result.parsedResult || result.rawResponse, saved, tokensUsed: result.tokensUsed });
});

module.exports = router;
