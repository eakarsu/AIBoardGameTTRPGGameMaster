const { prisma } = require('../lib/prisma');
const { parseAIJson } = require('../lib/parseAIJson');

const OPENROUTER_BASE_URL = (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
const MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';

async function createCompletion(system, messages) {
  if (!process.env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY is required');
  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.CLIENT_URL || 'http://127.0.0.1',
      'X-Title': 'AI BoardGame TTRPG Game Master',
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 2048, messages: [{ role: 'system', content: system }, ...messages] }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error) throw new Error(body.error?.message || `OpenRouter request failed with status ${response.status}`);
  return body;
}

/**
 * Core AI call with timing, token tracking, and persistence.
 */
async function callAI({ prompt, systemPrompt, feature, userId, campaignId, sessionId,
  encounterId, combatId, npcId, characterId, narrativeId, isBoardGame = false,
  boardGameId, boardGameSessionId }) {
  const start = Date.now();

  const messages = [{ role: 'user', content: prompt }];
  const system = systemPrompt || 'You are an expert AI Game Master for tabletop RPGs and board games. Always respond with valid JSON unless instructed otherwise.';

  const response = await createCompletion(system, messages);

  const durationMs = Date.now() - start;
  const rawResponse = response.choices?.[0]?.message?.content || '';
  if (!rawResponse) throw new Error('OpenRouter returned an empty AI response');
  const tokensUsed = response.usage?.total_tokens ||
    (response.usage?.prompt_tokens || 0) + (response.usage?.completion_tokens || 0);
  const parsedResult = parseAIJson(rawResponse);

  if (isBoardGame) {
    await prisma.boardGameAiResult.create({
      data: {
        gameId: boardGameId || null,
        sessionId: boardGameSessionId || null,
        feature,
        prompt,
        rawResponse,
        parsedResult,
        model: response.model || MODEL,
        tokensUsed,
        durationMs,
      },
    });
  } else {
    await prisma.aiResult.create({
      data: {
        userId: userId || null,
        campaignId: campaignId || null,
        sessionId: sessionId || null,
        encounterId: encounterId || null,
        combatId: combatId || null,
        npcId: npcId || null,
        characterId: characterId || null,
        narrativeId: narrativeId || null,
        feature,
        prompt,
        rawResponse,
        parsedResult,
        model: response.model || MODEL,
        tokensUsed,
        durationMs,
      },
    });
  }

  return { rawResponse, parsedResult, tokensUsed, durationMs };
}

// ─────────────────────────────────────────────
// TTRPG AI Features
// ─────────────────────────────────────────────

async function generateEncounter({ campaignId, sessionId, userId, partyLevel, partySize,
  partyClasses, difficulty, environment, genre, system }) {
  const prompt = `Generate a complete tabletop RPG encounter as JSON.

Context:
- Game System: ${system || 'D&D 5e'}
- Genre: ${genre || 'fantasy'}
- Party: ${partySize} players, average level ${partyLevel}, classes: ${(partyClasses || []).join(', ') || 'mixed'}
- Difficulty: ${difficulty || 'medium'}
- Environment: ${environment || 'dungeon'}

Return ONLY valid JSON matching this exact structure:
{
  "name": "string",
  "description": "string (2-3 sentences setting the scene)",
  "difficulty": "trivial|easy|medium|hard|deadly",
  "environment": "string",
  "monsters": [
    {
      "name": "string",
      "cr": "number or fraction string",
      "count": number,
      "hp": number,
      "ac": number,
      "tactics": "string",
      "specialAbilities": ["string"]
    }
  ],
  "rewards": {
    "xp": number,
    "gold": number,
    "items": ["string"]
  },
  "hooks": ["string (2-3 plot hooks this encounter could lead to)"],
  "readAloud": "string (boxed text for GM to read aloud)",
  "gmNotes": "string (secret info, hidden elements, GM tips)"
}`;

  return callAI({ prompt, feature: 'encounter-gen', userId, campaignId, sessionId, encounterId: null });
}

