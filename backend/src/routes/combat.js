const router = require('express').Router();
const Joi = require('joi');
const { prisma } = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { getPagination, buildPaginationMeta } = require('../lib/paginate');
const { rollDice } = require('../lib/dice');
const { generateCombatAdvice } = require('../services/ai');
const { aiRateLimiter } = require('../middleware/rateLimiter');

router.use(authenticate);

const combatSchema = Joi.object({
  encounterId: Joi.string().uuid().optional().allow(null),
  sessionId: Joi.string().uuid().optional().allow(null),
  name: Joi.string().min(1).max(120).required(),
  terrain: Joi.string().max(200).optional().allow(''),
  notes: Joi.string().max(2000).optional().allow(''),
  combatants: Joi.array().items(Joi.object({
    id: Joi.string().required(),
    name: Joi.string().required(),
    type: Joi.string().valid('player', 'npc', 'monster').default('monster'),
    hp: Joi.number().integer().min(0).required(),
    maxHp: Joi.number().integer().min(1).required(),
    ac: Joi.number().integer().min(0).default(10),
    initiativeBonus: Joi.number().integer().default(0),
    initiative: Joi.number().integer().optional(),
    characterId: Joi.string().uuid().optional().allow(null),
    conditions: Joi.array().items(Joi.string()).default([]),
  })).default([]),
});

// GET /api/combat
router.get('/', async (req, res) => {
  const { page, limit, skip, take } = getPagination(req.query);
  const where = {};
  if (req.query.sessionId) where.sessionId = req.query.sessionId;
  if (req.query.encounterId) where.encounterId = req.query.encounterId;
  if (req.query.status) where.status = req.query.status;

  const [data, total] = await Promise.all([
    prisma.combat.findMany({ where, skip, take, orderBy: { startedAt: 'desc' }, include: { _count: { select: { actions: true } } } }),
    prisma.combat.count({ where }),
  ]);
  res.json({ data, pagination: buildPaginationMeta(total, page, limit) });
});

// GET /api/combat/:id
router.get('/:id', async (req, res) => {
  const combat = await prisma.combat.findUnique({
    where: { id: req.params.id },
    include: { actions: { orderBy: { createdAt: 'asc' } } },
  });
  if (!combat) return res.status(404).json({ error: 'Combat not found.' });
  res.json({ data: combat });
});

// POST /api/combat - create combat
router.post('/', async (req, res) => {
  const { error, value } = combatSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const combat = await prisma.combat.create({ data: value });
  res.status(201).json({ data: combat });
});

// POST /api/combat/:id/roll-initiative - roll initiative for all combatants
router.post('/:id/roll-initiative', async (req, res) => {
  const combat = await prisma.combat.findUnique({ where: { id: req.params.id } });
  if (!combat) return res.status(404).json({ error: 'Combat not found.' });
  if (combat.status !== 'active') return res.status(400).json({ error: 'Combat is not active.' });

  const combatants = Array.isArray(combat.combatants) ? combat.combatants : [];
  const withInitiative = combatants.map((c) => {
    const roll = rollDice('d20');
    return { ...c, initiative: roll.total + (c.initiativeBonus || 0), initiativeRoll: roll.total };
  });

  const initiativeOrder = [...withInitiative].sort((a, b) => b.initiative - a.initiative).map((c) => ({
    id: c.id,
    name: c.name,
    initiative: c.initiative,
    type: c.type,
  }));

  const updated = await prisma.combat.update({
    where: { id: req.params.id },
    data: { combatants: withInitiative, initiativeOrder },
  });
  res.json({ data: updated, initiativeOrder });
});

// POST /api/combat/:id/next-round
router.post('/:id/next-round', async (req, res) => {
  const combat = await prisma.combat.findUnique({ where: { id: req.params.id } });
  if (!combat) return res.status(404).json({ error: 'Combat not found.' });
  if (combat.status !== 'active') return res.status(400).json({ error: 'Combat is not active.' });

  const updated = await prisma.combat.update({
    where: { id: req.params.id },
    data: { round: combat.round + 1 },
  });
  res.json({ data: updated });
});

