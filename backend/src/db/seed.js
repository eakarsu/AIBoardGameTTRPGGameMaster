require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('[seed] Starting database seed...');

  // ── Users ──────────────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash('password123', 12);

  const gm = await prisma.user.upsert({
    where: { email: 'gm@gamemaster.ai' },
    update: {},
    create: {
      email: 'gm@gamemaster.ai',
      username: 'dungeon_master',
      displayName: 'The Dungeon Master',
      passwordHash,
      role: 'gm',
    },
  });

  const player1 = await prisma.user.upsert({
    where: { email: 'player1@gamemaster.ai' },
    update: {},
    create: {
      email: 'player1@gamemaster.ai',
      username: 'adventurer_one',
      displayName: 'Aria Swiftwind',
      passwordHash,
      role: 'player',
    },
  });

  const player2 = await prisma.user.upsert({
    where: { email: 'player2@gamemaster.ai' },
    update: {},
    create: {
      email: 'player2@gamemaster.ai',
      username: 'fighter_rex',
      displayName: 'Rex Ironforge',
      passwordHash,
      role: 'player',
    },
  });

  console.log('[seed] Users created');

  // ── Campaign ───────────────────────────────────────────────────────────────
  const campaign = await prisma.campaign.upsert({
    where: { id: 'seed-campaign-001' },
    update: {},
    create: {
      id: 'seed-campaign-001',
      name: 'The Shattered Realm',
      description: 'An ancient evil stirs in the shattered lands of Elderath. Heroes are needed to unite the fractured kingdoms before darkness consumes all.',
      genre: 'fantasy',
      system: 'D&D 5e',
      setting: 'The world of Elderath — a realm split into floating islands after the Sundering 500 years ago. Magic is abundant but unstable.',
      status: 'active',
      maxPlayers: 6,
      gmId: gm.id,
      tags: ['epic', 'high-fantasy', 'political-intrigue'],
    },
  });

  // Add players to campaign
  await prisma.campaignPlayer.upsert({
    where: { campaignId_userId: { campaignId: campaign.id, userId: player1.id } },
    update: {},
    create: { campaignId: campaign.id, userId: player1.id, role: 'player' },
  });

  await prisma.campaignPlayer.upsert({
    where: { campaignId_userId: { campaignId: campaign.id, userId: player2.id } },
    update: {},
    create: { campaignId: campaign.id, userId: player2.id, role: 'player' },
  });

  console.log('[seed] Campaign created');

  // ── Characters ─────────────────────────────────────────────────────────────
  await prisma.character.upsert({
    where: { id: 'seed-char-001' },
    update: {},
    create: {
      id: 'seed-char-001',
      name: 'Lyra Moonwhisper',
      race: 'Half-Elf',
      class: 'Ranger',
      level: 5,
      background: 'Outlander',
      alignment: 'Chaotic Good',
      backstory: 'Raised in the forests of the Verdant Expanse, Lyra lost her village to a dragon attack at age 12. She has spent the years since tracking the beast.',
      personality: 'Always has a plan, never gives up, speaks with the animals',
      ideals: 'Nature must be protected; civilization encroaches too far',
      bonds: 'My hunting companion, a wolf named Shadow',
      flaws: 'Cannot resist a mystery or an injustice',
      stats: { str: 14, dex: 18, con: 14, int: 12, wis: 16, cha: 10 },
      hp: 38,
      maxHp: 38,
      ac: 16,
      xp: 6500,
      gold: 245,
      campaignId: campaign.id,
      userId: player1.id,
      equipment: ['Longbow +1', 'Shortsword x2', 'Leather Armor', 'Quiver of 40 arrows'],
      spells: ['Hunter\'s Mark', 'Cure Wounds', 'Speak with Animals', 'Pass Without Trace'],
      abilities: ['Colossus Slayer', 'Natural Explorer (Forest)', 'Favored Enemy (Dragons)'],
      skills: { athletics: 2, stealth: 6, perception: 7, survival: 7, nature: 5 },
    },
  });

  await prisma.character.upsert({
    where: { id: 'seed-char-002' },
    update: {},
    create: {
      id: 'seed-char-002',
      name: 'Thorgrim Stonefist',
      race: 'Dwarf',
      class: 'Fighter',
      level: 5,
      background: 'Soldier',
      alignment: 'Lawful Good',
      backstory: 'A veteran of the Ironmarch wars, Thorgrim now serves as a freelance adventurer, sending his earnings home to his clan.',
      personality: 'Gruff, loyal, never leaves a comrade behind',
      ideals: 'Honor in battle above all else',
      bonds: 'My ancestral battleaxe, Khazarak',
      flaws: 'Stubborn as stone, cannot admit when wrong',
      stats: { str: 18, dex: 12, con: 18, int: 10, wis: 12, cha: 8 },
      hp: 52,
      maxHp: 52,
      ac: 18,
      xp: 6500,
      gold: 120,
      campaignId: campaign.id,
      userId: player2.id,
      equipment: ['Battleaxe (Khazarak)', 'Shield', 'Chain Mail', 'Handaxe x3'],
      abilities: ['Action Surge', 'Extra Attack', 'Second Wind', 'Battle Master: Trip Attack', 'Battle Master: Riposte'],
      skills: { athletics: 8, intimidation: 3, history: 2, perception: 3 },
    },
  });

  console.log('[seed] Characters created');

  // ── NPCs ───────────────────────────────────────────────────────────────────
  await prisma.npc.upsert({
    where: { id: 'seed-npc-001' },
    update: {},
    create: {
      id: 'seed-npc-001',
      campaignId: campaign.id,
      name: 'Lady Seraphine Valdris',
      race: 'Human',
      role: 'quest-giver',
      personality: 'Elegant, calculating, hides desperation behind composure',
      backstory: 'Former court mage turned political exile, she seeks allies to reclaim her position and stop the Shadow Council.',
      motivation: 'Reclaim the Throne of Stars and expose the Shadow Council',
      secrets: 'She unknowingly freed the ancient lich Malachar during her research 10 years ago',
      location: 'The Floating City of Aurelius',
      isAlive: true,
      stats: { str: 8, dex: 12, con: 10, int: 18, wis: 16, cha: 18, hp: 32, ac: 12, cr: '5' },
      dialogue: [
        { trigger: 'first meeting', line: 'I have watched you for some time, adventurers. You have a reputation for... creative problem solving.' },
        { trigger: 'asking about the Shadow Council', line: 'Lower your voice! Those who speak their name too loudly tend to disappear.' },
      ],
    },
  });

  await prisma.npc.upsert({
    where: { id: 'seed-npc-002' },
    update: {},
    create: {
      id: 'seed-npc-002',
      campaignId: campaign.id,
      name: 'Grix the Unbroken',
      race: 'Half-Orc',
      role: 'villain',
      personality: 'Brutal, cunning, surprisingly philosophical about violence',
      backstory: 'Once a slave gladiator, now the warlord of the Ashlands. Believes only the strong deserve to survive.',
      motivation: 'Conquer the fractured kingdoms and forge a new empire under iron rule',
      secrets: 'He is secretly working with the Shadow Council, who promised him godhood',
      location: 'The Ashlands Fortress',
      isAlive: true,
      stats: { str: 22, dex: 14, con: 20, int: 14, wis: 10, cha: 16, hp: 180, ac: 18, cr: '12' },
    },
  });

  console.log('[seed] NPCs created');

  // ── Lore ───────────────────────────────────────────────────────────────────
  await prisma.loreEntry.upsert({
    where: { id: 'seed-lore-001' },
    update: {},
    create: {
      id: 'seed-lore-001',
      campaignId: campaign.id,
      category: 'history',
      title: 'The Sundering — 500 Years Ago',
      content: 'The Sundering was a catastrophic magical event that tore the continent of Elderath apart, creating the floating islands that now dot the sky. Scholars disagree on the cause — some blame the Archmage Consortium\'s failed Binding Ritual, others point to divine punishment. What is known: thousands died in a single night, and magic has never been the same since.',
      tags: ['history', 'magic', 'catastrophe'],
      isSecret: false,
    },
  });

  await prisma.loreEntry.upsert({
    where: { id: 'seed-lore-002' },
    update: {},
    create: {
      id: 'seed-lore-002',
      campaignId: campaign.id,
      category: 'faction',
      title: 'The Shadow Council — Secret Faction',
      content: 'A clandestine organization that has infiltrated every major government in Elderath. Their true goal is the resurrection of the ancient lich Malachar, who they believe can reverse the Sundering — at the cost of thousands of souls. Members are identifiable only by a shadow tattoo on the left wrist, visible only in moonlight.',
      tags: ['faction', 'villain', 'secret'],
      isSecret: true,
    },
  });

  console.log('[seed] Lore entries created');

  // ── Game Session ───────────────────────────────────────────────────────────
  const session = await prisma.gameSession.upsert({
    where: { id: 'seed-session-001' },
    update: {},
    create: {
      id: 'seed-session-001',
      campaignId: campaign.id,
      gmId: gm.id,
      title: 'Session 1: The City of Clouds',
      description: 'The party arrives at the Floating City of Aurelius and meets Lady Valdris.',
      status: 'completed',
      scheduledAt: new Date('2026-04-20T18:00:00Z'),
      startedAt: new Date('2026-04-20T18:05:00Z'),
      endedAt: new Date('2026-04-20T22:30:00Z'),
      summary: 'The party arrived in Aurelius via sky-ship and were immediately approached by Lady Valdris. After a tense negotiation at the Golden Chalice Inn, they agreed to investigate the disappearance of three council members. The session ended with a mysterious ambush by hooded figures.',
      xpAwarded: 300,
    },
  });

  await prisma.sessionLog.createMany({
    skipDuplicates: true,
    data: [
      {
        id: 'seed-log-001',
        sessionId: session.id,
        userId: gm.id,
        type: 'narration',
        content: 'The sky-ship descends through the clouds, and the gleaming spires of Aurelius come into view. The city floats on an island of pure white stone, connected to the sky below by dozens of waterfalls that fall into nothing.',
      },
      {
        id: 'seed-log-002',
        sessionId: session.id,
        userId: player1.id,
        type: 'action',
        content: 'Lyra steps off the gangplank and immediately scans the crowd for threats.',
        metadata: { roll: 'Perception', result: 18 },
      },
      {
        id: 'seed-log-003',
        sessionId: session.id,
        userId: player2.id,
        type: 'dialogue',
        content: '"I don\'t trust mages," Thorgrim mutters, eyeing the arcane lamps illuminating the docks.',
      },
    ],
  });

  console.log('[seed] Game session and logs created');

  // ── Encounter ──────────────────────────────────────────────────────────────
  const encounter = await prisma.encounter.upsert({
    where: { id: 'seed-encounter-001' },
    update: {},
    create: {
      id: 'seed-encounter-001',
      campaignId: campaign.id,
      sessionId: session.id,
      name: 'Ambush at Moonrise Bridge',
      description: 'Shadow Council assassins ambush the party on their way back to the inn.',
      difficulty: 'medium',
      environment: 'city bridge, night',
      monsters: [
        { name: 'Shadow Assassin', cr: '2', count: 3, hp: 27, ac: 13, tactics: 'Strike from shadows, target spellcasters' },
        { name: 'Shadow Conjurer', cr: '4', count: 1, hp: 40, ac: 12, tactics: 'Stay back, summon shadow hounds' },
      ],
      rewards: { xp: 1100, gold: 75, items: ['Shadow Cloak (minor, uncommon)', 'Encrypted Scroll'] },
      status: 'completed',
      notes: 'The encrypted scroll contains partial Shadow Council membership list — clue for next session.',
    },
  });

  // ── Combat ─────────────────────────────────────────────────────────────────
  await prisma.combat.upsert({
    where: { id: 'seed-combat-001' },
    update: {},
    create: {
      id: 'seed-combat-001',
      encounterId: encounter.id,
      sessionId: session.id,
      name: 'Bridge Ambush Combat',
      round: 4,
      status: 'completed',
      initiativeOrder: [
        { id: 'lyra', name: 'Lyra Moonwhisper', initiative: 22 },
        { id: 'shadow-1', name: 'Shadow Assassin 1', initiative: 18 },
        { id: 'conjurer', name: 'Shadow Conjurer', initiative: 15 },
        { id: 'thorgrim', name: 'Thorgrim Stonefist', initiative: 12 },
        { id: 'shadow-2', name: 'Shadow Assassin 2', initiative: 10 },
        { id: 'shadow-3', name: 'Shadow Assassin 3', initiative: 8 },
      ],
      combatants: [
        { id: 'lyra', name: 'Lyra Moonwhisper', type: 'player', hp: 28, maxHp: 38, ac: 16, conditions: [] },
        { id: 'thorgrim', name: 'Thorgrim Stonefist', type: 'player', hp: 41, maxHp: 52, ac: 18, conditions: [] },
        { id: 'shadow-1', name: 'Shadow Assassin 1', type: 'monster', hp: 0, maxHp: 27, ac: 13, conditions: ['dead'] },
        { id: 'shadow-2', name: 'Shadow Assassin 2', type: 'monster', hp: 0, maxHp: 27, ac: 13, conditions: ['dead'] },
        { id: 'shadow-3', name: 'Shadow Assassin 3', type: 'monster', hp: 0, maxHp: 27, ac: 13, conditions: ['dead'] },
        { id: 'conjurer', name: 'Shadow Conjurer', type: 'monster', hp: 0, maxHp: 40, ac: 12, conditions: ['dead'] },
      ],
      terrain: 'Stone bridge, 30ft wide, 60ft long. Torchlit. No cover except bridge railings.',
      endedAt: new Date('2026-04-20T21:45:00Z'),
    },
  });

  console.log('[seed] Encounter and combat created');

  // ── Board Games ────────────────────────────────────────────────────────────
  const catan = await prisma.boardGame.upsert({
    where: { id: 'seed-bg-001' },
    update: {},
    create: {
      id: 'seed-bg-001',
      name: 'Catan',
      description: 'Players collect resources and build settlements, cities, and roads in a race to accumulate victory points.',
      minPlayers: 3,
      maxPlayers: 4,
      complexity: 'medium',
      category: 'strategy, resource management',
      bggId: '13',
      tags: ['classic', 'trading', 'settlement-building'],
      rules: 'Each player takes turns rolling two dice. The sum determines which hexes produce resources. Players on adjacent settlements or cities collect those resources. Resources (wood, brick, wheat, ore, sheep) are used to build roads, settlements, cities, or buy development cards. First to 10 victory points wins. Settlements = 1 VP, Cities = 2 VP, Longest Road = 2 VP, Largest Army = 2 VP.',
    },
  });

  const gloomhaven = await prisma.boardGame.upsert({
    where: { id: 'seed-bg-002' },
    update: {},
    create: {
      id: 'seed-bg-002',
      name: 'Gloomhaven',
      description: 'A cooperative dungeon-crawler with a persistent campaign and legacy elements.',
      minPlayers: 1,
      maxPlayers: 4,
      complexity: 'heavy',
      category: 'cooperative, dungeon-crawler, legacy',
      bggId: '174430',
      tags: ['epic', 'legacy', 'tactical', 'solo-friendly'],
      rules: 'Players select two cards from their hand each round and choose initiative based on card top number. Cards are played in initiative order. Monsters AI is determined by ability card decks. Characters are unique classes with special abilities. Retire characters to unlock new content. Campaign has 95+ scenarios.',
    },
  });

  await prisma.boardGameSession.upsert({
    where: { id: 'seed-bgs-001' },
    update: {},
    create: {
      id: 'seed-bgs-001',
      gameId: catan.id,
      players: [
        { name: 'Alice', score: 10 },
        { name: 'Bob', score: 8 },
        { name: 'Charlie', score: 7 },
      ],
      winnerId: 'alice',
      notes: 'Alice built the longest road early and held it throughout.',
      playedAt: new Date('2026-04-25T19:00:00Z'),
      durationMin: 95,
    },
  });

  console.log('[seed] Board games created');

  // ── Narrative ──────────────────────────────────────────────────────────────
  await prisma.narrative.upsert({
    where: { id: 'seed-narrative-001' },
    update: {},
    create: {
      id: 'seed-narrative-001',
      campaignId: campaign.id,
      characterId: 'seed-char-001',
      userId: player1.id,
      type: 'vision',
      prompt: 'Lyra meditates and receives a vision about her past',
      content: 'In the flickering dream, young Lyra stands at the edge of her burning village. The dragon\'s roar shakes the earth. Through the smoke, she sees not a beast of malice, but a creature in agony — scales torn, eyes clouded with a dark corruption. Something is driving the dragon mad. Something old. Something deliberate.',
      mood: 'haunting',
      tags: ['backstory', 'vision', 'dragon'],
      isPublic: true,
    },
  });

  console.log('[seed] Narrative created');

  console.log('[seed] Database seeded successfully!');
  console.log('[seed] Login credentials:');
  console.log('[seed]   GM:      gm@gamemaster.ai      / password123');
  console.log('[seed]   Player1: player1@gamemaster.ai / password123');
  console.log('[seed]   Player2: player2@gamemaster.ai / password123');
}

main()
  .catch((e) => {
    console.error('[seed] Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
