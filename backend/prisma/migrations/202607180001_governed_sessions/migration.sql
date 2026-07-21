CREATE TABLE IF NOT EXISTS "governed_session_snapshots" (
  "id" TEXT PRIMARY KEY,
  "campaignId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "status" TEXT NOT NULL CHECK ("status" IN ('blocked','draft_export_ready','published')),
  "snapshot" JSONB NOT NULL,
  "createdBy" TEXT NOT NULL,
  "approvedBy" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("campaignId", "idempotencyKey")
);
CREATE TABLE IF NOT EXISTS "governed_session_events" (
  "id" TEXT PRIMARY KEY,
  "workflowId" TEXT NOT NULL REFERENCES "governed_session_snapshots"("id") ON DELETE CASCADE,
  "actorId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT NOT NULL,
  "evidenceHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "governed_session_snapshots_campaignId_status_idx" ON "governed_session_snapshots"("campaignId","status");
CREATE INDEX IF NOT EXISTS "governed_session_events_workflowId_createdAt_idx" ON "governed_session_events"("workflowId","createdAt");
