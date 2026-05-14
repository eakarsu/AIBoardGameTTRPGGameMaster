const router = require('express').Router();
const Joi = require('joi');
const { prisma } = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { getPagination, buildPaginationMeta } = require('../lib/paginate');
const {
  boardGameRulesLookup,
  boardGameStrategyAdvice,
  boardGameScenarioGen,
  boardGameVariantRules,
} = require('../services/ai');
const { aiRateLimiter } = require('../middleware/rateLimiter');

const gameSchema = Joi.object({
  name: Joi.string().min(1).max(150).required(),
  description: Joi.string().max(2000).optional().allow(''),
  minPlayers: Joi.number().integer().min(1).default(2),
  maxPlayers: Joi.number().integer().min(1).default(4),
  complexity: Joi.string().valid('light', 'medium', 'heavy').default('medium'),
  category: Joi.string().max(100).optional().allow(''),
  bggId: Joi.string().max(20).optional().allow(''),
  imageUrl: Joi.string().uri().optional().allow(''),
  rules: Joi.string().max(50000).optional().allow(''),
  tags: Joi.array().items(Joi.string()).default([]),
});

router.use(authenticate);

// GET /api/boardgames
router.get('/', async (req, res) => {
  const { page, limit, skip, take } = getPagination(req.query);
  const where = {};
  if (req.query.complexity) where.complexity = req.query.complexity;
  if (req.query.category) where.category = { contains: req.query.category, mode: 'insensitive' };
  if (req.query.q) where.name = { contains: req.query.q, mode: 'insensitive' };

  const [data, total] = await Promise.all([
    prisma.boardGame.findMany({ where, skip, take, orderBy: { name: 'asc' } }),
    prisma.boardGame.count({ where }),
  ]);
  res.json({ data, pagination: buildPaginationMeta(total, page, limit) });
});

// GET /api/boardgames/:id
router.get('/:id', async (req, res) => {
  const game = await prisma.boardGame.findUnique({
    where: { id: req.params.id },
    include: { _count: { select: { sessions: true } } },
  });
  if (!game) return res.status(404).json({ error: 'Board game not found.' });
  res.json({ data: game });
});

// POST /api/boardgames
router.post('/', async (req, res) => {
  const { error, value } = gameSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const game = await prisma.boardGame.create({ data: value });
  res.status(201).json({ data: game });
});

// PUT /api/boardgames/:id
router.put('/:id', async (req, res) => {
  const existing = await prisma.boardGame.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Board game not found.' });

  const schema = gameSchema.fork(Object.keys(gameSchema.describe().keys), (s) => s.optional());
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const updated = await prisma.boardGame.update({ where: { id: req.params.id }, data: value });
  res.json({ data: updated });
});

// DELETE /api/boardgames/:id
router.delete('/:id', async (req, res) => {
  const existing = await prisma.boardGame.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Board game not found.' });

  await prisma.boardGame.delete({ where: { id: req.params.id } });
  res.json({ message: 'Board game deleted.' });
});

// ── Board Game Sessions ──

// GET /api/boardgames/:id/sessions
router.get('/:id/sessions', async (req, res) => {
  const { page, limit, skip, take } = getPagination(req.query);
  const [data, total] = await Promise.all([
    prisma.boardGameSession.findMany({
      where: { gameId: req.params.id }, skip, take,
      orderBy: { playedAt: 'desc' },
    }),
    prisma.boardGameSession.count({ where: { gameId: req.params.id } }),
  ]);
  res.json({ data, pagination: buildPaginationMeta(total, page, limit) });
});

// POST /api/boardgames/:id/sessions
router.post('/:id/sessions', async (req, res) => {
  const game = await prisma.boardGame.findUnique({ where: { id: req.params.id } });
  if (!game) return res.status(404).json({ error: 'Board game not found.' });

  const schema = Joi.object({
    players: Joi.array().items(Joi.object({ name: Joi.string().required(), score: Joi.number().optional() })).default([]),
    winnerId: Joi.string().optional().allow('', null),
    notes: Joi.string().max(2000).optional().allow(''),
    playedAt: Joi.date().iso().default(() => new Date()),
    durationMin: Joi.number().integer().min(1).optional().allow(null),
  });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const session = await prisma.boardGameSession.create({
    data: { gameId: req.params.id, ...value },
  });
  res.status(201).json({ data: session });
});

// ── Board Game AI Endpoints ──

// POST /api/boardgames/:id/ai/rules
router.post('/:id/ai/rules', aiRateLimiter, async (req, res) => {
  const game = await prisma.boardGame.findUnique({ where: { id: req.params.id } });
  if (!game) return res.status(404).json({ error: 'Board game not found.' });

  const schema = Joi.object({
    question: Joi.string().min(5).max(1000).required(),
    sessionId: Joi.string().uuid().optional().allow(null),
  });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const result = await boardGameRulesLookup({
    userId: req.user.id,
    gameId: game.id,
    sessionId: value.sessionId || null,
    gameName: game.name,
    question: value.question,
    rules: game.rules,
  });
  res.json({ data: result.parsedResult || result.rawResponse, tokensUsed: result.tokensUsed });
});

// POST /api/boardgames/:id/ai/strategy
router.post('/:id/ai/strategy', aiRateLimiter, async (req, res) => {
  const game = await prisma.boardGame.findUnique({ where: { id: req.params.id } });
  if (!game) return res.status(404).json({ error: 'Board game not found.' });

  const schema = Joi.object({
    gameState: Joi.object().required(),
    playerName: Joi.string().optional().allow(''),
    sessionId: Joi.string().uuid().optional().allow(null),
  });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const result = await boardGameStrategyAdvice({
    userId: req.user.id,
    gameId: game.id,
    sessionId: value.sessionId || null,
    gameName: game.name,
    gameState: value.gameState,
    playerName: value.playerName,
  });
  res.json({ data: result.parsedResult || result.rawResponse, tokensUsed: result.tokensUsed });
});

// POST /api/boardgames/:id/ai/scenario
router.post('/:id/ai/scenario', aiRateLimiter, async (req, res) => {
  const game = await prisma.boardGame.findUnique({ where: { id: req.params.id } });
  if (!game) return res.status(404).json({ error: 'Board game not found.' });

  const schema = Joi.object({
    complexity: Joi.string().valid('light', 'medium', 'heavy').default('medium'),
    playerCount: Joi.number().integer().min(1).max(12).optional(),
  });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const result = await boardGameScenarioGen({
    userId: req.user.id,
    gameId: game.id,
    gameName: game.name,
    complexity: value.complexity,
    playerCount: value.playerCount || game.maxPlayers,
  });
  res.json({ data: result.parsedResult || result.rawResponse, tokensUsed: result.tokensUsed });
});

// POST /api/boardgames/:id/ai/variants
router.post('/:id/ai/variants', aiRateLimiter, async (req, res) => {
  const game = await prisma.boardGame.findUnique({ where: { id: req.params.id } });
  if (!game) return res.status(404).json({ error: 'Board game not found.' });

  const schema = Joi.object({
    playerCount: Joi.number().integer().min(1).max(12).optional(),
    replayGoal: Joi.string().max(500).optional().allow(''),
  });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const result = await boardGameVariantRules({
    userId: req.user.id,
    gameId: game.id,
    gameName: game.name,
    playerCount: value.playerCount || game.maxPlayers,
    replayGoal: value.replayGoal,
  });
  res.json({ data: result.parsedResult || result.rawResponse, tokensUsed: result.tokensUsed });
});

module.exports = router;
