-- Add Shop.lastOverCapEmailSentAt for cap-reached email dedup.
ALTER TABLE "Shop" ADD COLUMN "lastOverCapEmailSentAt" TIMESTAMP(3);
