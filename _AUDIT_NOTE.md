# Audit Apply Note — AIBoardGameTTRPGGameMaster

Source: `_AUDIT/reports/batch_01.md` § 6.

## Audit findings vs. reality
The audit reported "4 AI endpoints" but the project actually exposes ~12 across:
- `/api/ai/rule-lookup`, `/api/ai/mood-advisor`
- `/api/characters/:id/ai/backstory`, `/api/characters/:id/ai/arc`
- `/api/boardgames/:id/ai/rules`, `/api/boardgames/:id/ai/strategy`, `/api/boardgames/:id/ai/scenario`, `/api/boardgames/:id/ai/variants`
- `/api/combat/:id/ai/advice`
- `/api/lore/ai/generate`
- `/api/npcs`, `/api/narratives`, `/api/sessions` (each have AI endpoints)
- `/api/campaigns/:id/timeline` (uses AI summary)

So the suggested "advanced AI features" are largely already shipped.

## Original audit recommendations
- Limited AI coverage (false; project has 12 AI endpoints)
- Missing notifications
- Missing reporting / export
- Strategic: agentic workflows, RAG, real-time anomaly detection, white-label

## Implemented in this pass (MECHANICAL)

None. The project uses Prisma + Joi (not lazy SQL); adding webhooks or new CRUD here would require Prisma schema edits which fall under TOO-RISKY per task constraints. AI surface area is already broad.

## Backlog (not implemented)

| Item | Tag | Why deferred |
|------|-----|---------------|
| Notifications (email/SMS/push) | NEEDS-CREDS | SMTP / Twilio / FCM credentials |
| Reporting / export | TOO-RISKY | Report templates needed |
| Webhook subscriptions | TOO-RISKY | Requires Prisma schema migration (project uses Prisma rather than lazy SQL) |
| Multi-agent orchestration | NEEDS-PRODUCT-DECISION | Agent topology |
| RAG over rulebooks | NEEDS-PRODUCT-DECISION | Vector store + corpus |
| White-label/reseller | NEEDS-PRODUCT-DECISION | Multi-tenant model |

## Apply pass 3 (frontend)

- **Action:** SKIPPED-NO-DOMAIN.
- `frontend/src/{components,hooks,lib,pages}` directories exist but contain zero files; no entry point, no `package.json`, no framework / styling baseline.
- ~12 AI endpoints on the backend (rule-lookup, mood-advisor, character backstory/arc, boardgame rules/strategy/scenario/variants, combat advice, lore generate, plus AI on npcs/narratives/sessions/timeline) are unreachable from any UI.
- Bootstrapping a Vite-React shell from scratch is outside the "minimal page / no new heavy frameworks" pass-3 budget. Needs an explicit FE-stack product decision (Vite-React vs. Next.js vs. existing component library) before pages can be added.

## Apply pass 4 (mechanical backlog)

**Action:** SKIPPED — same root cause as pass 3.
- `frontend/src/{components,hooks,lib,pages}` directories still contain zero files. No `package.json`, no entry point, no styling baseline.
- Pass-4 charter requires "FE page/tab in existing AI Center". There is no existing AI Center — adding pages would require bootstrapping the entire FE stack first, which falls under NEEDS-PRODUCT-DECISION (Vite-React vs. Next.js vs. another framework).
- Backend backlog (pass 2 review): all rows tagged TOO-RISKY / NEEDS-CREDS / NEEDS-PRODUCT-DECISION (Prisma migrations for webhooks, multi-agent topology, RAG corpus, multi-tenant white-label, SMTP/Twilio/FCM for notifications). No MECHANICAL items.

No code changes.