async function generateNPC({ campaignId, userId, role, genre, system, existingNpcs }) {
  const prompt = `Create a richly detailed NPC for a tabletop RPG campaign as JSON.

Context:
- Game System: ${system || 'D&D 5e'}
- Genre: ${genre || 'fantasy'}
- Role in story: ${role || 'neutral'}
- Existing NPCs to avoid duplicating: ${existingNpcs ? existingNpcs.join(', ') : 'none'}

Return ONLY valid JSON:
{
  "name": "string",
  "race": "string",
  "class": "string or null",
  "role": "merchant|villain|ally|neutral|quest-giver|rival",
  "age": number,
  "appearance": "string",
  "personality": "string (3-5 traits)",
  "motivation": "string (what drives them)",
  "backstory": "string (3-4 sentences)",
  "secrets": "string (1-2 secrets they keep)",
  "quirks": ["string"],
  "dialogue": [
    { "trigger": "string", "line": "string" }
  ],
  "stats": {
    "str": number, "dex": number, "con": number,
    "int": number, "wis": number, "cha": number,
    "hp": number, "ac": number, "cr": "string"
  },
  "equipment": ["string"],
  "location": "string",
  "plotHooks": ["string (2-3 adventure hooks involving this NPC)"]
}`;

  return callAI({ prompt, feature: 'npc-gen', userId, campaignId });
}

async function generateNarrative({ campaignId, characterId, userId, type, prompt: userPrompt,
  mood, genre, system, context }) {
  const prompt = `Generate an immersive ${type || 'scene'} narrative for a tabletop RPG.

Context:
- Game System: ${system || 'D&D 5e'}
- Genre: ${genre || 'fantasy'}
- Mood: ${mood || 'dramatic'}
- Scene context: ${context || 'unspecified'}
- Player prompt: ${userPrompt}

Return ONLY valid JSON:
{
  "title": "string",
  "content": "string (rich narrative prose, 3-5 paragraphs)",
  "mood": "string",
  "sensoryDetails": {
    "sight": "string",
    "sound": "string",
    "smell": "string",
    "feel": "string"
  },
  "playerChoices": ["string (2-4 meaningful choices players might face)"],
  "secretElements": "string (hidden lore or foreshadowing for GM only)",
  "followUpPrompts": ["string (follow-up narrative directions)"]
}`;

  return callAI({ prompt, feature: 'narrative', userId, campaignId, characterId });
}

async function generateCombatAdvice({ combatId, sessionId, userId, combatState, round,
  partyConditions, enemyConditions, system }) {
  const prompt = `Provide tactical combat advice for the Game Master as JSON.

Combat State (Round ${round || 1}):
- System: ${system || 'D&D 5e'}
- Party conditions: ${JSON.stringify(partyConditions || [])}
- Enemy conditions: ${JSON.stringify(enemyConditions || [])}
- Full combat state: ${JSON.stringify(combatState || {})}

Return ONLY valid JSON:
{
  "situationAssessment": "string (1-2 sentences on current battle state)",
  "monsterTactics": [
    {
      "monsterName": "string",
      "recommendedAction": "string",
      "reasoning": "string",
      "targetPriority": "string"
    }
  ],
  "dramaticMoment": "string (suggested dramatic narrative beat)",
  "playerHints": ["string (subtle hints GM might give struggling players)"],
  "encounterDifficulty": "trivial|easy|medium|hard|deadly",
  "adjustmentSuggestions": "string (if encounter is too easy or too hard)"
}`;

  return callAI({ prompt, feature: 'combat-advice', userId, sessionId, combatId });
}

async function generateLore({ campaignId, userId, category, existingLore, genre, system }) {
  const prompt = `Generate detailed lore for a tabletop RPG campaign as JSON.

Context:
- Game System: ${system || 'D&D 5e'}
- Genre: ${genre || 'fantasy'}
- Lore Category: ${category || 'location'}
- Existing lore summary: ${existingLore || 'none'}

Return ONLY valid JSON:
{
  "title": "string",
  "category": "location|faction|history|item|deity|creature|culture|event",
  "content": "string (rich detailed lore, 4-6 paragraphs)",
  "tags": ["string"],
  "publicFacts": ["string (what common folk know)"],
  "secrets": ["string (hidden truths for GM)"],
  "connections": ["string (how this connects to other lore)"],
  "adventureHooks": ["string (2-3 hooks tied to this lore)"],
  "isSecret": false
}`;

  return callAI({ prompt, feature: 'lore-gen', userId, campaignId });
}

