-- Phase 3D: agent decision lifecycle + quantity audit field
ALTER TABLE "AgentDecision" ADD COLUMN "supersededAt" TIMESTAMP(3);
ALTER TABLE "AgentDecision" ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1;

CREATE INDEX "AgentDecision_sessionId_supersededAt_idx" ON "AgentDecision"("sessionId", "supersededAt");
