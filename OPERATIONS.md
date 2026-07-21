# Governed campaign sessions

`POST /api/governed-sessions` creates an idempotent campaign snapshot containing a versioned ruleset, participants and consent settings, characters, encounters, ordered events, rule citations, and AI provenance. Campaign membership is checked from durable storage. Consent-line violations and uncited/unlicensed rule decisions block publication. Only the campaign GM can publish; only published snapshots can be exported as `campaign-session.v1` JSON.

Copy `backend/.env.example`, run `scripts/bootstrap.sh`, and explicitly apply `scripts/migrate.sh`. `start.sh` only starts local processes. Synthetic seeding requires `CONFIRM_DEMO_SEED=yes`. AI credentials are optional for deterministic campaign workflows and provider calls fail when not configured.

Commercial rules/content libraries, voice and dice providers, VTT sharing, reminders, webhook delivery, and marketplace licensing remain adapter/product decisions. Owner-supplied content must carry its license scope; generated content must retain provenance.