async function generateCharacterBackstory({ characterId, userId, characterData, genre, system }) {
  const prompt = `Generate a rich character backstory as JSON.

Character:
- Name: ${characterData.name}
- Race: ${characterData.race || 'unknown'}
- Class: ${characterData.class || 'adventurer'}
- Level: ${characterData.level || 1}
- Background: ${characterData.background || 'none specified'}
- Personality traits: ${characterData.personality || 'none specified'}
- Ideals: ${characterData.ideals || 'none specified'}
- Bonds: ${characterData.bonds || 'none specified'}
- Flaws: ${characterData.flaws || 'none specified'}
- System: ${system || 'D&D 5e'}
- Genre: ${genre || 'fantasy'}

Return ONLY valid JSON:
{
  "backstory": "string (rich 4-6 paragraph origin story)",
  "childhoodEvent": "string (formative event)",
  "turningPoint": "string (what drove them to adventure)",
  "secretShame": "string (something they hide)",
  "deepestDesire": "string (what they truly want)",
  "familyTies": "string (family status and relationships)",
  "enemies": ["string (people or organizations that want them dead or harmed)"],
  "allies": ["string (people who would help them)"],
  "quirks": ["string (behavioral quirks from their past)"],
  "roleplayingSuggestions": ["string (tips for playing this character)"],
  "plotHooks": ["string (personal story arcs for GM to use)"]
}`;

  return callAI({ prompt, feature: 'character-backstory', userId, characterId });
}

async function generateSessionSummary({ sessionId, userId, campaignId, logs, title }) {
  const logText = (logs || []).map((l) => `[${l.type}] ${l.content}`).join('\n');

  const prompt = `Generate a session summary for a tabletop RPG session as JSON.

Session: "${title}"
Session logs:
${logText || 'No logs available.'}

Return ONLY valid JSON:
{
  "summary": "string (2-3 paragraph narrative recap written in past tense, epic tone)",
  "keyEvents": ["string (bullet points of major events)"],
  "playerAchievements": ["string (notable player accomplishments)"],
  "unresolved": ["string (plot threads left open)"],
  "npcInteractions": ["string (significant NPC moments)"],
  "dramaticMoments": ["string (standout memorable moments)"],
  "nextSessionHooks": ["string (2-3 exciting hooks for next session)"],
  "xpSuggestion": number
}`;

  return callAI({ prompt, feature: 'session-summary', userId, campaignId, sessionId });
}

async function lookupRule({ userId, campaignId, system, question }) {
  const prompt = `Answer a rules question for a tabletop RPG as JSON.

Game System: ${system || 'D&D 5e'}
Question: ${question}

Return ONLY valid JSON:
{
  "question": "string (restated question)",
  "ruling": "string (clear, definitive ruling)",
  "ruleSource": "string (rulebook and page/section if known)",
  "rawRuleText": "string (quoted rule text if available, or null)",
  "exampleScenario": "string (concrete example of the rule in action)",
  "commonMistakes": ["string (common misapplications of this rule)"],
  "relatedRules": ["string (other rules that interact with this one)"],
  "tableVariants": ["string (common house rules or variant options)"]
}`;

  return callAI({ prompt, feature: 'rule-lookup', userId, campaignId });
}

async function generateNPCDialogue({ npcId, userId, campaignId, npcData, situation, characterData }) {
  const prompt = `Generate contextual NPC dialogue as JSON.

NPC: ${npcData.name} (${npcData.race || ''} ${npcData.role || ''})
Personality: ${npcData.personality || 'neutral'}
Motivation: ${npcData.motivation || 'unknown'}
Secrets: ${npcData.secrets || 'none'}

Situation: ${situation}
Speaking with: ${characterData?.name || 'a party of adventurers'}

Return ONLY valid JSON:
{
  "opening": "string (NPC's opening line)",
  "responses": [
    {
      "playerPrompt": "string (what might prompt this)",
      "dialogue": "string (NPC's response)",
      "tone": "friendly|hostile|nervous|cryptic|helpful|dismissive"
    }
  ],
  "subtext": "string (what the NPC really means or feels)",
  "bodyLanguage": "string (physical mannerisms during conversation)",
  "informationRevealed": ["string (what the NPC might share)"],
  "informationWithheld": ["string (what they refuse to share)"],
  "dialogueTrigger": "string (what would make them share a secret)"
}`;

  return callAI({ prompt, feature: 'npc-dialogue', userId, campaignId, npcId });
}

