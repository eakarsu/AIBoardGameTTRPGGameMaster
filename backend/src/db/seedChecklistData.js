'use strict';

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const pad = (value) => String(value).padStart(2, '0');
const id = (kind, index) => `checklist-demo-${kind}-${pad(index)}`;

async function ensureChecklistRows(prisma, supplied = {}) {
  const gm = supplied.gm || await prisma.user.findUnique({ where: { username: 'dungeon_master' } });
  if (!gm) throw new Error('Seed the dungeon_master account before adding checklist demo rows.');

  const baseCampaign = supplied.campaign || await prisma.campaign.findFirst({ where: { gmId: gm.id }, orderBy: { createdAt: 'asc' } });
  if (!baseCampaign) throw new Error('Seed a demo campaign before adding checklist demo rows.');

  const baseSession = supplied.session || await prisma.gameSession.findFirst({ where: { campaignId: baseCampaign.id }, orderBy: { createdAt: 'asc' } });
  if (!baseSession) throw new Error('Seed a demo session before adding checklist demo rows.');

  const baseGame = supplied.catan || await prisma.boardGame.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!baseGame) throw new Error('Seed a board game before adding checklist demo rows.');

  for (let index = 1; index <= 15; index += 1) {
    const number = pad(index);
    const campaign = await prisma.campaign.upsert({
      where: { id: id('campaign', index) },
      update: {},
      create: {
        id: id('campaign', index),
        name: `Demo Chronicle ${number}`,
        description: `Fictional demo campaign ${number} for exercising lists, filters, and planning workflows.`,
        genre: index % 2 ? 'fantasy' : 'science-fantasy',
        system: index % 3 ? 'D&D 5e' : 'Custom d20',
        setting: `Training realm ${number}; all names and events are fictional demo data.`,
        status: index % 5 === 0 ? 'paused' : 'active',
        maxPlayers: 4 + (index % 3),
        gmId: gm.id,
        tags: ['demo', 'fictional-training'],
      },
    });

    const character = await prisma.character.upsert({
      where: { id: id('character', index) },
      update: {},
      create: {
        id: id('character', index),
        name: `Demo Adventurer ${number}`,
        race: ['Human', 'Elf', 'Dwarf'][index % 3],
        class: ['Fighter', 'Wizard', 'Ranger'][index % 3],
        level: 1 + (index % 10),
        background: 'Fictional checklist demo character',
        alignment: 'Neutral Good',
        backstory: `Demo Adventurer ${number} protects Training Realm ${number}.`,
        personality: 'Curious, cooperative, and clearly marked as demo data',
        ideals: 'Protect the party',
        bonds: `Training Realm ${number}`,
        flaws: 'Overplans simple journeys',
        stats: { str: 10 + (index % 6), dex: 11 + (index % 5), con: 12, int: 13, wis: 14, cha: 10 },
        skills: { perception: 2 + (index % 4), survival: 1 + (index % 3) },
        equipment: ['Training sword', 'Demo travel pack'],
        spells: index % 3 === 2 ? ['Light', 'Shield'] : [],
        abilities: ['Demo readiness'],
        hp: 10 + index,
        maxHp: 10 + index,
        ac: 12 + (index % 5),
        xp: index * 100,
        gold: index * 10,
        notes: 'Fictional demo record; not a generated or real player profile.',
        campaignId: campaign.id,
        userId: gm.id,
      },
    });

    const gameSession = await prisma.gameSession.upsert({
      where: { id: id('session', index) },
      update: {},
      create: {
        id: id('session', index),
        campaignId: campaign.id,
        gmId: gm.id,
        title: `Demo Session ${number}`,
        description: `Fictional demo session ${number} for list and workflow verification.`,
        status: index % 4 === 0 ? 'completed' : 'planned',
        scheduledAt: new Date(Date.UTC(2026, 9, index, 18, 0, 0)),
        summary: index % 4 === 0 ? `The demo party completed training objective ${number}.` : null,
        xpAwarded: index % 4 === 0 ? index * 25 : 0,
        notes: 'Fictional demo record.',
      },
    });

    await prisma.sessionLog.upsert({
      where: { id: id('session-log', index) },
      update: {},
      create: {
        id: id('session-log', index),
        sessionId: baseSession.id,
        userId: gm.id,
        type: 'narration',
        content: `Fictional demo log ${number}: the party reviews the next training objective.`,
        metadata: { demo: true, sequence: index },
      },
    });

    const encounter = await prisma.encounter.upsert({
      where: { id: id('encounter', index) },
      update: {},
      create: {
        id: id('encounter', index),
        campaignId: campaign.id,
        sessionId: gameSession.id,
        name: `Demo Encounter ${number}`,
        description: `Fictional encounter ${number} for planning and list verification.`,
        difficulty: ['easy', 'medium', 'hard'][index % 3],
        environment: ['forest', 'ruins', 'sky-dock'][index % 3],
        monsters: [{ name: `Training Construct ${number}`, cr: String(1 + (index % 4)), count: 1 + (index % 3) }],
        rewards: { xp: index * 50, items: [`Demo token ${number}`] },
        status: index % 4 === 0 ? 'completed' : 'pending',
        notes: 'Fictional demo record.',
      },
    });

    await prisma.combat.upsert({
      where: { id: id('combat', index) },
      update: {},
      create: {
        id: id('combat', index),
        encounterId: encounter.id,
        sessionId: gameSession.id,
        name: `Demo Combat ${number}`,
        round: 1 + (index % 5),
        status: index % 4 === 0 ? 'completed' : 'active',
        initiativeOrder: [{ id: character.id, name: character.name, initiative: 10 + index }],
        combatants: [{ id: character.id, name: character.name, type: 'player', hp: character.hp, maxHp: character.maxHp, ac: character.ac, conditions: [] }],
        conditions: {},
        terrain: `Training terrain ${number}`,
        notes: 'Fictional demo record.',
        endedAt: index % 4 === 0 ? new Date(Date.UTC(2026, 9, index, 20, 0, 0)) : null,
      },
    });

    await prisma.npc.upsert({
      where: { id: id('npc', index) },
      update: {},
      create: {
        id: id('npc', index),
        campaignId: baseCampaign.id,
        name: `Demo Guide ${number}`,
        race: ['Human', 'Gnome', 'Orc'][index % 3],
        class: 'Guide',
        role: ['ally', 'merchant', 'quest-giver'][index % 3],
        personality: 'Helpful and explicitly fictional',
        backstory: `Demo Guide ${number} supports training scenarios.`,
        motivation: 'Help the party complete the training objective',
        secrets: 'No real-person or production data.',
        stats: { hp: 10 + index, ac: 10 + (index % 4), cr: '1/2' },
        equipment: ['Demo map'],
        dialogue: [{ trigger: 'greeting', line: `Welcome to training scenario ${number}.` }],
        location: `Demo Outpost ${number}`,
        notes: 'Fictional demo record.',
      },
    });

    await prisma.loreEntry.upsert({
      where: { id: id('lore', index) },
      update: {},
      create: {
        id: id('lore', index),
        campaignId: baseCampaign.id,
        category: ['history', 'location', 'faction'][index % 3],
        title: `Demo Lore ${number}`,
        content: `Fictional training lore entry ${number}; it is not an authentic source or generated evidence.`,
        tags: ['demo', 'fictional-training'],
        isSecret: index % 5 === 0,
      },
    });

    await prisma.narrative.upsert({
      where: { id: id('narrative', index) },
      update: {},
      create: {
        id: id('narrative', index),
        campaignId: baseCampaign.id,
        userId: gm.id,
        type: 'scene',
        prompt: `Fictional demo prompt ${number}`,
        content: `Demo narrative ${number}: the party arrives at a clearly fictional training location.`,
        mood: ['hopeful', 'mysterious', 'urgent'][index % 3],
        tags: ['demo', 'fictional-training'],
        isPublic: true,
      },
    });

    const boardGame = await prisma.boardGame.upsert({
      where: { id: id('board-game', index) },
      update: {},
      create: {
        id: id('board-game', index),
        name: `Demo Tabletop Game ${number}`,
        description: `Fictional demo board game ${number} for catalog verification.`,
        minPlayers: 1 + (index % 2),
        maxPlayers: 4 + (index % 3),
        complexity: ['light', 'medium', 'heavy'][index % 3],
        category: 'fictional training game',
        rules: `Demo rule set ${number}: collect objective tokens and finish the shared scenario.`,
        tags: ['demo', 'fictional-training'],
      },
    });

    await prisma.boardGameSession.upsert({
      where: { id: id('board-game-session', index) },
      update: {},
      create: {
        id: id('board-game-session', index),
        gameId: index === 1 ? baseGame.id : boardGame.id,
        players: [{ name: 'Demo Player A', score: index + 5 }, { name: 'Demo Player B', score: index + 3 }],
        winnerId: 'demo-player-a',
        notes: `Fictional demo board-game session ${number}.`,
        playedAt: new Date(Date.UTC(2026, 8, index, 19, 0, 0)),
        durationMin: 45 + index,
      },
    });
  }
}

if (require.main === module) {
  const prisma = new PrismaClient();
  ensureChecklistRows(prisma)
    .then(() => console.log('[seed-checklist] Ensured at least 15 additive fictional demo records per native list.'))
    .catch((error) => { console.error('[seed-checklist] Error:', error); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}

module.exports = { ensureChecklistRows };
