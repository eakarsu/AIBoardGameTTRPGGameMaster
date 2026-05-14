const router = require('express').Router();
const Joi = require('joi');
const { prisma } = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { getPagination, buildPaginationMeta } = require('../lib/paginate');
const { generateNPC, generateNPCDialogue } = require('../services/ai');
const { aiRateLimiter } = require('../middleware/rateLimiter');

const npcSchema = Joi.object({
  campaignId: Joi.string().uuid().required(),
  name: Joi.string().min(1).max(100).required(),
  race: Joi.string().max(50).optional().allow(''),
  class: Joi.string().max(50).optional().allow(''),
  role: Joi.string().valid('merchant', 'villain', 'ally', 'neutral', 'quest-giver', 'rival').optional().allow(''),
  personality: Joi.string().max(1000).optional().allow(''),
  backstory: Joi.string().max(3000).optional().allow(''),
  motivation: Joi.string().max(1000).optional().allow(''),
  secrets: Joi.string().max(1000).optional().allow(''),
  location: Joi.string().max(200).optional().allow(''),
  avatarUrl: Joi.string().uri().optional().allow(''),
  notes: Joi.string().max(2000).optional().allow(''),
  stats: Joi.object().default({}),
  equipment: Joi.array().default([]),
  dialogue: Joi.array().default([]),
  isAlive: Joi.boolean().default(true),
});

router.use(authenticate);

// GET /api/npcs
router.get('/', async (req, res) => {
  const { page, limit, skip, take } = getPagination(req.query);
  const where = {};
  if (req.query.campaignId) where.campaignId = req.query.campaignId;
  if (req.query.role) where.role = req.query.role;
  if (req.query.isAlive !== undefined) where.isAlive = req.query.isAlive === 'true';

  const [data, total] = await Promise.all([
    prisma.npc.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
    prisma.npc.count({ where }),
  ]);
  res.json({ data, pagination: buildPaginationMeta(total, page, limit) });
});

// GET /api/npcs/:id
router.get('/:id', async (req, res) => {
  const npc = await prisma.npc.findUnique({ where: { id: req.params.id } });
  if (!npc) return res.status(404).json({ error: 'NPC not found.' });
  res.json({ data: npc });
});

// POST /api/npcs
router.post('/', async (req, res) => {
  const { error, value } = npcSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const npc = await prisma.npc.create({ data: value });
  res.status(201).json({ data: npc });
});

// PUT /api/npcs/:id
router.put('/:id', async (req, res) => {
  const existing = await prisma.npc.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'NPC not found.' });

  const schema = npcSchema.fork(Object.keys(npcSchema.describe().keys), (s) => s.optional());
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const updated = await prisma.npc.update({ where: { id: req.params.id }, data: value });
  res.json({ data: updated });
});

// DELETE /api/npcs/:id
router.delete('/:id', async (req, res) => {
  const existing = await prisma.npc.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'NPC not found.' });

  await prisma.npc.delete({ where: { id: req.params.id } });
  res.json({ message: 'NPC deleted.' });
});

// POST /api/npcs/ai/generate
router.post('/ai/generate', aiRateLimiter, async (req, res) => {
  const schema = Joi.object({
    campaignId: Joi.string().uuid().optional().allow(null),
    role: Joi.string().optional().allow(''),
    genre: Joi.string().optional().allow(''),
    system: Joi.string().optional().allow(''),
    existingNpcs: Joi.array().items(Joi.string()).default([]),
    save: Joi.boolean().default(false),
  });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const result = await generateNPC({
    campaignId: value.campaignId,
    userId: req.user.id,
    role: value.role,
    genre: value.genre,
    system: value.system,
    existingNpcs: value.existingNpcs,
  });

  let saved = null;
  if (value.save && result.parsedResult && value.campaignId) {
    const p = result.parsedResult;
    saved = await prisma.npc.create({
      data: {
        campaignId: value.campaignId,
        name: p.name || 'Unknown NPC',
        race: p.race || '',
        class: p.class || '',
        role: p.role || 'neutral',
        personality: p.personality || '',
        backstory: p.backstory || '',
        motivation: p.motivation || '',
        secrets: p.secrets || '',
        location: p.location || '',
        stats: p.stats || {},
        equipment: p.equipment || [],
        dialogue: p.dialogue || [],
      },
    });
  }

  res.json({ data: result.parsedResult || result.rawResponse, saved, tokensUsed: result.tokensUsed });
});

// POST /api/npcs/:id/ai/dialogue
router.post('/:id/ai/dialogue', aiRateLimiter, async (req, res) => {
  const npc = await prisma.npc.findUnique({ where: { id: req.params.id } });
  if (!npc) return res.status(404).json({ error: 'NPC not found.' });

  const schema = Joi.object({
    situation: Joi.string().min(1).max(1000).required(),
    characterData: Joi.object().optional(),
  });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const result = await generateNPCDialogue({
    npcId: npc.id,
    userId: req.user.id,
    campaignId: npc.campaignId,
    npcData: npc,
    situation: value.situation,
    characterData: value.characterData,
  });

  // Persist generated dialogue to NPC
  if (result.parsedResult?.responses) {
    const existingDialogue = Array.isArray(npc.dialogue) ? npc.dialogue : [];
    const newLines = result.parsedResult.responses.map((r) => ({
      trigger: r.playerPrompt,
      line: r.dialogue,
    }));
    await prisma.npc.update({
      where: { id: npc.id },
      data: { dialogue: [...existingDialogue, ...newLines] },
    });
  }

  res.json({ data: result.parsedResult || result.rawResponse, tokensUsed: result.tokensUsed });
});

module.exports = router;
