-- Add Shop.ownerEmail, uninstalledAt, uninstallSurveySentAt for the
-- post-uninstall founder-style feedback email. Owner email is captured
-- lazily on every authenticated request (see app/routes/app.tsx loader)
-- BEFORE uninstall, because the uninstall webhook wipes Session rows and we
-- can no longer call the Shopify Admin API afterwards. Cron at
-- app/routes/api.cron.uninstall-survey.tsx is the sole reader.
ALTER TABLE "Shop" ADD COLUMN "ownerEmail" TEXT;
ALTER TABLE "Shop" ADD COLUMN "uninstalledAt" TIMESTAMP(3);
ALTER TABLE "Shop" ADD COLUMN "uninstallSurveySentAt" TIMESTAMP(3);
