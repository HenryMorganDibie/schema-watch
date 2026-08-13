-- Invalidate every issued JWT for a user by bumping this.
ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- Fixed-window rate limit counters, shared across serverless instances.
CREATE TABLE "RateLimit" (
    "id" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RateLimit_bucket_windowEnd_key" ON "RateLimit"("bucket", "windowEnd");
CREATE INDEX "RateLimit_windowEnd_idx" ON "RateLimit"("windowEnd");
