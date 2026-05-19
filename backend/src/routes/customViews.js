// Custom Views — bespoke read-only endpoints for the TTRPG GM dashboard.
// All endpoints synthesize data deterministically so the dashboards are
// repeatable without touching the Prisma database.
//
// Endpoints:
//   GET  /game-state         — hex grid party + enemy tokens
//   GET  /dice-probability   — PMF for a dice expression (e.g. "3d6+2")
//   GET  /characters         — character roster for sheet picker
//   POST /character-sheet    — PDF (pdfkit) D&D-style sheet for a character
//   GET  /monsters           — monster catalog for encounter builder
//   POST /encounter-balance  — preview balance score for selected encounter

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');

// ── Deterministic PRNG so repeated calls return the same synthesized world ──
function seeded(seed) {
  let s = seed | 0;
  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    return ((s >>> 0) % 1_000_000) / 1_000_000;
  };
}

// ── Cube/axial hex helpers ──────────────────────────────────────────────────
function hexPixel(q, r, size) {
  // pointy-top hex layout
  const x = size * Math.sqrt(3) * (q + r / 2);
  const y = size * (3 / 2) * r;
  return { x, y };
}

// ─────────────────────────────────────────────────────────────────────────────
// VIZ 1: GAME STATE BOARD
// ─────────────────────────────────────────────────────────────────────────────
router.get('/game-state', authenticate, (req, res) => {
  try {
    const radius = Math.min(parseInt(req.query.radius, 10) || 5, 8);
    const hexSize = 30;
    const rand = seeded(1337);

    // build hex grid in axial coordinates
    const hexes = [];
    for (let q = -radius; q <= radius; q++) {
      for (let r = -radius; r <= radius; r++) {
        if (Math.abs(q + r) > radius) continue;
        const { x, y } = hexPixel(q, r, hexSize);
        const terrains = ['grass', 'forest', 'water', 'stone', 'sand'];
        const tIdx = Math.floor(rand() * terrains.length);
        const terrain = (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2 === 0
          ? 'stone'
          : terrains[tIdx];
        const colorMap = {
          grass: '#4ade80', forest: '#15803d', water: '#3b82f6',
          stone: '#94a3b8', sand: '#fbbf24',
        };
        hexes.push({
          q, r,
          pixel: { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 },
          terrain,
          color: colorMap[terrain],
          difficulty: terrain === 'water' || terrain === 'forest' ? 2 : 1,
        });
      }
    }

    const party = [
      { id: 'lyra', name: 'Lyra Moonwhisper', class: 'Ranger', q: -1, r: 0, hp: 28, maxHp: 38, color: '#22d3ee' },
      { id: 'thorgrim', name: 'Thorgrim Stonefist', class: 'Fighter', q: 0, r: -1, hp: 41, maxHp: 52, color: '#f59e0b' },
      { id: 'sela', name: 'Sela Brightwood', class: 'Cleric', q: 0, r: 0, hp: 32, maxHp: 36, color: '#a78bfa' },
      { id: 'vox', name: 'Vox Emberhand', class: 'Wizard', q: -1, r: -1, hp: 18, maxHp: 24, color: '#ef4444' },
    ];

    const enemies = [
      { id: 'shadow-1', name: 'Shadow Assassin', cr: '2', q: 3, r: -1, hp: 27, maxHp: 27, color: '#1f2937' },
      { id: 'shadow-2', name: 'Shadow Assassin', cr: '2', q: 3, r: 0, hp: 19, maxHp: 27, color: '#1f2937' },
      { id: 'conjurer', name: 'Shadow Conjurer', cr: '4', q: 4, r: -1, hp: 40, maxHp: 40, color: '#7f1d1d' },
      { id: 'hound', name: 'Shadow Hound', cr: '1', q: 2, r: 1, hp: 14, maxHp: 18, color: '#374151' },
    ];

    const allTokens = [...party, ...enemies].map((t) => {
      const { x, y } = hexPixel(t.q, t.r, hexSize);
      return { ...t, pixel: { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 } };
    });

    res.json({
      success: true,
      generated_at: new Date().toISOString(),
      hex_size: hexSize,
      radius,
      hexes,
      party: allTokens.filter((t) => party.find((p) => p.id === t.id)),
      enemies: allTokens.filter((t) => enemies.find((e) => e.id === t.id)),
      legend: {
        grass: '#4ade80', forest: '#15803d', water: '#3b82f6',
        stone: '#94a3b8', sand: '#fbbf24',
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// VIZ 2: DICE PROBABILITY CHART
// ─────────────────────────────────────────────────────────────────────────────
function parseDiceExpr(expr) {
  // Accepts e.g. "3d6+2", "1d20-1", "2d10", "d6"
  const m = String(expr || '').replace(/\s+/g, '').match(/^(\d*)d(\d+)([+-]\d+)?$/i);
  if (!m) return null;
  const n = m[1] === '' ? 1 : parseInt(m[1], 10);
  const sides = parseInt(m[2], 10);
  const mod = m[3] ? parseInt(m[3], 10) : 0;
  if (n < 1 || n > 25 || sides < 2 || sides > 100) return null;
  return { n, sides, mod };
}

function dicePmf(n, sides) {
  // PMF over the sum of n dN dice via convolution
  let pmf = new Array(sides + 1).fill(0);
  for (let f = 1; f <= sides; f++) pmf[f] = 1 / sides;
  for (let i = 1; i < n; i++) {
    const next = new Array(pmf.length + sides).fill(0);
    for (let a = 0; a < pmf.length; a++) {
      if (!pmf[a]) continue;
      for (let f = 1; f <= sides; f++) next[a + f] += pmf[a] * (1 / sides);
    }
    pmf = next;
  }
  return pmf;
}

router.get('/dice-probability', authenticate, (req, res) => {
  try {
    const expr = req.query.expr || '3d6+2';
    const parsed = parseDiceExpr(expr);
    if (!parsed) {
      return res.status(400).json({ error: 'Invalid dice expression. Use NdM[+/-K], e.g. 3d6+2.' });
    }
    const { n, sides, mod } = parsed;
    const pmf = dicePmf(n, sides);

    const distribution = [];
    let mean = 0;
    for (let s = n; s < pmf.length; s++) {
      const total = s + mod;
      const prob = pmf[s];
      if (prob > 0) {
        distribution.push({
          total,
          probability: Math.round(prob * 1e6) / 1e6,
          percent: Math.round(prob * 10000) / 100,
        });
        mean += total * prob;
      }
    }
    let variance = 0;
    for (const row of distribution) variance += row.probability * Math.pow(row.total - mean, 2);
    const stdev = Math.sqrt(variance);

    const min = n + mod;
    const max = n * sides + mod;

    res.json({
      success: true,
      expression: `${n}d${sides}${mod >= 0 ? `+${mod}` : mod}`,
      n, sides, modifier: mod,
      min, max,
      mean: Math.round(mean * 1000) / 1000,
      stdev: Math.round(stdev * 1000) / 1000,
      distribution,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// NON-VIZ 1: CHARACTER SHEET PDF (picker + PDF)
// ─────────────────────────────────────────────────────────────────────────────
const SYNTH_CHARACTERS = [
  {
    id: 'lyra',
    name: 'Lyra Moonwhisper', race: 'Half-Elf', class: 'Ranger', level: 5,
    background: 'Outlander', alignment: 'Chaotic Good',
    stats: { str: 14, dex: 18, con: 14, int: 12, wis: 16, cha: 10 },
    hp: 38, maxHp: 38, ac: 16, xp: 6500, gold: 245,
    equipment: ['Longbow +1', 'Shortsword x2', 'Leather Armor', 'Quiver of 40 arrows'],
    spells: ["Hunter's Mark", 'Cure Wounds', 'Speak with Animals', 'Pass Without Trace'],
    abilities: ['Colossus Slayer', 'Natural Explorer (Forest)', 'Favored Enemy (Dragons)'],
    skills: { athletics: 2, stealth: 6, perception: 7, survival: 7, nature: 5 },
  },
  {
    id: 'thorgrim',
    name: 'Thorgrim Stonefist', race: 'Dwarf', class: 'Fighter', level: 5,
    background: 'Soldier', alignment: 'Lawful Good',
    stats: { str: 18, dex: 12, con: 18, int: 10, wis: 12, cha: 8 },
    hp: 52, maxHp: 52, ac: 18, xp: 6500, gold: 120,
    equipment: ['Battleaxe (Khazarak)', 'Shield', 'Chain Mail', 'Handaxe x3'],
    abilities: ['Action Surge', 'Extra Attack', 'Second Wind', 'Battle Master: Trip Attack'],
    skills: { athletics: 8, intimidation: 3, history: 2, perception: 3 },
  },
  {
    id: 'sela',
    name: 'Sela Brightwood', race: 'Human', class: 'Cleric', level: 5,
    background: 'Acolyte', alignment: 'Neutral Good',
    stats: { str: 12, dex: 10, con: 14, int: 12, wis: 18, cha: 14 },
    hp: 36, maxHp: 36, ac: 18, xp: 6500, gold: 90,
    equipment: ['Mace', 'Holy Symbol', 'Plate Armor', 'Healing Potions x3'],
    spells: ['Cure Wounds', 'Bless', 'Spiritual Weapon', 'Revivify', 'Spirit Guardians'],
    abilities: ['Channel Divinity', 'Turn Undead', 'Destroy Undead (CR 1/2)'],
    skills: { religion: 5, medicine: 7, insight: 7, persuasion: 4 },
  },
  {
    id: 'vox',
    name: 'Vox Emberhand', race: 'Tiefling', class: 'Wizard', level: 5,
    background: 'Sage', alignment: 'Chaotic Neutral',
    stats: { str: 8, dex: 14, con: 14, int: 18, wis: 12, cha: 12 },
    hp: 24, maxHp: 24, ac: 12, xp: 6500, gold: 60,
    equipment: ['Quarterstaff', 'Arcane Focus (crystal)', 'Spellbook', 'Component Pouch'],
    spells: ['Fireball', 'Counterspell', 'Magic Missile', 'Shield', 'Mage Armor', 'Misty Step'],
    abilities: ['Arcane Recovery', 'Evocation Savant', 'Sculpt Spells'],
    skills: { arcana: 8, history: 8, investigation: 7, perception: 4 },
  },
];

router.get('/characters', authenticate, (req, res) => {
  res.json({
    success: true,
    characters: SYNTH_CHARACTERS.map((c) => ({
      id: c.id, name: c.name, race: c.race, class: c.class, level: c.level,
    })),
  });
});

let PDFDocument;
try { PDFDocument = require('pdfkit'); } catch { PDFDocument = null; }

router.post('/character-sheet', authenticate, (req, res) => {
  try {
    if (!PDFDocument) {
      return res.status(503).json({ error: 'pdfkit not installed on the server.' });
    }
    const { characterId } = req.body || {};
    const ch = SYNTH_CHARACTERS.find((c) => c.id === characterId) || SYNTH_CHARACTERS[0];

    const doc = new PDFDocument({ size: 'LETTER', margin: 36 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${ch.id}-sheet.pdf"`);
    doc.pipe(res);

    // ── Header ──────────────────────────────────────────────────────────────
    doc.fontSize(20).fillColor('#0f172a').text('Character Sheet', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(16).fillColor('#1e3a8a').text(ch.name, { align: 'center' });
    doc.fontSize(10).fillColor('#475569').text(
      `${ch.race} ${ch.class}  -  Level ${ch.level}  -  ${ch.background}  -  ${ch.alignment}`,
      { align: 'center' }
    );
    doc.moveDown(0.6);

    // ── Vitals row ──────────────────────────────────────────────────────────
    const vitalsTop = doc.y;
    const drawBox = (label, value, x, y, w) => {
      doc.rect(x, y, w, 44).strokeColor('#94a3b8').lineWidth(0.8).stroke();
      doc.fontSize(9).fillColor('#475569').text(label, x + 4, y + 4, { width: w - 8 });
      doc.fontSize(18).fillColor('#0f172a').text(String(value), x + 4, y + 16, { width: w - 8, align: 'center' });
    };
    drawBox('HP', `${ch.hp}/${ch.maxHp}`, 36, vitalsTop, 120);
    drawBox('AC', ch.ac, 168, vitalsTop, 80);
    drawBox('XP', ch.xp, 260, vitalsTop, 120);
    drawBox('Gold', ch.gold, 392, vitalsTop, 80);
    doc.y = vitalsTop + 52;

    // ── Stats grid ──────────────────────────────────────────────────────────
    doc.moveDown(0.5);
    doc.fontSize(12).fillColor('#0f172a').text('Ability Scores', 36, doc.y);
    const statsY = doc.y + 4;
    const statKeys = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
    statKeys.forEach((k, i) => {
      const x = 36 + i * 88;
      doc.rect(x, statsY, 80, 50).strokeColor('#94a3b8').lineWidth(0.8).stroke();
      doc.fontSize(10).fillColor('#475569').text(k.toUpperCase(), x, statsY + 4, { width: 80, align: 'center' });
      const score = ch.stats[k];
      const mod = Math.floor((score - 10) / 2);
      doc.fontSize(18).fillColor('#0f172a').text(String(score), x, statsY + 16, { width: 80, align: 'center' });
      doc.fontSize(9).fillColor('#1e3a8a').text(`(${mod >= 0 ? '+' : ''}${mod})`, x, statsY + 36, { width: 80, align: 'center' });
    });
    doc.y = statsY + 60;

    // ── Skills ──────────────────────────────────────────────────────────────
    doc.moveDown(0.4);
    doc.fontSize(12).fillColor('#0f172a').text('Skills', 36, doc.y);
    doc.moveDown(0.2);
    doc.fontSize(10).fillColor('#1f2937');
    Object.entries(ch.skills || {}).forEach(([skill, val]) => {
      doc.text(`  ${skill.padEnd(15, ' ')}  ${val >= 0 ? '+' : ''}${val}`);
    });

    // ── Abilities ──────────────────────────────────────────────────────────
    doc.moveDown(0.6);
    doc.fontSize(12).fillColor('#0f172a').text('Class Abilities');
    doc.moveDown(0.2);
    doc.fontSize(10).fillColor('#1f2937');
    (ch.abilities || []).forEach((a) => doc.text(`  - ${a}`));

    // ── Spells ─────────────────────────────────────────────────────────────
    if (ch.spells && ch.spells.length) {
      doc.moveDown(0.6);
      doc.fontSize(12).fillColor('#0f172a').text('Spells Known');
      doc.moveDown(0.2);
      doc.fontSize(10).fillColor('#1f2937');
      ch.spells.forEach((s) => doc.text(`  - ${s}`));
    }

    // ── Inventory ──────────────────────────────────────────────────────────
    doc.moveDown(0.6);
    doc.fontSize(12).fillColor('#0f172a').text('Inventory');
    doc.moveDown(0.2);
    doc.fontSize(10).fillColor('#1f2937');
    (ch.equipment || []).forEach((eq) => doc.text(`  - ${eq}`));

    doc.moveDown(1);
    doc.fontSize(8).fillColor('#94a3b8').text(
      `Generated by AI BoardGame / TTRPG Game Master - ${new Date().toISOString()}`,
      { align: 'center' }
    );

    doc.end();
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// NON-VIZ 2: ENCOUNTER BUILDER WIZARD
// ─────────────────────────────────────────────────────────────────────────────
const MONSTERS = [
  { id: 'goblin', name: 'Goblin', cr: 0.25, type: 'humanoid', terrains: ['forest', 'cave'], xp: 50 },
  { id: 'wolf', name: 'Wolf', cr: 0.25, type: 'beast', terrains: ['forest', 'plains', 'mountain'], xp: 50 },
  { id: 'orc', name: 'Orc', cr: 0.5, type: 'humanoid', terrains: ['plains', 'mountain', 'forest'], xp: 100 },
  { id: 'hobgoblin', name: 'Hobgoblin', cr: 0.5, type: 'humanoid', terrains: ['plains', 'mountain'], xp: 100 },
  { id: 'bugbear', name: 'Bugbear', cr: 1, type: 'humanoid', terrains: ['forest', 'cave'], xp: 200 },
  { id: 'dire-wolf', name: 'Dire Wolf', cr: 1, type: 'beast', terrains: ['forest', 'mountain'], xp: 200 },
  { id: 'shadow', name: 'Shadow', cr: 0.5, type: 'undead', terrains: ['cave', 'crypt', 'urban'], xp: 100 },
  { id: 'ogre', name: 'Ogre', cr: 2, type: 'giant', terrains: ['mountain', 'cave', 'plains'], xp: 450 },
  { id: 'owlbear', name: 'Owlbear', cr: 3, type: 'monstrosity', terrains: ['forest', 'cave'], xp: 700 },
  { id: 'manticore', name: 'Manticore', cr: 3, type: 'monstrosity', terrains: ['mountain', 'plains'], xp: 700 },
  { id: 'wight', name: 'Wight', cr: 3, type: 'undead', terrains: ['crypt', 'urban', 'cave'], xp: 700 },
  { id: 'troll', name: 'Troll', cr: 5, type: 'giant', terrains: ['swamp', 'mountain', 'forest'], xp: 1800 },
  { id: 'wyvern', name: 'Wyvern', cr: 6, type: 'dragon', terrains: ['mountain', 'plains'], xp: 2300 },
  { id: 'mind-flayer', name: 'Mind Flayer', cr: 7, type: 'aberration', terrains: ['cave', 'crypt', 'urban'], xp: 2900 },
  { id: 'young-red-dragon', name: 'Young Red Dragon', cr: 10, type: 'dragon', terrains: ['mountain', 'cave'], xp: 5900 },
  { id: 'beholder', name: 'Beholder', cr: 13, type: 'aberration', terrains: ['cave', 'crypt'], xp: 10000 },
];

// DMG-style XP budget table (single character, per-day adventuring day)
// We use the easy/medium/hard/deadly per-character thresholds (one encounter).
const XP_THRESHOLDS = {
  1: { easy: 25, medium: 50, hard: 75, deadly: 100 },
  2: { easy: 50, medium: 100, hard: 150, deadly: 200 },
  3: { easy: 75, medium: 150, hard: 225, deadly: 400 },
  4: { easy: 125, medium: 250, hard: 375, deadly: 500 },
  5: { easy: 250, medium: 500, hard: 750, deadly: 1100 },
  6: { easy: 300, medium: 600, hard: 900, deadly: 1400 },
  7: { easy: 350, medium: 750, hard: 1100, deadly: 1700 },
  8: { easy: 450, medium: 900, hard: 1400, deadly: 2100 },
  9: { easy: 550, medium: 1100, hard: 1600, deadly: 2400 },
  10: { easy: 600, medium: 1200, hard: 1900, deadly: 2800 },
  11: { easy: 800, medium: 1600, hard: 2400, deadly: 3600 },
  12: { easy: 1000, medium: 2000, hard: 3000, deadly: 4500 },
};

function encounterMultiplier(count) {
  if (count <= 1) return 1;
  if (count === 2) return 1.5;
  if (count <= 6) return 2;
  if (count <= 10) return 2.5;
  return 3;
}

router.get('/monsters', authenticate, (req, res) => {
  const terrain = String(req.query.terrain || '').toLowerCase();
  const list = terrain
    ? MONSTERS.filter((m) => m.terrains.includes(terrain))
    : MONSTERS;
  res.json({
    success: true,
    terrain: terrain || 'all',
    count: list.length,
    monsters: list,
  });
});

router.post('/encounter-balance', authenticate, (req, res) => {
  try {
    const {
      party_level = 5,
      party_size = 4,
      terrain = 'forest',
      monsters: picks = [],
    } = req.body || {};

    const pl = Math.max(1, Math.min(12, parseInt(party_level, 10) || 5));
    const ps = Math.max(1, Math.min(8, parseInt(party_size, 10) || 4));
    const thr = XP_THRESHOLDS[pl];
    const partyThresholds = {
      easy: thr.easy * ps,
      medium: thr.medium * ps,
      hard: thr.hard * ps,
      deadly: thr.deadly * ps,
    };

    // expand picks: [{id, count}]
    const expanded = [];
    let totalRawXp = 0;
    let monsterCount = 0;
    for (const p of picks) {
      const mon = MONSTERS.find((m) => m.id === (p.id || p.monsterId));
      if (!mon) continue;
      const cnt = Math.max(1, Math.min(20, parseInt(p.count, 10) || 1));
      for (let i = 0; i < cnt; i++) expanded.push(mon);
      totalRawXp += mon.xp * cnt;
      monsterCount += cnt;
    }

    const mult = encounterMultiplier(monsterCount);
    const adjustedXp = Math.round(totalRawXp * mult);

    let difficulty = 'trivial';
    if (adjustedXp >= partyThresholds.deadly) difficulty = 'deadly';
    else if (adjustedXp >= partyThresholds.hard) difficulty = 'hard';
    else if (adjustedXp >= partyThresholds.medium) difficulty = 'medium';
    else if (adjustedXp >= partyThresholds.easy) difficulty = 'easy';

    // 0..100 balance score: closest to "hard" target peaks at 100
    const target = partyThresholds.hard;
    const ratio = target === 0 ? 0 : adjustedXp / target;
    const balanceScore = Math.max(0, Math.round(100 - Math.abs(1 - ratio) * 60));

    // Terrain affinity bonus / penalty
    let affinity = 0;
    for (const m of expanded) {
      affinity += m.terrains.includes(terrain) ? 1 : -1;
    }
    const terrainFit = monsterCount === 0 ? 0 : Math.round((affinity / monsterCount) * 100);

    res.json({
      success: true,
      party_level: pl,
      party_size: ps,
      terrain,
      party_thresholds: partyThresholds,
      monsters_picked: picks,
      monster_count: monsterCount,
      raw_xp: totalRawXp,
      adjusted_xp: adjustedXp,
      encounter_multiplier: mult,
      difficulty,
      balance_score: balanceScore,
      terrain_fit_pct: terrainFit,
      recommendation:
        difficulty === 'deadly' ? 'Risk of TPK. Reduce monster count or CR.' :
        difficulty === 'hard' ? 'Tough but fair. Good for set-piece battles.' :
        difficulty === 'medium' ? 'Balanced. Resources will be expended.' :
        difficulty === 'easy' ? 'Warm-up fight. Few resources spent.' :
        'Trivial. Consider adding monsters.',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Info / health for the custom-views router ──────────────────────────────
router.get('/info', authenticate, (req, res) => {
  res.json({
    feature: 'custom-views',
    project: 'AIBoardGameTTRPGGameMaster',
    endpoints: [
      'GET  /game-state',
      'GET  /dice-probability?expr=3d6+2',
      'GET  /characters',
      'POST /character-sheet  { characterId }',
      'GET  /monsters?terrain=forest',
      'POST /encounter-balance { party_level, party_size, terrain, monsters: [{id,count}] }',
    ],
  });
});

module.exports = router;