async function generateCampaignTimeline({ campaignId, userId, sessions, keyEvents }) {
  const prompt = `Generate a campaign timeline as JSON.

Campaign sessions: ${JSON.stringify(sessions || [])}
Key events: ${JSON.stringify(keyEvents || [])}

Return ONLY valid JSON:
{
  "title": "string (campaign timeline title)",
  "era": "string (in-world time period)",
  "events": [
    {
      "date": "string (in-world date or 'Session N')",
      "title": "string",
      "description": "string",
      "significance": "minor|major|pivotal",
      "involvedParties": ["string"]
    }
  ],
  "majorArcs": ["string (overarching story arcs identified)"],
  "foreshadowing": ["string (unresolved elements that may pay off later)"],
  "characterGrowth": "string (how the party has changed)"
}`;

  return callAI({ prompt, feature: 'campaign-timeline', userId, campaignId });
}

async function generateMoodAdvisor({ userId, sceneType, genre, system, currentTension }) {
  const prompt = `Advise a GM on mood and atmosphere for a scene as JSON.

Scene type: ${sceneType || 'encounter'}
Genre: ${genre || 'fantasy'}
System: ${system || 'D&D 5e'}
Current tension level: ${currentTension || 'medium'}

Return ONLY valid JSON:
{
  "ambiance": "string (overall atmosphere recommendation)",
  "music": {
    "suggestions": ["string (music style or specific track names)"],
    "tempo": "slow|medium|fast|variable",
    "mood": "string"
  },
  "lighting": "string (lighting recommendations for in-person play)",
  "soundEffects": ["string"],
  "gmVoiceTips": "string (how GM should modulate voice/pacing)",
  "descriptionWords": ["string (evocative words to use in descriptions)"],
  "sensoryDetails": {
    "sight": "string",
    "sound": "string",
    "smell": "string",
    "temperature": "string"
  },
  "tensionTechniques": ["string (techniques to build or release tension)"]
}`;

  return callAI({ prompt, feature: 'mood-advisor', userId });
}

// ─────────────────────────────────────────────
// Board Game AI Features
// ─────────────────────────────────────────────

async function boardGameRulesLookup({ userId, gameId, sessionId, gameName, question, rules }) {
  const prompt = `Answer a rules question for the board game "${gameName}" as JSON.

Game rules reference: ${rules ? rules.slice(0, 3000) : 'Use general knowledge about this game.'}
Question: ${question}

Return ONLY valid JSON:
{
  "question": "string",
  "ruling": "string (clear ruling)",
  "ruleSource": "string (rulebook section if known)",
  "example": "string (concrete example)",
  "commonMistakes": ["string"],
  "relatedRules": ["string"],
  "officialVariants": ["string (official variants or expansions that change this rule)"]
}`;

  return callAI({ prompt, feature: 'rules-lookup', userId, isBoardGame: true, boardGameId: gameId, boardGameSessionId: sessionId });
}

async function boardGameStrategyAdvice({ userId, gameId, sessionId, gameName, gameState, playerName }) {
  const prompt = `Provide strategic advice for a player in "${gameName}" as JSON.

Current game state: ${JSON.stringify(gameState || {})}
Player requesting advice: ${playerName || 'Player'}

Return ONLY valid JSON:
{
  "situationAssessment": "string (assessment of current position)",
  "immediateRecommendation": "string (best move right now)",
  "reasoning": "string (why this is the best move)",
  "alternativeOptions": [
    { "move": "string", "pros": "string", "cons": "string" }
  ],
  "longtermStrategy": "string (strategic direction for rest of game)",
  "watchOut": ["string (threats or opponent strategies to be aware of)"],
  "winConditionAnalysis": "string (how close are you to winning?)"
}`;

  return callAI({ prompt, feature: 'strategy-advice', userId, isBoardGame: true, boardGameId: gameId, boardGameSessionId: sessionId });
}