// POST /api/combat/:id/action - record a combat action
router.post('/:id/action', async (req, res) => {
  const combat = await prisma.combat.findUnique({ where: { id: req.params.id } });
  if (!combat) return res.status(404).json({ error: 'Combat not found.' });

  const schema = Joi.object({
    actorName: Joi.string().required(),
    actionType: Joi.string().valid('attack', 'spell', 'ability', 'move', 'bonus', 'reaction', 'legendary', 'other').required(),
    description: Joi.string().min(1).max(1000).required(),
    diceExpression: Joi.string().optional().allow(''),
    outcome: Joi.string().valid('hit', 'miss', 'critical', 'save', 'fail', 'other').optional().allow(''),
    damage: Joi.number().integer().min(0).optional().allow(null),
    targetName: Joi.string().optional().allow(''),
    characterId: Joi.string().uuid().optional().allow(null),
  });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  let rollResult = null;
  if (value.diceExpression) {
    try { rollResult = rollDice(value.diceExpression); } catch (e) {}
  }

  // Apply damage to target in combat state
  let combatants = Array.isArray(combat.combatants) ? combat.combatants : [];
  if (value.damage && value.targetName) {
    combatants = combatants.map((c) => {
      if (c.name.toLowerCase() === value.targetName.toLowerCase()) {
        return { ...c, hp: Math.max(0, (c.hp || 0) - value.damage) };
      }
      return c;
    });
    await prisma.combat.update({ where: { id: req.params.id }, data: { combatants } });
  }

  const action = await prisma.combatAction.create({
    data: {
      combatId: req.params.id,
      characterId: value.characterId || null,
      userId: req.user.id,
      round: combat.round,
      actorName: value.actorName,
      actionType: value.actionType,
      description: value.description,
      rollResult,
      outcome: value.outcome || null,
      damage: value.damage || null,
    },
  });
  res.status(201).json({ data: action, rollResult, updatedCombatants: combatants });
});

// POST /api/combat/:id/apply-condition
router.post('/:id/apply-condition', async (req, res) => {
  const combat = await prisma.combat.findUnique({ where: { id: req.params.id } });
  if (!combat) return res.status(404).json({ error: 'Combat not found.' });

  const schema = Joi.object({
    targetId: Joi.string().required(),
    condition: Joi.string().valid(
      'blinded', 'charmed', 'deafened', 'exhaustion', 'frightened', 'grappled',
      'incapacitated', 'invisible', 'paralyzed', 'petrified', 'poisoned',
      'prone', 'restrained', 'stunned', 'unconscious', 'dead'
    ).required(),
    remove: Joi.boolean().default(false),
  });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  let combatants = Array.isArray(combat.combatants) ? combat.combatants : [];
  combatants = combatants.map((c) => {
    if (c.id === value.targetId) {
      const conds = Array.isArray(c.conditions) ? c.conditions : [];
      const updated = value.remove
        ? conds.filter((cond) => cond !== value.condition)
        : [...new Set([...conds, value.condition])];
      return { ...c, conditions: updated };
    }
    return c;
  });

  const updated = await prisma.combat.update({ where: { id: req.params.id }, data: { combatants } });
  res.json({ data: updated });
});

// POST /api/combat/:id/end
router.post('/:id/end', async (req, res) => {
  const combat = await prisma.combat.findUnique({ where: { id: req.params.id } });
  if (!combat) return res.status(404).json({ error: 'Combat not found.' });

  const schema = Joi.object({ status: Joi.string().valid('completed', 'fled').default('completed') });
  const { value } = schema.validate(req.body);

  const updated = await prisma.combat.update({
    where: { id: req.params.id },
    data: { status: value.status, endedAt: new Date() },
  });
  res.json({ data: updated });
});

// POST /api/combat/:id/ai/advice
router.post('/:id/ai/advice', aiRateLimiter, async (req, res) => {
  const combat = await prisma.combat.findUnique({ where: { id: req.params.id } });
  if (!combat) return res.status(404).json({ error: 'Combat not found.' });

  const campaign = combat.sessionId ? await prisma.gameSession.findUnique({
    where: { id: combat.sessionId },
    select: { campaign: { select: { system: true } } },
  }) : null;

  const result = await generateCombatAdvice({
    combatId: combat.id,
    sessionId: combat.sessionId,
    userId: req.user.id,
    combatState: combat,
    round: combat.round,
    partyConditions: (Array.isArray(combat.combatants) ? combat.combatants : []).filter((c) => c.type === 'player'),
    enemyConditions: (Array.isArray(combat.combatants) ? combat.combatants : []).filter((c) => c.type === 'monster'),
    system: campaign?.campaign?.system,
  });

  res.json({ data: result.parsedResult || result.rawResponse, tokensUsed: result.tokensUsed });
});

module.exports = router;
