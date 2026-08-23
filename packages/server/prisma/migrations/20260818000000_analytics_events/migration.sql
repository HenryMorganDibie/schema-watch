CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anonymousVisitorId" TEXT,
    "sessionId" TEXT,
    "userId" TEXT,
    "projectId" TEXT,
    "route" TEXT,
    "referrerHost" TEXT,
    "metadata" JSONB,
    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AnalyticsEvent_eventName_occurredAt_idx" ON "AnalyticsEvent"("eventName", "occurredAt");
CREATE INDEX "AnalyticsEvent_occurredAt_idx" ON "AnalyticsEvent"("occurredAt");
CREATE INDEX "AnalyticsEvent_userId_idx" ON "AnalyticsEvent"("userId");
CREATE INDEX "AnalyticsEvent_projectId_idx" ON "AnalyticsEvent"("projectId");
CREATE INDEX "AnalyticsEvent_anonymousVisitorId_idx" ON "AnalyticsEvent"("anonymousVisitorId");
