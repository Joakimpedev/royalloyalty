/* Royal Loyalty storefront — vanilla JS, no framework, no Asset API.
 * Shared helpers for every block. Talks to the app's App Proxy endpoints
 * (server-side validated; the proxy verifies the Shopify signature). All
 * network failures degrade gracefully to a friendly inline message.
 *
 * Conventions:
 *  - data-royal-config on a block carries JSON: { proxy, loggedIn, customerId }
 *  - The /loyalty/balance response carries the SHOP'S branding (colors +
 *    copy, set in the admin Branding page). On first successful fetch we
 *    apply those colors as CSS variables on the root element and patch the
 *    visible copy so admin changes propagate to the storefront without a
 *    second config step in the theme editor.
 *  - No PII is written to localStorage. Only the referral code (?ref=) is
 *    persisted, in a first-party cookie, for attribution.
 */
(function () {
  "use strict";

  function readConfig(el) {
    try {
      return JSON.parse(el.getAttribute("data-royal-config") || "{}");
    } catch (e) {
      return {};
    }
  }

  function setStatus(node, kind, msg) {
    if (!node) return;
    node.textContent = msg;
    node.setAttribute("data-state", kind); // "loading" | "error" | "success"
    node.setAttribute("role", kind === "error" ? "alert" : "status");
  }

  function api(proxy, path, opts) {
    var url = proxy.replace(/\/$/, "") + path;
    var o = opts || {};
    o.headers = Object.assign(
      { "Content-Type": "application/json", Accept: "application/json" },
      o.headers || {}
    );
    o.credentials = "same-origin";
    return fetch(url, o).then(function (r) {
      if (!r.ok) throw new Error("request_failed");
      return r.json();
    });
  }

  /* Capture ?ref= for referral attribution into a first-party cookie. */
  function captureReferral() {
    try {
      var params = new URLSearchParams(window.location.search);
      var ref = params.get("ref");
      if (ref && /^[A-Za-z0-9-]{4,32}$/.test(ref)) {
        document.cookie =
          "royal_ref=" +
          encodeURIComponent(ref) +
          ";path=/;max-age=2592000;SameSite=Lax";
      }
    } catch (e) {
      /* non-fatal */
    }
  }

  /* Apply branding (colors + copy) from the /loyalty/balance response onto a
   * widget's root element. Idempotent — safe to call on every reload. */
  function applyBranding(root, branding) {
    if (!root || !branding) return;
    if (branding.primaryColor) {
      root.style.setProperty("--royal-primary", branding.primaryColor);
    }
    if (branding.secondaryColor) {
      root.style.setProperty("--royal-secondary", branding.secondaryColor);
    }
  }

  /* Format a currency amount client-side using the shop's currency code
   * returned in the loyalty payload. Used to relabel rewards that came
   * back as "5 off" → "$5 off" / "kr 5 off" depending on shop currency. */
  function formatMoney(amount, currencyCode) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: currencyCode || "USD",
      }).format(amount);
    } catch (e) {
      return (amount == null ? "" : amount) + " " + (currencyCode || "");
    }
  }

  /* Format a reward's displayed label using the shop's currency. */
  function rewardLabel(rw, currencyCode) {
    if (!rw) return "";
    if (rw.type === "amount_off" && rw.value != null)
      return formatMoney(rw.value, currencyCode) + " off";
    if (rw.type === "store_credit" && rw.value != null)
      return formatMoney(rw.value, currencyCode) + " in store credit";
    if (rw.type === "percent_off" && rw.value != null)
      return rw.value + "% off";
    if (rw.type === "free_shipping") return "Free shipping";
    if (rw.type === "free_product") return "Free product";
    return rw.label || rw.type;
  }

  /* Fetch the full loyalty payload (balance + earn rules + rewards +
   * referral link + activity + branding). Anonymous visitors get the
   * shop-wide bits (earn rules, rewards, branding) but no balance/tier. */
  function loadBalance(cfg, onData, onError) {
    api(cfg.proxy, "/loyalty/balance", { method: "GET" })
      .then(function (d) {
        onData(d);
      })
      .catch(function () {
        if (typeof onError === "function") onError("network");
      });
  }

  function redeem(cfg, rewardId) {
    return api(cfg.proxy, "/loyalty/redeem", {
      method: "POST",
      body: JSON.stringify({ rewardId: rewardId }),
    });
  }

  window.RoyalLoyalty = {
    readConfig: readConfig,
    setStatus: setStatus,
    api: api,
    loadBalance: loadBalance,
    redeem: redeem,
    captureReferral: captureReferral,
    applyBranding: applyBranding,
    formatMoney: formatMoney,
    rewardLabel: rewardLabel,
  };

  document.addEventListener("DOMContentLoaded", captureReferral);
})();
