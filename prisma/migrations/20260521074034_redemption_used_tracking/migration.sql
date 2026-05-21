-- Track when a redemption's discount code has been used at checkout.
-- Set by the orders/create webhook handler so the customer-facing active
-- codes list filters used codes out automatically.

ALTER TABLE "Redemption"
  ADD COLUMN "usedAt" TIMESTAMP(3),
  ADD COLUMN "usedOrderId" TEXT;

-- Lookup by (shopId, discountCode) when the webhook tries to match an
-- order's applied discount codes against pending redemptions.
CREATE INDEX "Redemption_shopId_discountCode_idx"
  ON "Redemption"("shopId", "discountCode");
