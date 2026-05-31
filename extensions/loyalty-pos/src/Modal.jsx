// Royal Loyalty POS - modal. Earn + redeem in-store + balance lookup by
// customer. All mutations go through the app's App Proxy (server-side
// validated, HMAC-verified by the proxy). Graceful errors; no PII logged.
//
// POS UI is constrained - we can't bring custom typography, brand colors,
// or images into the modal. What we CAN control: information hierarchy,
// copy clarity, empty states, prominence of the balance, helpful banner
// feedback. This file leans on that.
import React, { useEffect, useState, useCallback } from "react";
import {
  Navigator,
  Screen,
  ScrollView,
  Section,
  Stack,
  Text,
  Button,
  Banner,
  List,
  reactExtension,
  useApi,
} from "@shopify/ui-extensions-react/point-of-sale";

// The POS extension reaches the app through the storefront App Proxy. The shop
// domain comes from the session API; the proxy authenticates the request.
const PROXY_BASE = "/apps/royal";

function useProxy() {
  const api = useApi();
  const shop = api.session?.currentSession?.shopDomain || "";
  const base = shop ? `https://${shop}${PROXY_BASE}` : PROXY_BASE;

  const call = useCallback(
    async (path, init) => {
      const res = await fetch(base + path, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(init && init.headers),
        },
      });
      if (!res.ok) throw new Error("request_failed");
      return res.json();
    },
    [base],
  );
  return call;
}