async function boardGameScenarioGen({ userId, gameId, gameName, complexity, playerCount }) {
  const prompt = `Generate a custom scenario/variant for "${gameName}" as JSON.

Player count: ${playerCount || 4}
Desired complexity: ${complexity || 'medium'}

Return ONLY valid JSON:
{
  "scenarioName": "string",
  "description": "string",
  "setupChanges": ["string (how to set up differently)"],
  "ruleModifications": ["string (rule changes)"],
  "specialEvents": [
    { "trigger": "string", "effect": "string" }
  ],
  "winConditions": ["string (modified or additional win conditions)"],
  "difficulty": "easy|medium|hard|expert",
  "recommendedFor": "string (who would enjoy this variant)",
  "estimatedDuration": "string"
}`;

  return callAI({ prompt, feature: 'scenario-gen', userId, isBoardGame: true, boardGameId: gameId });
}

async function boardGameVariantRules({ userId, gameId, gameName, playerCount, replayGoal }) {
  const prompt = `Create house rule variants for "${gameName}" to improve replayability as JSON.

Player count: ${playerCount || 4}
Goal: ${replayGoal || 'more variety and replayability'}

Return ONLY valid JSON:
{
  "variants": [
    {
      "name": "string",
      "description": "string",
      "rules": ["string"],
      "recommendedFor": "string",
      "difficultyImpact": "easier|same|harder"
    }
  ],
  "recommendedCombinations": ["string (which variants work well together)"],
  "authorNote": "string (design philosophy behind these variants)"
}`;

  return callAI({ prompt, feature: 'variant-rules', userId, isBoardGame: true, boardGameId: gameId });
}

// ─────────────────────────────────────────────
// Apply pass 5 — additive AI features (NEEDS-CREDS: ANTHROPIC_API_KEY)
// All inherit 503 behavior from index.js startup gate.
// ─────────────────────────────────────────────

async function generateLootHoard({ userId, campaignId, partyLevel, partySize, theme, rarityBias }) {
  const prompt = `Generate a tabletop RPG loot hoard as JSON.

Party level: ${partyLevel || 5}
Party size: ${partySize || 4}
Theme: ${theme || 'standard fantasy'}
Rarity bias: ${rarityBias || 'level-appropriate'}

Return ONLY valid JSON:
{
  "totalGoldValue": number,
  "coins": { "cp": number, "sp": number, "gp": number, "pp": number },
  "gems": [{ "name": "string", "value": number, "count": number }],
  "artObjects": [{ "name": "string", "value": number, "description": "string" }],
  "magicItems": [
    { "name": "string", "rarity": "common|uncommon|rare|very rare|legendary", "attunement": boolean, "description": "string" }
  ],
  "containerDescription": "string",
  "trapOrGuardian": "string (optional defense)",
  "loreHook": "string (story tie-in)"
}`;
  return callAI({ prompt, feature: 'loot-hoard', userId, campaignId });
}

async function generateRandomEvent({ userId, campaignId, sessionId, location, timeOfDay, partyMood }) {
  const prompt = `Generate an unscripted random tabletop RPG event/encounter as JSON.

Location: ${location || 'wilderness'}
Time of day: ${timeOfDay || 'unspecified'}
Party mood: ${partyMood || 'cautious'}

Return ONLY valid JSON:
{
  "title": "string",
  "summary": "string (1-2 sentences)",
  "trigger": "string (how it starts)",
  "stakes": "string",
  "branches": [
    { "playerChoice": "string", "consequence": "string" }
  ],
  "skillChecks": [{ "skill": "string", "dc": number, "outcome": "string" }],
  "rewardOnEngagement": "string",
  "gmTips": ["string"]
}`;
  return callAI({ prompt, feature: 'random-event', userId, campaignId, sessionId });
}

async function generatePuzzle({ userId, campaignId, difficulty, theme, partySize }) {
  const prompt = `Design a puzzle for a tabletop RPG party as JSON.

Difficulty: ${difficulty || 'medium'}
Theme: ${theme || 'arcane'}
Party size: ${partySize || 4}

Return ONLY valid JSON:
{
  "puzzleName": "string",
  "scene": "string (read-aloud)",
  "mechanics": "string (how it works)",
  "clues": ["string"],
  "solution": "string",
  "skillChecks": [{ "skill": "string", "dc": number, "purpose": "string" }],
  "failureConsequence": "string",
  "successReward": "string",
  "alternativeSolutions": ["string"]
}`;
  return callAI({ prompt, feature: 'puzzle-gen', userId, campaignId });
}

