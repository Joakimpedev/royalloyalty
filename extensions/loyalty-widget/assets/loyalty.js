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

  /* Render the customer's active discount codes into the given container.
   * Used by launcher, loyalty page, and cart widget. Each card has:
   *  - reward label + points spent
   *  - the code (selectable text)
   *  - Copy button (clipboard + fallback)
   *  - Apply to cart button (Shopify /discount/CODE?redirect=/cart)
   * Hides the wrap element when the list is empty. */
  function renderActiveCodes(wrap, list, codes, statusEl) {
    if (!list) return;
    if (!codes || !codes.length) {
      if (wrap) wrap.hidden = true;
      list.innerHTML = "";
      return;
    }
    if (wrap) wrap.hidden = false;
    list.innerHTML = "";
    codes.forEach(function (c) {
      var card = document.createElement("div");
      card.className = "royal-active-code";
      var labelEl = document.createElement("div");
      labelEl.className = "royal-active-code__label";
      labelEl.innerHTML =
        "<strong>" +
        c.label +
        "</strong>" +
        '<span class="royal-muted"> · ' +
        c.pointsSpent +
        " pts</span>";
      var codeRow = document.createElement("div");
      codeRow.className = "royal-active-code__row";
      var codeBox = document.createElement("code");
      codeBox.className = "royal-active-code__code";
      codeBox.textContent = c.code;
      var copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "royal-btn royal-btn--ghost";
      copyBtn.textContent = "Copy";
      copyBtn.addEventListener("click", function () {
        copyText(c.code).then(function () {
          copyBtn.textContent = "Copied!";
          setTimeout(function () {
            copyBtn.textContent = "Copy";
          }, 1500);
        });
      });
      var applyBtn = document.createElement("a");
      applyBtn.className = "royal-btn";
      applyBtn.textContent = "Apply to cart";
      applyBtn.href =
        "/discount/" + encodeURIComponent(c.code) + "?redirect=/cart";
      codeRow.appendChild(codeBox);
      codeRow.appendChild(copyBtn);
      codeRow.appendChild(applyBtn);
      card.appendChild(labelEl);
      card.appendChild(codeRow);
      list.appendChild(card);
    });
    if (statusEl && typeof statusEl === "object") {
      /* nothing — placeholder if we ever need to message after render */
    }
  }

  function copyText(text) {
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard &&
      navigator.clipboard.writeText
    ) {
      return navigator.clipboard.writeText(text).catch(function () {
        return fallbackCopy(text);
      });
    }
    return fallbackCopy(text);
  }
  function fallbackCopy(text) {
    return new Promise(function (resolve) {
      try {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      } catch (e) {
        /* non-fatal */
      }
      resolve();
    });
  }

  /* Substitute {points} {balance} {more} placeholders in a string. */
  function fillTemplate(tpl, vars) {
    return String(tpl || "")
      .replace(/\{points\}/g, vars.points == null ? "0" : vars.points)
      .replace(/\{balance\}/g, vars.balance == null ? "0" : vars.balance)
      .replace(/\{more\}/g, vars.more == null ? "0" : vars.more);
  }

  /* Calculate points earned for a given money amount using the shop's first
   * purchase earn rule. Returns 0 if no purchase rule is configured. */
  function pointsForAmount(amount, earnRules) {
    if (!earnRules || !earnRules.length || !amount) return 0;
    var rule = null;
    for (var i = 0; i < earnRules.length; i++) {
      if (earnRules[i].action === "purchase") {
        rule = earnRules[i];
        break;
      }
    }
    if (!rule) return 0;
    if (rule.perDollar) {
      var per = Math.max(1, rule.perAmount || 1);
      return Math.floor((amount / per) * (rule.points || 0));
    }
    return rule.points || 0;
  }

  /* Read product price from common Shopify globals. Returns dollars (not
   * cents). Falls back to 0 if we can't find it — the card just renders
   * with 0 points, which is better than not rendering at all. */
  function readProductPrice() {
    try {
      if (window.ShopifyAnalytics && window.ShopifyAnalytics.meta) {
        var p =
          window.ShopifyAnalytics.meta.product ||
          (window.ShopifyAnalytics.meta.products &&
            window.ShopifyAnalytics.meta.products[0]);
        if (p && p.variants && p.variants[0] && p.variants[0].price != null) {
          // Shopify ships variant price in cents.
          return p.variants[0].price / 100;
        }
      }
      var meta = document.querySelector(
        'meta[property="product:price:amount"]'
      );
      if (meta && meta.content) return parseFloat(meta.content);
    } catch (e) {
      /* non-fatal */
    }
    return 0;
  }

  /* Inject the "Earn X points with this purchase" card above the add-to-cart
   * button on product pages. No-op if not on a product page or the form
   * can't be found. Idempotent — guards against double-insert. */
  function injectProduct(cfg, payload) {
    var b = payload && payload.branding;
    if (!b || !b.productEnabled) return;
    if (document.getElementById("royal-injected-product")) return;
    // Detect product page: must have an add-to-cart form.
    var form = document.querySelector(
      'form[action^="/cart/add"], form[action*="/cart/add"]'
    );
    if (!form) return;
    var btn =
      form.querySelector('button[type="submit"], [type="submit"]') || null;
    var price = readProductPrice();
    var earned = pointsForAmount(price, payload.earnRules);
    var pointsName =
      (b.pointsName && b.pointsName.toLowerCase()) || "points";
    var heading = fillTemplate(b.productHeading, {
      points: earned,
      balance: payload.balance || 0,
      more: Math.max(0, (payload.rewards && payload.rewards[0]
        ? payload.rewards[0].pointsCost
        : 0) - (payload.balance || 0)),
    });
    var subtext = fillTemplate(b.productSubtext, {
      points: earned,
      balance: payload.balance || 0,
      more: Math.max(0, (payload.rewards && payload.rewards[0]
        ? payload.rewards[0].pointsCost
        : 0) - (payload.balance || 0)),
    });
    var card = document.createElement("div");
    card.id = "royal-injected-product";
    card.className = "royal-injected royal-injected--product";
    card.setAttribute("data-points-name", pointsName);
    card.style.setProperty("--royal-primary", b.productAccent || "#2C2A29");
    card.innerHTML =
      '<div class="royal-injected__icon" aria-hidden="true">★</div>' +
      '<div class="royal-injected__body">' +
      '<div class="royal-injected__heading"></div>' +
      '<div class="royal-injected__sub"></div>' +
      "</div>";
    card.querySelector(".royal-injected__heading").textContent = heading;
    card.querySelector(".royal-injected__sub").textContent = subtext;
    if (btn && btn.parentNode) {
      btn.parentNode.insertBefore(card, btn);
    } else {
      form.insertBefore(card, form.firstChild);
    }
  }

  /* Inject the cart redeem card into the cart drawer / cart page. Hooks a
   * MutationObserver so it survives the drawer being re-rendered by the
   * theme on each cart update. */
  function injectCart(cfg, payload) {
    var b = payload && payload.branding;
    if (!b || !b.cartEnabled) return;

    function render() {
      if (document.getElementById("royal-injected-cart")) return;
      // Find a cart form — covers the /cart page and most drawer themes.
      var form = document.querySelector('form[action="/cart"], form[action^="/cart?"]');
      if (!form) return;

      var card = document.createElement("div");
      card.id = "royal-injected-cart";
      card.className = "royal-injected royal-injected--cart";
      card.style.setProperty("--royal-primary", b.cartAccent || "#2C2A29");

      if (!cfg.loggedIn) {
        card.innerHTML =
          '<div class="royal-injected__heading">' +
          (b.cartHeading || "Use your points") +
          '</div>' +
          '<div class="royal-injected__sub"><a href="/account/login">Sign in</a> to apply your points to this order.</div>';
        insertIntoForm(form, card);
        return;
      }

      var balance = payload.balance || 0;
      var rewards = (payload.rewards || []).slice().sort(function (a, b) {
        return a.pointsCost - b.pointsCost;
      });
      var affordable = rewards.filter(function (r) {
        return balance >= r.pointsCost;
      });

      var head =
        '<div class="royal-injected__head">' +
        '<div class="royal-injected__icon" aria-hidden="true">★</div>' +
        '<div class="royal-injected__heading">' +
        (b.cartHeading || "Use your points") +
        " — " +
        balance +
        " " +
        ((b.pointsName && b.pointsName.toLowerCase()) || "points") +
        "</div>" +
        "</div>";

      var earnLine = b.cartShowEarnLine
        ? '<div class="royal-injected__sub" id="royal-injected-cart-earn">' +
          "Calculating points earned…" +
          "</div>"
        : "";

      var list = "";
      if (!affordable.length && rewards.length) {
        list =
          '<div class="royal-injected__sub">' +
          "Keep shopping to unlock your first reward (" +
          rewards[0].pointsCost +
          " points)." +
          "</div>";
      } else if (affordable.length) {
        list = '<div class="royal-injected__rewards">';
        affordable.forEach(function (r) {
          var label = rewardLabel(r, payload.currencyCode);
          list +=
            '<button type="button" class="royal-injected__reward" data-reward-id="' +
            r.id +
            '">' +
            '<span>' +
            label +
            "</span>" +
            '<span class="royal-injected__cost">' +
            r.pointsCost +
            " pts</span>" +
            "</button>";
        });
        list += "</div>";
      }

      var activeCodesBlock =
        payload.activeCodes && payload.activeCodes.length
          ? '<div class="royal-injected__active-codes-wrap">' +
            '<div class="royal-injected__sub" style="margin-bottom:6px;"><strong>Your active codes</strong></div>' +
            '<div id="royal-injected-cart-active-codes"></div>' +
            "</div>"
          : "";

      var status =
        '<div class="royal-status" id="royal-injected-cart-status" aria-live="polite"></div>';

      card.innerHTML = head + earnLine + activeCodesBlock + list + status;
      insertIntoForm(form, card);

      // Render active-code cards into the placeholder container.
      if (payload.activeCodes && payload.activeCodes.length) {
        renderActiveCodes(
          null,
          card.querySelector("#royal-injected-cart-active-codes"),
          payload.activeCodes
        );
      }

      // Wire reward buttons.
      var statusEl = card.querySelector("#royal-injected-cart-status");
      card
        .querySelectorAll(".royal-injected__reward")
        .forEach(function (rb) {
          rb.addEventListener("click", function () {
            rb.disabled = true;
            setStatus(statusEl, "loading", "Redeeming…");
            redeem(cfg, rb.getAttribute("data-reward-id"))
              .then(function (res) {
                if (res.discountCode) {
                  window.location.href =
                    "/discount/" +
                    encodeURIComponent(res.discountCode) +
                    "?redirect=/cart";
                } else {
                  setStatus(statusEl, "success", "Reward redeemed.");
                  rb.disabled = false;
                }
              })
              .catch(function () {
                rb.disabled = false;
                setStatus(
                  statusEl,
                  "error",
                  "We couldn't apply that reward. Please try again."
                );
              });
          });
        });

      // Populate "+X points for this order" once we know the cart total.
      if (b.cartShowEarnLine) {
        fetch("/cart.js", { credentials: "same-origin" })
          .then(function (r) {
            return r.json();
          })
          .then(function (c) {
            var earn = pointsForAmount(
              (c.total_price || 0) / 100,
              payload.earnRules
            );
            var line = card.querySelector("#royal-injected-cart-earn");
            if (line)
              line.textContent =
                "+" +
                earn +
                " " +
                ((b.pointsName && b.pointsName.toLowerCase()) || "points") +
                " for this order";
          })
          .catch(function () {
            var line = card.querySelector("#royal-injected-cart-earn");
            if (line) line.remove();
          });
      }
    }

    function insertIntoForm(form, card) {
      // Prefer above the checkout button.
      var checkout =
        form.querySelector('[name="checkout"], button[name="checkout"]') ||
        form.querySelector('button[type="submit"]');
      if (checkout && checkout.parentNode) {
        checkout.parentNode.insertBefore(card, checkout);
      } else {
        form.appendChild(card);
      }
    }

    render();
    // Re-inject after drawer/cart re-renders. Throttled implicitly by the
    // idempotency check inside render().
    var pending = false;
    var mo = new MutationObserver(function () {
      if (pending) return;
      pending = true;
      setTimeout(function () {
        pending = false;
        if (!document.getElementById("royal-injected-cart")) render();
      }, 50);
    });
    mo.observe(document.body, { childList: true, subtree: true });
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
    injectProduct: injectProduct,
    injectCart: injectCart,
    pointsForAmount: pointsForAmount,
    renderActiveCodes: renderActiveCodes,
    copyText: copyText,
    claimSocial: claimSocial,
    renderSocial: renderSocial,
  };

  /* POST the social claim to the proxy. Used by renderSocial below. */
  function claimSocial(cfg, platform) {
    return api(cfg.proxy, "/loyalty/claim-social", {
      method: "POST",
      body: JSON.stringify({ platform: platform }),
    });
  }

  /* Render a list of Follow cards inside `container`. Each card: handle
   * + label + points; clicking opens the platform URL in a new tab and
   * fires a claim. Once claimed, the card shows "Awarded" and disables. */
  function renderSocial(container, platforms, cfg, statusEl) {
    if (!container) return;
    if (!platforms || !platforms.length) {
      container.innerHTML = "";
      return;
    }
    container.innerHTML = "";
    platforms.forEach(function (p) {
      var card = document.createElement("div");
      card.className = "royal-card royal-social-card";
      var line = document.createElement("div");
      line.innerHTML =
        "<strong>" +
        ({
          instagram: "Instagram",
          tiktok: "TikTok",
          x: "X",
          facebook: "Facebook",
          youtube: "YouTube",
        }[p.id] || p.id) +
        "</strong>" +
        ' <span class="royal-muted">— ' +
        p.points +
        " pts</span>";
      var handle = document.createElement("div");
      handle.className = "royal-muted";
      handle.style.fontSize = "13px";
      handle.textContent = p.handle;
      var btn = document.createElement("a");
      btn.className = "royal-btn";
      btn.href = p.url;
      btn.target = "_blank";
      btn.rel = "noopener noreferrer";
      btn.style.display = "inline-block";
      btn.style.marginTop = "8px";
      btn.style.textDecoration = "none";
      btn.textContent = p.label;
      btn.addEventListener("click", function () {
        if (!cfg || !cfg.loggedIn) return;
        // Fire-and-await; the click already opened the URL, so any UI
        // update happens after the network round-trip.
        claimSocial(cfg, p.id)
          .then(function (res) {
            if (res && res.outcome === "awarded") {
              btn.textContent = "Awarded +" + (res.points || p.points);
              btn.classList.add("royal-btn--ghost");
              if (statusEl)
                setStatus(
                  statusEl,
                  "success",
                  "Awarded " + (res.points || p.points) + " points.",
                );
            } else if (res && res.outcome === "duplicate") {
              btn.textContent = "Already claimed";
              btn.classList.add("royal-btn--ghost");
            }
          })
          .catch(function () {
            /* non-fatal — user already opened the social page */
          });
      });
      card.appendChild(line);
      card.appendChild(handle);
      card.appendChild(btn);
      container.appendChild(card);
    });
  }

  document.addEventListener("DOMContentLoaded", captureReferral);
})();