const ModalComponent = () => {
  const api = useApi();
  const call = useProxy();
  const [customer, setCustomer] = useState(null);
  const [data, setData] = useState(null);
  const [status, setStatus] = useState({ kind: "", msg: "" });
  const [busy, setBusy] = useState(false);
  // Localization bundle for POS (loaded once on mount).
  const [locBundle, setLocBundle] = useState({});
  const t = useCallback(
    (key, fallback) =>
      (locBundle && typeof locBundle[key] === "string"
        ? locBundle[key]
        : fallback) || "",
    [locBundle],
  );
  const tSub = useCallback((template, vars) => {
    let out = String(template == null ? "" : template);
    Object.keys(vars || {}).forEach((k) => {
      out = out.replace(new RegExp(`\\{${k}\\}`, "g"), String(vars[k]));
    });
    return out;
  }, []);

  // Pull the customer attached to the current POS cart, if any.
  useEffect(() => {
    try {
      const c = api.cart?.subscribable?.initial?.customer;
      if (c)
        setCustomer({
          id: c.id,
          name: `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim(),
        });
    } catch (e) {
      /* no cart customer */
    }
  }, [api]);

  // Fetch the localization bundle once. Falls back silently to English
  // defaults (the hardcoded fallbacks in t() calls below) on any error.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const d = await call("/loyalty/pos/localization", { method: "GET" });
        if (active && d && d.bundle) setLocBundle(d.bundle);
      } catch (e) {
        /* leave fallbacks */
      }
    })();
    return () => {
      active = false;
    };
  }, [call]);

  const lookup = useCallback(async () => {
    if (!customer) {
      setStatus({
        kind: "error",
        msg: t("pos.errorNoCustomer", "Attach a customer to the cart first."),
      });
      return;
    }
    setBusy(true);
    setStatus({ kind: "", msg: "" });
    try {
      const d = await call(
        `/loyalty/pos/balance?customerId=${encodeURIComponent(customer.id)}`,
        { method: "GET" },
      );
      setData(d);
    } catch (e) {
      setStatus({
        kind: "error",
        msg: t(
          "pos.errorLoadBalance",
          "Couldn't load this customer's balance. Check the connection and retry.",
        ),
      });
    } finally {
      setBusy(false);
    }
  }, [call, customer, t]);

  // Auto-lookup when a customer attaches to the cart - removes the extra
  // tap before a cashier can see the balance.
  useEffect(() => {
    if (customer && !data && !busy) {
      lookup();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer]);

  const earn = useCallback(async () => {
    if (!customer) return;
    setBusy(true);
    try {
      const cartTotal = api.cart?.subscribable?.initial?.grandTotal ?? "0";
      const d = await call("/loyalty/pos/earn", {
        method: "POST",
        body: JSON.stringify({
          customerId: customer.id,
          amount: cartTotal,
        }),
      });
      setData(d);
      setStatus({
        kind: "success",
        msg: tSub(t("social.awardedStatus", "Awarded {points} points."), {
          points: d.awarded ?? 0,
        }),
      });
    } catch (e) {
      setStatus({
        kind: "error",
        msg: t("pos.errorAward", "Could not award points. Please retry."),
      });
    } finally {
      setBusy(false);
    }
  }, [api, call, customer, t, tSub]);

  const redeem = useCallback(
    async (rewardId) => {
      if (!customer) return;
      setBusy(true);
      try {
        const d = await call("/loyalty/pos/redeem", {
          method: "POST",
          body: JSON.stringify({ customerId: customer.id, rewardId }),
        });
        if (d.discountCode) {
          // Apply the discount code to the active POS cart.
          api.cart?.applyCartDiscount?.("CODE", "Royal reward", d.discountCode);
        }
        setStatus({
          kind: "success",
          msg: d.discountCode
            ? tSub(t("pos.appliedCode", "Applied reward code {code}."), {
                code: d.discountCode,
              })
            : t("pos.redeemed", "Reward redeemed."),
        });
        lookup();
      } catch (e) {
        setStatus({
          kind: "error",
          msg: t("pos.errorRedeem", "Could not redeem. Please retry."),
        });
      } finally {
        setBusy(false);
      }
    },
    [api, call, customer, lookup, t, tSub],
  );

  const balance = data?.balance ?? 0;
  const rewards = data?.rewards ?? [];

  return (
    <Navigator>
      <Screen name="RoyalLoyalty" title={t("pos.tileTitle", "Royal Loyalty")}>
        <ScrollView>
          {status.msg ? (
            <Banner
              title={status.msg}
              variant={status.kind === "error" ? "critical" : "success"}
              visible
            />
          ) : null}

          {/* CUSTOMER HEADER - one visible block at the top so the cashier
              always knows who they're acting on. Auto-lookup runs the moment
              a customer attaches to the cart. */}
          <Section title={t("pos.sectionCustomer", "Customer")}>
            {customer ? (
              <Stack direction="vertical" spacing={0.5}>
                <Text variant="headingLarge">
                  {customer.name || t("pos.customerNoName", "Member")}
                </Text>
                <Text variant="captionRegular" color="TextSubdued">
                  {t("pos.customerId", "Loyalty member")}
                </Text>
              </Stack>
            ) : (
              <Stack direction="vertical" spacing={1}>
                <Text variant="bodyRegular" color="TextSubdued">
                  {t(
                    "pos.noCustomerOnCart",
                    "Attach a customer to the cart to start.",
                  )}
                </Text>
              </Stack>
            )}
          </Section>

          {/* BALANCE - the headline number. Big, alone in its section so
              the cashier can read it across the counter. */}
          <Section title={t("pos.sectionBalance", "Points balance")}>
            {customer ? (
              <Stack direction="vertical" spacing={0.5}>
                <Text variant="headingLarge">
                  {balance.toLocaleString()} {t("pos.pts", "pts")}
                </Text>
                {data ? (
                  <Text variant="captionRegular" color="TextSubdued">
                    {t("pos.balanceUpdated", "Up to date")}
                  </Text>
                ) : null}
                <Button
                  title={t("pos.refreshButton", "Refresh balance")}
                  type="plain"
                  onPress={lookup}
                  isDisabled={busy}
                />
              </Stack>
            ) : (
              <Text variant="bodyRegular" color="TextSubdued">
                {t(
                  "pos.lookupHint",
                  "A customer needs to be attached to see their points.",
                )}
              </Text>
            )}
          </Section>

          {/* EARN - one primary action when a customer is on cart. */}
          <Section title={t("pos.sectionEarn", "Award points for this sale")}>
            <Button
              title={t("pos.awardButton", "Award points for cart total")}
              type="primary"
              onPress={earn}
              isDisabled={busy || !customer}
            />
            {!customer ? (
              <Text variant="captionRegular" color="TextSubdued">
                {t(
                  "pos.earnDisabledHint",
                  "Available once a customer is on the cart.",
                )}
              </Text>
            ) : null}
          </Section>

          {/* REDEEM - list of available rewards. Disabled when insufficient
              balance for that reward; the disabled state is the affordance. */}
          <Section title={t("pos.sectionRedeem", "Redeem a reward")}>
            {!customer ? (
              <Text variant="bodyRegular" color="TextSubdued">
                {t(
                  "pos.redeemNoCustomer",
                  "Attach a customer to redeem rewards.",
                )}
              </Text>
            ) : !data ? (
              <Text variant="bodyRegular" color="TextSubdued">
                {t("pos.redeemLoading", "Loading rewards...")}
              </Text>
            ) : rewards.length === 0 ? (
              <Text variant="bodyRegular" color="TextSubdued">
                {t(
                  "pos.noRewards",
                  "No rewards available. Configure rewards in the Royal Loyalty admin.",
                )}
              </Text>
            ) : (
              <List
                data={rewards.map((r) => {
                  const canAfford = balance >= r.pointsCost;
                  return {
                    id: r.id,
                    leftSide: {
                      label: r.label || r.type,
                      subtitle: `${r.pointsCost.toLocaleString()} ${t("pos.pts", "pts")}`,
                    },
                    rightSide: {
                      label: canAfford
                        ? t("pos.redeemActionLabel", "Redeem")
                        : tSub(
                            t(
                              "pos.redeemNeedMore",
                              "{n} more pts",
                            ),
                            { n: (r.pointsCost - balance).toLocaleString() },
                          ),
                    },
                    onPress: () =>
                      canAfford
                        ? redeem(r.id)
                        : setStatus({
                            kind: "error",
                            msg: t(
                              "pos.errorInsufficient",
                              "Not enough points for that reward.",
                            ),
                          }),
                  };
                })}
              />
            )}
          </Section>
        </ScrollView>
      </Screen>
    </Navigator>
  );
};

export default reactExtension("pos.home.modal.render", () => <ModalComponent />);
