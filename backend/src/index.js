require('dotenv').config();

// ── Environment validation ──────────────────────────────────────────────────
const REQUIRED_ENV = ['DATABASE_URL', 'JWT_SECRET', 'ANTHROPIC_API_KEY'];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`[startup] Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { generalLimiter } = require('./middleware/rateLimiter');
const { prisma } = require('./lib/prisma');

const app = express();

// ── Security middleware ─────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Body parsing ────────────────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Global rate limiter ─────────────────────────────────────────────────────
app.use(generalLimiter);

// ── Health check (no auth, no rate limit penalty) ───────────────────────────
app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected' });
  }
});

// ── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/campaigns', require('./routes/campaigns'));
app.use('/api/characters', require('./routes/characters'));
app.use('/api/sessions', require('./routes/sessions'));
app.use('/api/encounters', require('./routes/encounters'));
app.use('/api/combat', require('./routes/combat'));
app.use('/api/npcs', require('./routes/npcs'));
app.use('/api/lore', require('./routes/lore'));
app.use('/api/narratives', require('./routes/narratives'));
app.use('/api/boardgames', require('./routes/boardgames'));
app.use('/api/dice', require('./routes/dice'));
app.use('/api/ai', require('./routes/ai'));

// ── 404 handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

// ── Global error handler ────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[error]', err);

  // Prisma errors
  if (err.code === 'P2002') {
    return res.status(409).json({ error: 'A record with that value already exists.' });
  }
  if (err.code === 'P2025') {
    return res.status(404).json({ error: 'Record not found.' });
  }

  // Anthropic API errors
  if (err.status && err.error) {
    return res.status(502).json({ error: `AI API error: ${err.error?.message || 'Unknown AI error'}` });
  }

  res.status(500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error.' : err.message,
  });
});

// ── Start server ────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT, 10) || 3001;

app.use('/api/gm-copilot', require('./routes/agenticGmCopilot')); // apply pass 6 — audit custom suggestion

app.use('/api/rulebook-rag', require('./routes/rulebookRag')); // apply pass 6 — audit custom suggestion

app.use('/api/streaming-narrative', require('./routes/streamingNarrative')); // apply pass 6 — audit custom suggestion

app.use('/api/white-label-vtt', require('./routes/whiteLabelVtt')); // apply pass 6 — audit custom suggestion
app.listen(PORT, () => {
  console.log(`[server] AI BoardGame / TTRPG Game Master running on port ${PORT}`);
  console.log(`[server] Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`[server] CORS origin: ${process.env.CLIENT_URL || 'http://localhost:5173'}`);
});

// ── Graceful shutdown ───────────────────────────────────────────────────────
process.on('SIGTERM', async () => {
  console.log('[server] SIGTERM received, shutting down...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[server] SIGINT received, shutting down...');
  await prisma.$disconnect();
  process.exit(0);
});


// === Batch 01 Gaps & Frontend Mounts ===
app.use('/api/gap-no-ai-npc-voice-generation-tts', require('./routes/gap_no_ai_npc_voice_generation_tts'));
app.use('/api/gap-no-ai-map-dungeon-image-generation', require('./routes/gap_no_ai_map_dungeon_image_generation'));
app.use('/api/gap-no-ai-session-recap-summarization', require('./routes/gap_no_ai_session_recap_summarization'));
app.use('/api/gap-no-ai-rules-arbitration-co-pilot-during-play', require('./routes/gap_no_ai_rules_arbitration_co_pilot_during_play'));
app.use('/api/gap-frontend-pages-folder-is-empty-no-spa-ui-shipped', require('./routes/gap_frontend_pages_folder_is_empty_no_spa_ui_shipped'));
app.use('/api/gap-no-notification-system-for-session-reminders', require('./routes/gap_no_notification_system_for_session_reminders'));
app.use('/api/gap-no-webhook-outbound-api', require('./routes/gap_no_webhook_outbound_api'));
app.use('/api/gap-no-discord-voice-chat-integration', require('./routes/gap_no_discord_voice_chat_integration'));
app.use('/api/gap-no-virtual-tabletop-vtt-interactive-board', require('./routes/gap_no_virtual_tabletop_vtt_interactive_board'));
app.use('/api/gap-no-player-marketplace-for-homebrew-content', require('./routes/gap_no_player_marketplace_for_homebrew_content'));
app.use('/api/gap-no-export-of-campaign-archives-pdf-json', require('./routes/gap_no_export_of_campaign_archives_pdf_json'));
