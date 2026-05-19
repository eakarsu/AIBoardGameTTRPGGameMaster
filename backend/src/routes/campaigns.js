const router = require('express').Router();
const Joi = require('joi');
const { prisma } = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { getPagination, buildPaginationMeta } = require('../lib/paginate');

const campaignSchema = Joi.object({
  name: Joi.string().min(1).max(100).required(),
  description: Joi.string().max(2000).optional().allow(''),
  genre: Joi.string().valid('fantasy', 'sci-fi', 'horror', 'modern', 'western', 'steampunk', 'post-apocalyptic', 'custom').default('fantasy'),
  system: Joi.string().max(50).required(),
  setting: Joi.string().max(3000).optional().allow(''),
  maxPlayers: Joi.number().integer().min(1).max(20).default(6),
  imageUrl: Joi.string().uri().optional().allow(''),
  tags: Joi.array().items(Joi.string()).default([]),
});

const updateSchema = campaignSchema.fork(
  ['name', 'system'],
  (s) => s.optional()
).append({
  status: Joi.string().valid('active', 'paused', 'completed', 'archived').optional(),
});

router.use(authenticate);

// GET /api/campaigns
router.get('/', async (req, res) => {
  const { page, limit, skip, take } = getPagination(req.query);
  const where = {
    OR: [
      { gmId: req.user.id },
      { players: { some: { userId: req.user.id } } },
    ],
  };
  if (req.query.status) where.status = req.query.status;

  const [data, total] = await Promise.all([
    prisma.campaign.findMany({
      where,
      skip,
      take,
      orderBy: { updatedAt: 'desc' },
      include: {
        gm: { select: { id: true, username: true, displayName: true } },
        players: { include: { user: { select: { id: true, username: true, displayName: true } } } },
        _count: { select: { sessions: true, characters: true, encounters: true, npcs: true } },
      },
    }),
    prisma.campaign.count({ where }),
  ]);

  res.json({ data, pagination: buildPaginationMeta(total, page, limit) });
});

// GET /api/campaigns/:id
router.get('/:id', async (req, res) => {
  const campaign = await prisma.campaign.findFirst({
    where: {
      id: req.params.id,
      OR: [{ gmId: req.user.id }, { players: { some: { userId: req.user.id } } }],
    },
    include: {
      gm: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      players: { include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } } },
      _count: { select: { sessions: true, characters: true, encounters: true, npcs: true, loreEntries: true } },
    },
  });
  if (!campaign) return res.status(404).json({ error: 'Campaign not found.' });
  res.json({ data: campaign });
});

// POST /api/campaigns
router.post('/', async (req, res) => {
  const { error, value } = campaignSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const campaign = await prisma.campaign.create({
    data: { ...value, gmId: req.user.id },
    include: { gm: { select: { id: true, username: true, displayName: true } } },
  });
  res.status(201).json({ data: campaign });
});

// PUT /api/campaigns/:id
router.put('/:id', async (req, res) => {
  const campaign = await prisma.campaign.findFirst({ where: { id: req.params.id, gmId: req.user.id } });
  if (!campaign) return res.status(404).json({ error: 'Campaign not found or access denied.' });

  const { error, value } = updateSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const updated = await prisma.campaign.update({ where: { id: req.params.id }, data: value });
  res.json({ data: updated });
});

// DELETE /api/campaigns/:id
router.delete('/:id', async (req, res) => {
  const campaign = await prisma.campaign.findFirst({ where: { id: req.params.id, gmId: req.user.id } });
  if (!campaign) return res.status(404).json({ error: 'Campaign not found or access denied.' });

  await prisma.campaign.delete({ where: { id: req.params.id } });
  res.json({ message: 'Campaign deleted.' });
});

// POST /api/campaigns/:id/invite
router.post('/:id/invite', async (req, res) => {
  const campaign = await prisma.campaign.findFirst({ where: { id: req.params.id, gmId: req.user.id } });
  if (!campaign) return res.status(404).json({ error: 'Campaign not found or access denied.' });

  const schema = Joi.object({
    userId: Joi.string().uuid().required(),
    role: Joi.string().valid('player', 'co-gm').default('player'),
  });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const existingPlayer = await prisma.campaignPlayer.findUnique({
    where: { campaignId_userId: { campaignId: req.params.id, userId: value.userId } },
  });
  if (existingPlayer) return res.status(409).json({ error: 'User is already in this campaign.' });

  const player = await prisma.campaignPlayer.create({
    data: { campaignId: req.params.id, userId: value.userId, role: value.role },
    include: { user: { select: { id: true, username: true, displayName: true } } },
  });
  res.status(201).json({ data: player });
});

// DELETE /api/campaigns/:id/players/:userId
router.delete('/:id/players/:userId', async (req, res) => {
  const campaign = await prisma.campaign.findFirst({ where: { id: req.params.id, gmId: req.user.id } });
  if (!campaign) return res.status(404).json({ error: 'Campaign not found or access denied.' });

  await prisma.campaignPlayer.deleteMany({
    where: { campaignId: req.params.id, userId: req.params.userId },
  });
  res.json({ message: 'Player removed.' });
});

// GET /api/campaigns/:id/timeline (AI feature)
router.get('/:id/timeline', async (req, res) => {
  const campaign = await prisma.campaign.findFirst({
    where: { id: req.params.id, OR: [{ gmId: req.user.id }, { players: { some: { userId: req.user.id } } }] },
    include: { sessions: { orderBy: { scheduledAt: 'asc' }, select: { id: true, title: true, summary: true, scheduledAt: true, status: true } } },
  });
  if (!campaign) return res.status(404).json({ error: 'Campaign not found.' });

  const { generateCampaignTimeline } = require('../services/ai');
  const result = await generateCampaignTimeline({
    campaignId: req.params.id,
    userId: req.user.id,
    sessions: campaign.sessions,
    keyEvents: [],
  });
  res.json({ data: result.parsedResult || result.rawResponse });
});

module.exports = router;
