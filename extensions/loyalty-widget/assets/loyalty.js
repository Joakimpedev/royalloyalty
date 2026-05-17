/* Royal Loyalty storefront — vanilla JS, no framework, no Asset API.
 * Shared helpers for every block. Talks to the app's App Proxy endpoints
 * (server-side validated; the proxy verifies the Shopify signature). All
 * network failures degrade gracefully to a friendly inline message.
 *
 * Conventions:
 *  - data-royal-config on a block carries JSON: { proxy, loggedIn, customerId,
 *    strings, colors }
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

  function loadBalance(cfg, onData, onError) {
    if (!cfg.loggedIn) {
      onError("signed_out");
      return;
    }
    api(cfg.proxy, "/loyalty/balance", { method: "GET" })
      .then(function (d) {
        onData(d);
      })
      .catch(function () {
        onError("network");
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
  };

  document.addEventListener("DOMContentLoaded", captureReferral);
})();
