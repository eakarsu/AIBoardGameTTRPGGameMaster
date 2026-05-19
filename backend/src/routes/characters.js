const router = require('express').Router();
const Joi = require('joi');
const { prisma } = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { getPagination, buildPaginationMeta } = require('../lib/paginate');
const { generateCharacterBackstory, generateCharacterArc } = require('../services/ai');
const { aiRateLimiter } = require('../middleware/rateLimiter');

const statsSchema = Joi.object({
  str: Joi.number().integer().min(1).max(30).default(10),
  dex: Joi.number().integer().min(1).max(30).default(10),
  con: Joi.number().integer().min(1).max(30).default(10),
  int: Joi.number().integer().min(1).max(30).default(10),
  wis: Joi.number().integer().min(1).max(30).default(10),
  cha: Joi.number().integer().min(1).max(30).default(10),
}).default({});

const characterSchema = Joi.object({
  name: Joi.string().min(1).max(80).required(),
  race: Joi.string().max(50).optional().allow(''),
  class: Joi.string().max(50).optional().allow(''),
  level: Joi.number().integer().min(1).max(20).default(1),
  background: Joi.string().max(100).optional().allow(''),
  alignment: Joi.string().max(30).optional().allow(''),
  backstory: Joi.string().max(5000).optional().allow(''),
  personality: Joi.string().max(500).optional().allow(''),
  ideals: Joi.string().max(500).optional().allow(''),
  bonds: Joi.string().max(500).optional().allow(''),
  flaws: Joi.string().max(500).optional().allow(''),
  stats: statsSchema,
  hp: Joi.number().integer().min(0).default(10),
  maxHp: Joi.number().integer().min(1).default(10),
  ac: Joi.number().integer().min(0).default(10),
  xp: Joi.number().integer().min(0).default(0),
  gold: Joi.number().integer().min(0).default(0),
  avatarUrl: Joi.string().uri().optional().allow(''),
  notes: Joi.string().max(3000).optional().allow(''),
  campaignId: Joi.string().uuid().optional().allow(null),
  equipment: Joi.array().default([]),
  spells: Joi.array().default([]),
  abilities: Joi.array().default([]),
  skills: Joi.object().default({}),
});

router.use(authenticate);

// GET /api/characters
router.get('/', async (req, res) => {
  const { page, limit, skip, take } = getPagination(req.query);
  const where = { userId: req.user.id };
  if (req.query.campaignId) where.campaignId = req.query.campaignId;
  if (req.query.isActive !== undefined) where.isActive = req.query.isActive === 'true';

  const [data, total] = await Promise.all([
    prisma.character.findMany({
      where, skip, take,
      orderBy: { updatedAt: 'desc' },
      include: { campaign: { select: { id: true, name: true } } },
    }),
    prisma.character.count({ where }),
  ]);
  res.json({ data, pagination: buildPaginationMeta(total, page, limit) });
});

// GET /api/characters/:id
router.get('/:id', async (req, res) => {
  const character = await prisma.character.findFirst({
    where: { id: req.params.id, userId: req.user.id },
    include: { campaign: { select: { id: true, name: true } } },
  });
  if (!character) return res.status(404).json({ error: 'Character not found.' });
  res.json({ data: character });
});

// POST /api/characters
router.post('/', async (req, res) => {
  const { error, value } = characterSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const character = await prisma.character.create({
    data: { ...value, userId: req.user.id },
    include: { campaign: { select: { id: true, name: true } } },
  });
  res.status(201).json({ data: character });
});

// PUT /api/characters/:id
router.put('/:id', async (req, res) => {
  const character = await prisma.character.findFirst({ where: { id: req.params.id, userId: req.user.id } });
  if (!character) return res.status(404).json({ error: 'Character not found.' });

  const schema = characterSchema.fork(Object.keys(characterSchema.describe().keys), (s) => s.optional());
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const updated = await prisma.character.update({ where: { id: req.params.id }, data: value });
  res.json({ data: updated });
});

// DELETE /api/characters/:id
router.delete('/:id', async (req, res) => {
  const character = await prisma.character.findFirst({ where: { id: req.params.id, userId: req.user.id } });
  if (!character) return res.status(404).json({ error: 'Character not found.' });

  await prisma.character.delete({ where: { id: req.params.id } });
  res.json({ message: 'Character deleted.' });
});

// POST /api/characters/:id/award-xp
router.post('/:id/award-xp', async (req, res) => {
  const character = await prisma.character.findFirst({ where: { id: req.params.id, userId: req.user.id } });
  if (!character) return res.status(404).json({ error: 'Character not found.' });

  const { error, value } = Joi.object({ xp: Joi.number().integer().min(1).required() }).validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const newXp = character.xp + value.xp;

  // D&D 5e XP thresholds
  const XP_THRESHOLDS = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
    85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];
  let newLevel = character.level;
  for (let lvl = 19; lvl >= 1; lvl--) {
    if (newXp >= XP_THRESHOLDS[lvl]) { newLevel = lvl + 1; break; }
  }
  if (newXp < XP_THRESHOLDS[1]) newLevel = 1;

  const leveledUp = newLevel > character.level;
  const updated = await prisma.character.update({
    where: { id: req.params.id },
    data: { xp: newXp, level: newLevel },
  });
  res.json({ data: updated, leveledUp, previousLevel: character.level });
});

// POST /api/characters/:id/ai/backstory
router.post('/:id/ai/backstory', aiRateLimiter, async (req, res) => {
  const character = await prisma.character.findFirst({ where: { id: req.params.id, userId: req.user.id } });
  if (!character) return res.status(404).json({ error: 'Character not found.' });

  const result = await generateCharacterBackstory({
    characterId: character.id,
    userId: req.user.id,
    characterData: character,
    genre: req.body.genre,
    system: req.body.system,
  });

  if (result.parsedResult) {
    await prisma.character.update({
      where: { id: character.id },
      data: { backstory: result.parsedResult.backstory || character.backstory },
    });
  }

  res.json({ data: result.parsedResult || result.rawResponse, tokensUsed: result.tokensUsed });
});

// POST /api/characters/:id/ai/arc
router.post('/:id/ai/arc', aiRateLimiter, async (req, res) => {
  const character = await prisma.character.findFirst({ where: { id: req.params.id, userId: req.user.id } });
  if (!character) return res.status(404).json({ error: 'Character not found.' });

  const result = await generateCharacterArc({
    characterId: character.id,
    userId: req.user.id,
    campaignId: character.campaignId,
    characterData: character,
    sessionHistory: req.body.sessionHistory,
  });

  res.json({ data: result.parsedResult || result.rawResponse, tokensUsed: result.tokensUsed });
});

module.exports = router;
