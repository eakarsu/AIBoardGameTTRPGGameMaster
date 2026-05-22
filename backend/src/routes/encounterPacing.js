const express = require('express');
const router = express.Router();

router.post('/plan', (req, res) => {
  const players = Number(req.body?.players ?? 4);
  const avgLevel = Number(req.body?.avg_level ?? 5);
  const monsterCr = Number(req.body?.monster_cr ?? 7);
  const sessionMinutes = Number(req.body?.session_minutes ?? 180);
  const difficulty = Math.max(0, Math.round((monsterCr / Math.max(1, avgLevel)) * 50 + players * 4));
  const expectedRounds = Math.max(2, Math.round(difficulty / 18));
  res.json({
    difficulty,
    expectedRounds,
    pacing: expectedRounds > 6 ? 'too_slow' : expectedRounds < 3 ? 'too_fast' : 'balanced',
    beats: ['Opening complication', 'Tactical reveal', 'Resource pressure', sessionMinutes > 150 ? 'Mid-session twist' : 'Fast resolution'].slice(0, 4),
    adjustment: expectedRounds > 6 ? 'Split enemy waves and add morale breakpoints.' : 'Keep initiative tight and spotlight each player once per round.',
  });
});

module.exports = router;
