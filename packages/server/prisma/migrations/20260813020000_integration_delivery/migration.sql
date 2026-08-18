CREATE TYPE "DeliveryStatus" AS ENUM ('SUCCESS', 'FAILED');

ALTER TABLE "Integration" ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Integration" ADD COLUMN "minSeverity" "ChangeSeverity" NOT NULL DEFAULT 'BREAKING';
ALTER TABLE "Integration" ADD COLUMN "consecutiveFailures" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Integration" ADD COLUMN "lastError" TEXT;
ALTER TABLE "Integration" ADD COLUMN "lastDeliveryAt" TIMESTAMP(3);

CREATE TABLE "IntegrationDelivery" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "status" "DeliveryStatus" NOT NULL,
    "statusCode" INTEGER,
    "summary" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IntegrationDelivery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "IntegrationDelivery_integrationId_createdAt_idx" ON "IntegrationDelivery"("integrationId", "createdAt");

ALTER TABLE "IntegrationDelivery" ADD CONSTRAINT "IntegrationDelivery_integrationId_fkey"
  FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
