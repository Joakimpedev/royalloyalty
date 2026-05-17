// Royal Loyalty POS — modal. Earn + redeem in-store + balance lookup by
// customer. All mutations go through the app's App Proxy (server-side
// validated, HMAC-verified by the proxy). Graceful errors; no PII logged.
import React, { useEffect, useState, useCallback } from "react";
import {
  Navigator,
  Screen,
  ScrollView,
  Section,
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

  // Pull the customer attached to the current POS cart, if any.
  useEffect(() => {
    try {
      const c = api.cart?.subscribable?.initial?.customer;
      if (c) setCustomer({ id: c.id, name: `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() });
    } catch (e) {
      /* no cart customer */
    }
  }, [api]);

  const lookup = useCallback(async () => {
    if (!customer) {
      setStatus({ kind: "error", msg: "Attach a customer to the cart first." });
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
        msg: "Couldn't load this customer's balance. Check the connection and retry.",
      });
    } finally {
      setBusy(false);
    }
  }, [call, customer]);

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
      setStatus({ kind: "success", msg: `Awarded ${d.awarded ?? 0} points.` });
    } catch (e) {
      setStatus({ kind: "error", msg: "Could not award points. Please retry." });
    } finally {
      setBusy(false);
    }
  }, [api, call, customer]);

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
            ? `Applied reward code ${d.discountCode}.`
            : "Reward redeemed.",
        });
        lookup();
      } catch (e) {
        setStatus({ kind: "error", msg: "Could not redeem. Please retry." });
      } finally {
        setBusy(false);
      }
    },
    [api, call, customer, lookup],
  );

  return (
    <Navigator>
      <Screen name="RoyalLoyalty" title="Royal Loyalty">
        <ScrollView>
          {status.msg ? (
            <Banner
              title={status.msg}
              variant={status.kind === "error" ? "critical" : "success"}
              visible
            />
          ) : null}

          <Section title="Customer">
            <Text>
              {customer ? customer.name || customer.id : "No customer on cart"}
            </Text>
            <Button title="Look up balance" onPress={lookup} isDisabled={busy} />
          </Section>

          {data ? (
            <>
              <Section title="Balance">
                <Text>{data.balance ?? 0} points</Text>
                {data.tier ? <Text>Tier: {data.tier}</Text> : null}
              </Section>

              <Section title="Earn">
                <Button
                  title="Award points for this cart"
                  onPress={earn}
                  isDisabled={busy || !customer}
                />
              </Section>

              <Section title="Redeem">
                {data.rewards && data.rewards.length ? (
                  <List
                    data={data.rewards.map((r) => ({
                      id: r.id,
                      leftSide: {
                        label: `${r.label || r.type} — ${r.pointsCost} pts`,
                      },
                      onPress: () =>
                        (data.balance ?? 0) >= r.pointsCost
                          ? redeem(r.id)
                          : setStatus({
                              kind: "error",
                              msg: "Not enough points for that reward.",
                            }),
                    }))}
                  />
                ) : (
                  <Text>No rewards available.</Text>
                )}
              </Section>
            </>
          ) : (
            <Section title="Balance">
              <Text>Look up a customer to see their points and rewards.</Text>
            </Section>
          )}
        </ScrollView>
      </Screen>
    </Navigator>
  );
};

export default reactExtension("pos.home.modal.render", () => (
  <ModalComponent />
));