async function generateTavern({ userId, campaignId, location, vibe }) {
  const prompt = `Create a fully detailed tavern/inn for a TTRPG as JSON.

Location: ${location || 'roadside'}
Vibe: ${vibe || 'cozy'}

Return ONLY valid JSON:
{
  "name": "string",
  "exterior": "string",
  "interior": "string",
  "owner": { "name": "string", "appearance": "string", "personality": "string", "secret": "string" },
  "patrons": [{ "name": "string", "role": "string", "hook": "string" }],
  "menu": [{ "item": "string", "price": "string" }],
  "rumors": ["string"],
  "hookAdventures": ["string"]
}`;
  return callAI({ prompt, feature: 'tavern-gen', userId, campaignId });
}

async function generateBoardGameTeachingScript({ userId, gameId, gameName, audience }) {
  const prompt = `Produce a board game teaching script for "${gameName}" as JSON.

Audience: ${audience || 'mixed-experience adults'}

Return ONLY valid JSON:
{
  "elevatorPitch": "string (30 seconds)",
  "victoryCondition": "string",
  "phasesOverview": [{ "phase": "string", "explanation": "string" }],
  "keyConcepts": [{ "concept": "string", "analogy": "string" }],
  "firstTurnWalkthrough": "string",
  "commonMistakes": ["string"],
  "estimatedTeachingMinutes": number
}`;
  return callAI({ prompt, feature: 'bg-teaching-script', userId, isBoardGame: true, boardGameId: gameId });
}

async function generateBoardGameTournamentBracket({ userId, gameId, gameName, playerCount, formatPreference }) {
  const prompt = `Design a tournament bracket and ruleset for "${gameName}" as JSON.

Player count: ${playerCount || 8}
Format preference: ${formatPreference || 'auto'}

Return ONLY valid JSON:
{
  "format": "single-elim|double-elim|swiss|round-robin",
  "rounds": number,
  "scheduleSummary": "string",
  "tieBreakerRules": ["string"],
  "bracketSeeds": [{ "seed": number, "matchup": "string" }],
  "timePerMatchMinutes": number,
  "prizePoolStructure": [{ "place": "string", "share": "string" }]
}`;
  return callAI({ prompt, feature: 'bg-tournament', userId, isBoardGame: true, boardGameId: gameId });
}

async function generateCharacterArc({ characterId, userId, campaignId, characterData, sessionHistory }) {
  const prompt = `Analyze a character's arc and suggest narrative development as JSON.

Character: ${characterData.name} (${characterData.class || 'adventurer'}, Level ${characterData.level || 1})
Backstory: ${characterData.backstory || 'none'}
Flaws: ${characterData.flaws || 'none'}
Bonds: ${characterData.bonds || 'none'}
Session history: ${sessionHistory || 'early in campaign'}

Return ONLY valid JSON:
{
  "currentArc": "string (where the character is in their journey)",
  "characterGrowth": "string (how they've grown so far)",
  "upcomingBeats": [
    { "beat": "string", "trigger": "string", "emotionalPayoff": "string" }
  ],
  "flawPayoff": "string (how their flaw might come to a head)",
  "bondResolution": "string (how their bonds might be tested or fulfilled)",
  "redemptionPath": "string (if applicable)",
  "suggestedMoments": ["string (GM suggestions for spotlight moments)"],
  "longTermDestiny": "string (possible character arc conclusion)"
}`;

  return callAI({ prompt, feature: 'character-arc', userId, campaignId, characterId });
}

module.exports = {
  generateEncounter,
  generateNPC,
  generateNarrative,
  generateCombatAdvice,
  generateLore,
  generateCharacterBackstory,
  generateSessionSummary,
  lookupRule,
  generateNPCDialogue,
  generateCampaignTimeline,
  generateMoodAdvisor,
  generateCharacterArc,
  boardGameRulesLookup,
  boardGameStrategyAdvice,
  boardGameScenarioGen,
  boardGameVariantRules,
  generateLootHoard,
  generateRandomEvent,
  generatePuzzle,
  generateTavern,
  generateBoardGameTeachingScript,
  generateBoardGameTournamentBracket,
};
