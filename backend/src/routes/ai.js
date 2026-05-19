/**
 * General AI routes — rule lookup, mood advisor, campaign timeline
 * Entity-specific AI endpoints live in their respective route files.
 */
const router = require('express').Router();
const Joi = require('joi');
const { prisma } = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { getPagination, buildPaginationMeta } = require('../lib/paginate');
const {
  lookupRule,
  generateMoodAdvisor,
  generateLootHoard,
  generateRandomEvent,
  generatePuzzle,
  generateTavern,
  generateBoardGameTeachingScript,
  generateBoardGameTournamentBracket,
} = require('../services/ai');
const { aiRateLimiter } = require('../middleware/rateLimiter');

router.use(authenticate);

// POST /api/ai/rule-lookup
router.post('/rule-lookup', aiRateLimiter, async (req, res) => {
  const schema = Joi.object({
    system: Joi.string().max(100).required(),
    question: Joi.string().min(5).max(1000).required(),
    campaignId: Joi.string().uuid().optional().allow(null),
  });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const result = await lookupRule({
    userId: req.user.id,
    campaignId: value.campaignId || null,
    system: value.system,
    question: value.question,
  });
  res.json({ data: result.parsedResult || result.rawResponse, tokensUsed: result.tokensUsed });
});

// POST /api/ai/mood-advisor
router.post('/mood-advisor', aiRateLimiter, async (req, res) => {
  const schema = Joi.object({
    sceneType: Joi.string().max(100).optional().allow(''),
    genre: Joi.string().max(50).optional().allow(''),
    system: Joi.string().max(100).optional().allow(''),
    currentTension: Joi.string().valid('low', 'medium', 'high', 'climax').default('medium'),
  });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const result = await generateMoodAdvisor({ userId: req.user.id, ...value });
  res.json({ data: result.parsedResult || result.rawResponse, tokensUsed: result.tokensUsed });
});

// ─────────────────────────────────────────────
// Apply pass 5 — additive AI endpoints (NEEDS-CREDS: ANTHROPIC_API_KEY)
// 503 enforced via index.js startup gate; AI errors mapped to 502 in error handler.
// ─────────────────────────────────────────────

// POST /api/ai/loot-hoard
router.post('/loot-hoard', aiRateLimiter, async (req, res) => {
  const schema = Joi.object({
    campaignId: Joi.string().uuid().optional().allow(null),
    partyLevel: Joi.number().integer().min(1).max(20).default(5),
    partySize: Joi.number().integer().min(1).max(12).default(4),
    theme: Joi.string().max(120).optional().allow(''),
    rarityBias: Joi.string().max(60).optional().allow(''),
  });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });
  const result = await generateLootHoard({ userId: req.user.id, campaignId: value.campaignId || null, ...value });
  res.json({ data: result.parsedResult || result.rawResponse, tokensUsed: result.tokensUsed });
});

// POST /api/ai/random-event
router.post('/random-event', aiRateLimiter, async (req, res) => {
  const schema = Joi.object({
    campaignId: Joi.string().uuid().optional().allow(null),
    sessionId: Joi.string().uuid().optional().allow(null),
    location: Joi.string().max(120).optional().allow(''),
    timeOfDay: Joi.string().max(40).optional().allow(''),
    partyMood: Joi.string().max(60).optional().allow(''),
  });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });
  const result = await generateRandomEvent({ userId: req.user.id, ...value });
  res.json({ data: result.parsedResult || result.rawResponse, tokensUsed: result.tokensUsed });
});

// POST /api/ai/puzzle
router.post('/puzzle', aiRateLimiter, async (req, res) => {
  const schema = Joi.object({
    campaignId: Joi.string().uuid().optional().allow(null),
    difficulty: Joi.string().valid('easy', 'medium', 'hard', 'deadly').default('medium'),
    theme: Joi.string().max(120).optional().allow(''),
    partySize: Joi.number().integer().min(1).max(12).default(4),
  });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });
  const result = await generatePuzzle({ userId: req.user.id, ...value });
  res.json({ data: result.parsedResult || result.rawResponse, tokensUsed: result.tokensUsed });
});

// POST /api/ai/tavern
router.post('/tavern', aiRateLimiter, async (req, res) => {
  const schema = Joi.object({
    campaignId: Joi.string().uuid().optional().allow(null),
    location: Joi.string().max(120).optional().allow(''),
    vibe: Joi.string().max(60).optional().allow(''),
  });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });
  const result = await generateTavern({ userId: req.user.id, ...value });
  res.json({ data: result.parsedResult || result.rawResponse, tokensUsed: result.tokensUsed });
});

// POST /api/ai/boardgames/teaching-script
router.post('/boardgames/teaching-script', aiRateLimiter, async (req, res) => {
  const schema = Joi.object({
    gameId: Joi.string().uuid().optional().allow(null),
    gameName: Joi.string().min(1).max(200).required(),
    audience: Joi.string().max(120).optional().allow(''),
  });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });
  const result = await generateBoardGameTeachingScript({ userId: req.user.id, ...value });
  res.json({ data: result.parsedResult || result.rawResponse, tokensUsed: result.tokensUsed });
});

// POST /api/ai/boardgames/tournament-bracket
router.post('/boardgames/tournament-bracket', aiRateLimiter, async (req, res) => {
  const schema = Joi.object({
    gameId: Joi.string().uuid().optional().allow(null),
    gameName: Joi.string().min(1).max(200).required(),
    playerCount: Joi.number().integer().min(2).max(64).default(8),
    formatPreference: Joi.string().max(60).optional().allow(''),
  });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });
  const result = await generateBoardGameTournamentBracket({ userId: req.user.id, ...value });
  res.json({ data: result.parsedResult || result.rawResponse, tokensUsed: result.tokensUsed });
});

// GET /api/ai/history
router.get('/history', async (req, res) => {
  const { page, limit, skip, take } = getPagination(req.query);
  const where = { userId: req.user.id };
  if (req.query.feature) where.feature = req.query.feature;
  if (req.query.campaignId) where.campaignId = req.query.campaignId;

  const [data, total] = await Promise.all([
    prisma.aiResult.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
    prisma.aiResult.count({ where }),
  ]);
  res.json({ data, pagination: buildPaginationMeta(total, page, limit) });
});

// GET /api/ai/history/:id
router.get('/history/:id', async (req, res) => {
  const result = await prisma.aiResult.findFirst({ where: { id: req.params.id, userId: req.user.id } });
  if (!result) return res.status(404).json({ error: 'AI result not found.' });
  res.json({ data: result });
});

module.exports = router;
