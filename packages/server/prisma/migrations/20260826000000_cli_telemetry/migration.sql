-- Opt-in CLI telemetry.
--
-- Kept in its own tables rather than folded into AnalyticsEvent, because the
-- two answer different questions and must not be added together: AnalyticsEvent
-- counts web visitors to the Cloud app, these count machines running the local
-- CLI. Merging them would make "visitors" meaningless.

CREATE TABLE "TelemetryInstallation" (
    "id" TEXT NOT NULL,
    "installId" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" TEXT,
    "platform" TEXT,
    "nodeMajor" INTEGER,
    "environment" TEXT NOT NULL DEFAULT 'local',
    "teamId" TEXT,
    CONSTRAINT "TelemetryInstallation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelemetryInstallation_installId_key" ON "TelemetryInstallation"("installId");
CREATE INDEX "TelemetryInstallation_lastSeenAt_idx" ON "TelemetryInstallation"("lastSeenAt");
CREATE INDEX "TelemetryInstallation_environment_idx" ON "TelemetryInstallation"("environment");
CREATE INDEX "TelemetryInstallation_teamId_idx" ON "TelemetryInstallation"("teamId");

-- SET NULL, not CASCADE: if a team is deleted the installation stays counted
-- as anonymous rather than vanishing from the adoption history.
ALTER TABLE "TelemetryInstallation"
  ADD CONSTRAINT "TelemetryInstallation_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "TelemetryEvent" (
    "id" TEXT NOT NULL,
    "installId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" TEXT,
    "environment" TEXT NOT NULL DEFAULT 'local',
    CONSTRAINT "TelemetryEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TelemetryEvent_event_occurredAt_idx" ON "TelemetryEvent"("event", "occurredAt");
CREATE INDEX "TelemetryEvent_occurredAt_idx" ON "TelemetryEvent"("occurredAt");
CREATE INDEX "TelemetryEvent_installId_idx" ON "TelemetryEvent"("installId");

ALTER TABLE "TelemetryEvent"
  ADD CONSTRAINT "TelemetryEvent_installId_fkey"
  FOREIGN KEY ("installId") REFERENCES "TelemetryInstallation"("installId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Matches every other table in this database: RLS on with no policies, so the
-- public PostgREST surface can reach nothing. All access is via the server's
-- pooled connection, which is not subject to RLS.
ALTER TABLE "TelemetryInstallation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TelemetryEvent" ENABLE ROW LEVEL SECURITY;
