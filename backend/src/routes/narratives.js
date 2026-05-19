const router = require('express').Router();
const Joi = require('joi');
const { prisma } = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { getPagination, buildPaginationMeta } = require('../lib/paginate');
const { generateNarrative } = require('../services/ai');
const { aiRateLimiter } = require('../middleware/rateLimiter');

router.use(authenticate);

// POST /api/narratives/generate
router.post('/generate', aiRateLimiter, async (req, res) => {
  const schema = Joi.object({
    campaignId: Joi.string().uuid().optional().allow(null),
    characterId: Joi.string().uuid().optional().allow(null),
    type: Joi.string().valid('scene', 'backstory', 'dream', 'vision', 'cutscene').default('scene'),
    prompt: Joi.string().min(5).max(2000).required(),
    mood: Joi.string().max(50).optional().allow(''),
    genre: Joi.string().optional().allow(''),
    system: Joi.string().optional().allow(''),
    context: Joi.string().max(2000).optional().allow(''),
    tags: Joi.array().items(Joi.string()).default([]),
    isPublic: Joi.boolean().default(true),
    save: Joi.boolean().default(true),
  });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const result = await generateNarrative({
    campaignId: value.campaignId,
    characterId: value.characterId,
    userId: req.user.id,
    type: value.type,
    prompt: value.prompt,
    mood: value.mood,
    genre: value.genre,
    system: value.system,
    context: value.context,
  });

  let saved = null;
  if (value.save && result.parsedResult) {
    saved = await prisma.narrative.create({
      data: {
        campaignId: value.campaignId || null,
        characterId: value.characterId || null,
        userId: req.user.id,
        type: value.type,
        prompt: value.prompt,
        content: result.parsedResult.content || result.rawResponse,
        mood: result.parsedResult.mood || value.mood || null,
        tags: value.tags,
        isPublic: value.isPublic,
      },
    });
  }

  res.json({ data: result.parsedResult || result.rawResponse, saved, tokensUsed: result.tokensUsed });
});

// GET /api/narratives
router.get('/', async (req, res) => {
  const { page, limit, skip, take } = getPagination(req.query);
  const where = {};
  if (req.query.campaignId) where.campaignId = req.query.campaignId;
  if (req.query.characterId) where.characterId = req.query.characterId;
  if (req.query.type) where.type = req.query.type;

  // Only show public narratives or own narratives
  where.OR = [{ isPublic: true }, { userId: req.user.id }];

  const [data, total] = await Promise.all([
    prisma.narrative.findMany({
      where, skip, take,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, username: true, displayName: true } } },
    }),
    prisma.narrative.count({ where }),
  ]);
  res.json({ data, pagination: buildPaginationMeta(total, page, limit) });
});

// GET /api/narratives/:id
router.get('/:id', async (req, res) => {
  const narrative = await prisma.narrative.findUnique({
    where: { id: req.params.id },
    include: { user: { select: { id: true, username: true, displayName: true } } },
  });
  if (!narrative) return res.status(404).json({ error: 'Narrative not found.' });
  if (!narrative.isPublic && narrative.userId !== req.user.id) {
    return res.status(403).json({ error: 'Access denied.' });
  }
  res.json({ data: narrative });
});

// DELETE /api/narratives/:id
router.delete('/:id', async (req, res) => {
  const narrative = await prisma.narrative.findFirst({ where: { id: req.params.id, userId: req.user.id } });
  if (!narrative) return res.status(404).json({ error: 'Narrative not found or access denied.' });

  await prisma.narrative.delete({ where: { id: req.params.id } });
  res.json({ message: 'Narrative deleted.' });
});

module.exports = router;
