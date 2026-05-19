const router = require('express').Router();
const Joi = require('joi');
const { authenticate } = require('../middleware/auth');
const { rollDice, rollMultiple } = require('../lib/dice');

router.use(authenticate);

// POST /api/dice/roll
router.post('/roll', async (req, res) => {
  const schema = Joi.object({
    expression: Joi.string().min(1).max(50).required(),
    label: Joi.string().max(100).optional().allow(''),
  });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  try {
    const result = rollDice(value.expression);
    res.json({ data: { ...result, label: value.label || null } });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// POST /api/dice/roll-many
router.post('/roll-many', async (req, res) => {
  const schema = Joi.object({
    rolls: Joi.array().items(Joi.object({
      expression: Joi.string().min(1).max(50).required(),
      label: Joi.string().max(100).optional().allow(''),
    })).min(1).max(20).required(),
  });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const expressions = value.rolls.map((r) => r.expression);
  const results = rollMultiple(expressions);
  const labeled = results.map((r, i) => ({ ...r, label: value.rolls[i].label || null }));

  res.json({ data: labeled });
});

// GET /api/dice/standard - reference for common dice expressions
router.get('/standard', (req, res) => {
  res.json({
    data: {
      common: ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'],
      statRolls: ['4d6kh3', '3d6'],
      damageExamples: ['1d8+3', '2d6', '1d4-1'],
      attackExamples: ['d20+5', 'd20+8'],
      description: 'Supported syntax: NdM, NdM+modifier, NdMkhK (keep highest), NdMklK (keep lowest)',
    },
  });
});

module.exports = router;
