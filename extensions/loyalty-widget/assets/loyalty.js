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

  /* Translation lookup. The server ships a flat key→value bundle in
   * payload.localization (merchant overrides on top of the active
   * locale's baked defaults). We hold the most-recently-seen bundle in
   * module scope so any code path can call t(key) without threading the
   * payload through. defaultValue is a final fallback when neither the
   * merchant nor the baked defaults have the key — should never trigger
   * in normal flow since the baked defaults cover every key in the
   * catalog. */
  var _bundle = {};
  var _localeCode = "en";
  var _isRtl = false;
  function setBundle(bundle) {
    _bundle = bundle || {};
  }
  function getLocale() {
    return { code: _localeCode, rtl: _isRtl };
  }
  function t(key, defaultValue) {
    var v = _bundle && _bundle[key];
    if (typeof v === "string") return v;
    return defaultValue == null ? "" : defaultValue;
  }
  /* Substitute simple {placeholder} tokens (single-brace, legacy form
   * used by cart / product injection runtime values). */
  function tSubstitute(template, vars) {
    var out = String(template == null ? "" : template);
    Object.keys(vars || {}).forEach(function (k) {
      out = out.replace(new RegExp("\\{" + k + "\\}", "g"), String(vars[k]));
    });
    return out;
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
      if (!r.ok) {
        return r.text().then(function (body) {
          var err = new Error("request_failed");
          err.royalDiag = {
            url: url,
            status: r.status,
            statusText: r.statusText,
            bodySnippet: (body || "").slice(0, 240),
            contentType: r.headers.get("content-type") || "",
          };
          throw err;
        });
      }
      return r.text().then(function (body) {
        try {
          return JSON.parse(body);
        } catch (e) {
          var err = new Error("parse_failed");
          err.royalDiag = {
            url: url,
            status: r.status,
            bodySnippet: (body || "").slice(0, 240),
            contentType: r.headers.get("content-type") || "",
            note: "response was not valid JSON",
          };
          throw err;
        }
      });
    }).catch(function (e) {
      if (e && e.royalDiag) throw e;
      var err = new Error("network_error");
      err.royalDiag = {
        url: url,
        note: "fetch failed (network/CORS/offline): " + (e && e.message ? e.message : "unknown"),
      };
      throw err;
    });
  }

  function renderDiag(target, diag, label) {
    if (!target || !diag) return;
    var box = document.createElement("pre");
    box.className = "royal-diag";
    box.style.cssText =
      "margin:8px 0 0;padding:10px 12px;background:#fff5f5;border:1px solid #f3c2c2;border-radius:6px;color:#7a1f1f;font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;word-break:break-all;text-align:left;";
    var lines = [];
    if (label) lines.push("[" + label + "]");
    if (diag.url) lines.push("URL: " + diag.url);
    if (diag.status != null) lines.push("Status: " + diag.status + (diag.statusText ? " " + diag.statusText : ""));
    if (diag.contentType) lines.push("Content-Type: " + diag.contentType);
    if (diag.note) lines.push("Note: " + diag.note);
    if (diag.bodySnippet) lines.push("Body: " + diag.bodySnippet);
    box.textContent = lines.join("\n");
    target.appendChild(box);
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
    try {
      // Always log so we can verify what the storefront actually received vs.
      // what the admin Branding page is showing. If primaryColor here doesn't
      // match the admin, the bug is server/cache; if it does match but the
      // pill is still default-colored, the bug is CSS/override.
      var cs = getComputedStyle(root);
      console.log("[RoyalLoyalty] branding applied", {
        primaryColor: branding.primaryColor,
        secondaryColor: branding.secondaryColor,
        computedPrimary: cs.getPropertyValue("--royal-primary").trim(),
        computedSecondary: cs.getPropertyValue("--royal-secondary").trim(),
      });
    } catch (e) {
      /* non-fatal */
    }
    try {
      if (
        typeof location !== "undefined" &&
        /[?&]royal_debug=1\b/.test(location.search)
      ) {
        renderDebugOverlay(branding, root);
      }
    } catch (e) {
      /* non-fatal */
    }
  }

  /* Floating overlay shown when the storefront URL has ?royal_debug=1. Surfaces
   * the resolved branding payload + the CSS vars actually applied, so we can
   * diagnose "admin shows orange, storefront stays default" without DevTools. */
  function renderDebugOverlay(branding, root) {
    var id = "royal-debug-overlay";
    var box = document.getElementById(id);
    if (!box) {
      box = document.createElement("div");
      box.id = id;
      box.style.cssText =
        "position:fixed;top:8px;left:8px;z-index:2147483647;" +
        "background:#111;color:#fff;font:12px/1.4 ui-monospace,monospace;" +
        "padding:10px 12px;border-radius:8px;max-width:360px;" +
        "box-shadow:0 6px 24px rgba(0,0,0,.35);white-space:pre-wrap;";
      document.body.appendChild(box);
    }
    var cs = root ? getComputedStyle(root) : null;
    var pillCs = (function () {
      var pill = document.getElementById("royal-launcher-btn");
      return pill ? getComputedStyle(pill) : null;
    })();
    box.textContent =
      "Royal Loyalty diagnostics\n" +
      "payload.primaryColor:   " + (branding.primaryColor || "(none)") + "\n" +
      "payload.secondaryColor: " + (branding.secondaryColor || "(none)") + "\n" +
      "css --royal-primary:    " + (cs ? cs.getPropertyValue("--royal-primary").trim() : "?") + "\n" +
      "css --royal-secondary:  " + (cs ? cs.getPropertyValue("--royal-secondary").trim() : "?") + "\n" +
      "pill bg (computed):     " + (pillCs ? pillCs.backgroundColor : "?") + "\n" +
      "pill color (computed):  " + (pillCs ? pillCs.color : "?");
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
    if (rw.type === "free_shipping")
      return t("reward.type.freeShipping", "Free shipping");
    if (rw.type === "free_product")
      return t("reward.type.freeProduct", "Free product");
    return rw.label || rw.type;
  }

  /* Fetch the full loyalty payload (balance + earn rules + rewards +
   * referral link + activity + branding). Anonymous visitors get the
   * shop-wide bits (earn rules, rewards, branding) but no balance/tier. */
  function loadBalance(cfg, onData, onError) {
    api(cfg.proxy, "/loyalty/balance", { method: "GET" })
      .then(function (d) {
        // Cache the localization bundle so t() can resolve keys without
        // needing the payload passed in everywhere. RTL locales
        // (ar/he/ur) get a global flag the renderers consult before
        // injecting cards.
        if (d && d.localization) setBundle(d.localization);
        if (d && d.locale) {
          _localeCode = d.locale.code || "en";
          _isRtl = !!d.locale.rtl;
          // Set dir="rtl" on the root widget elements so all visual
          // mirroring (text-align, icon position) flows from one
          // attribute. Applied lazily because the elements may not be
          // present yet when this fires.
          ["royal-launcher-root", "royal-page-root", "royal-account-root"].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.setAttribute("dir", _isRtl ? "rtl" : "ltr");
          });
        }
        onData(d);
      })
      .catch(function (err) {
        if (typeof onError === "function") onError(err && err.royalDiag ? err.royalDiag : { note: "unknown" });
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
      copyBtn.textContent = t("reward.copyCode", "Copy");
      copyBtn.addEventListener("click", function () {
        copyText(c.code).then(function () {
          copyBtn.textContent = t("reward.copiedCode", "Copied!");
          setTimeout(function () {
            copyBtn.textContent = t("reward.copyCode", "Copy");
          }, 1500);
        });
      });
      var applyBtn = document.createElement("a");
      applyBtn.className = "royal-btn";
      applyBtn.textContent = t("reward.applyToCart", "Apply to cart");
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

  /* Substitute {points} {balance} {more} placeholders in a string.
   * Legacy single-brace form used by the Branding-page productHeading /
   * productSubtext fields. New earn-rule injection fields use the
   * substituteTokens function below (double-brace form, matches the
   * server-side substituter in app/lib/tokens.ts). */
  function fillTemplate(tpl, vars) {
    return String(tpl || "")
      .replace(/\{points\}/g, vars.points == null ? "0" : vars.points)
      .replace(/\{balance\}/g, vars.balance == null ? "0" : vars.balance)
      .replace(/\{more\}/g, vars.more == null ? "0" : vars.more);
  }

  /* Mirror of app/lib/tokens.ts::substituteTokens — resolves {{token_name}}
   * placeholders against the provided ctx. Unknown tokens are left literal
   * so the merchant sees which name didn't resolve. */
  function substituteTokens(input, ctx) {
    return String(input == null ? "" : input).replace(
      /\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/gi,
      function (m, name) {
        var key = String(name).toLowerCase();
        if (ctx && Object.prototype.hasOwnProperty.call(ctx, key)) {
          return ctx[key];
        }
        return m;
      }
    );
  }

  /* Look up the purchase rule out of the payload's earn rules — used by
   * the product-page and cart injections to read the merchant-edited
   * productLine / cartLine templates. Returns null when the purchase rule
   * isn't configured (in which case the injections fall back to the
   * Branding-page heading or skip rendering). */
  function findPurchaseRule(payload) {
    if (!payload || !payload.earnRules) return null;
    for (var i = 0; i < payload.earnRules.length; i++) {
      if (payload.earnRules[i].action === "purchase")
        return payload.earnRules[i];
    }
    return null;
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
    var balance = payload.balance || 0;
    var more = Math.max(
      0,
      (payload.rewards && payload.rewards[0]
        ? payload.rewards[0].pointsCost
        : 0) - balance
    );
    // Heading source priority:
    //   1. Purchase earn rule's productLine (new, merchant-edits on the
    //      "Place an order" page)
    //   2. Legacy Branding.product.heading
    //   3. Built-in default
    var purchaseRule = findPurchaseRule(payload);
    var headingTemplate =
      (purchaseRule && purchaseRule.productLine) ||
      b.productHeading ||
      "Earn {points} points with this purchase";
    var heading = /\{\{/.test(headingTemplate)
      ? substituteTokens(headingTemplate, {
          points: String(earned),
          balance: String(balance),
          more: String(more),
        })
      : fillTemplate(headingTemplate, {
          points: earned,
          balance: balance,
          more: more,
        });
    var subtext = fillTemplate(b.productSubtext, {
      points: earned,
      balance: balance,
      more: more,
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
          (b.cartHeading || t("cart.heading", "Use your points")) +
          '</div>' +
          '<div class="royal-injected__sub"><a href="/account/login">' +
          t("empty.rewardsSignInLink", "Sign in") +
          "</a> " +
          t("cart.signedOutCta", "to apply your points to this order.") +
          "</div>";
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
        (b.cartHeading || t("cart.heading", "Use your points")) +
        " — " +
        balance +
        " " +
        ((b.pointsName && b.pointsName.toLowerCase()) || "points") +
        "</div>" +
        "</div>";

      var earnLine = b.cartShowEarnLine
        ? '<div class="royal-injected__sub" id="royal-injected-cart-earn">' +
          t("cart.earnLineLoading", "Calculating points earned…") +
          "</div>"
        : "";

      var list = "";
      if (!affordable.length && rewards.length) {
        list =
          '<div class="royal-injected__sub">' +
          tSubstitute(
            t(
              "cart.keepShoppingForFirstReward",
              "Keep shopping to unlock your first reward ({points} points).",
            ),
            { points: rewards[0].pointsCost },
          ) +
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
            '<div class="royal-injected__sub" style="margin-bottom:6px;"><strong>' +
            t("cart.activeCodesHeading", "Your active codes") +
            "</strong></div>" +
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
            setStatus(statusEl, "loading", t("status.redeeming", "Redeeming…"));
            redeem(cfg, rb.getAttribute("data-reward-id"))
              .then(function (res) {
                if (res.discountCode) {
                  window.location.href =
                    "/discount/" +
                    encodeURIComponent(res.discountCode) +
                    "?redirect=/cart";
                } else {
                  setStatus(
                    statusEl,
                    "success",
                    t("status.rewardRedeemed", "Reward redeemed."),
                  );
                  rb.disabled = false;
                }
              })
              .catch(function () {
                rb.disabled = false;
                setStatus(
                  statusEl,
                  "error",
                  t(
                    "error.couldNotApplyReward",
                    "We couldn't apply that reward. Please try again.",
                  ),
                );
              });
          });
        });

      // Populate the cart earn-line once we know the cart total. The
      // line text comes from the merchant-editable cartLine template on
      // the purchase rule (with a built-in default if blank). Cashback
      // callout is appended after the rule's line, since it's a separate
      // surface controlled elsewhere.
      if (b.cartShowEarnLine) {
        fetch("/cart.js", { credentials: "same-origin" })
          .then(function (r) {
            return r.json();
          })
          .then(function (c) {
            var totalDollars = (c.total_price || 0) / 100;
            var earn = pointsForAmount(totalDollars, payload.earnRules);
            var line = card.querySelector("#royal-injected-cart-earn");
            var pieces = [];
            if (earn > 0) {
              var purchaseRule = findPurchaseRule(payload);
              var template =
                (purchaseRule && purchaseRule.cartLine) ||
                t(
                  "rule.purchase.cartLine",
                  "+{{points}} pts for this order",
                );
              pieces.push(
                substituteTokens(template, {
                  points: String(earn),
                  balance: String(payload.balance || 0),
                })
              );
            }
            // Cashback callout — encourage repeat purchases by surfacing
            // the store credit they'll earn on this specific order.
            if (
              payload.cashback &&
              payload.cashback.enabled &&
              payload.cashback.percent > 0 &&
              totalDollars > 0
            ) {
              var credit =
                Math.round(
                  totalDollars * (payload.cashback.percent / 100) * 100
                ) / 100;
              if (credit > 0) {
                pieces.push(
                  "+" +
                    formatMoney(credit, payload.currencyCode) +
                    " " +
                    t("cart.cashbackSuffix", "store credit"),
                );
              }
            }
            if (line) {
              if (pieces.length) {
                line.textContent = pieces.join(" · ");
              } else {
                line.remove();
              }
            }
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
    renderDiag: renderDiag,
    t: t,
    tSubstitute: tSubstitute,
    setBundle: setBundle,
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
      var platformName = t("social.platform." + p.id, "");
      if (!platformName) {
        platformName =
          {
            instagram: "Instagram",
            tiktok: "TikTok",
            x: "X",
            facebook: "Facebook",
            youtube: "YouTube",
          }[p.id] || p.id;
      }
      line.innerHTML =
        "<strong>" +
        platformName +
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
              var awardedPts = String(res.points || p.points);
              btn.textContent = tSubstitute(
                t("social.awardedButton", "Awarded +{points}"),
                { points: awardedPts },
              );
              btn.classList.add("royal-btn--ghost");
              if (statusEl)
                setStatus(
                  statusEl,
                  "success",
                  tSubstitute(
                    t("social.awardedStatus", "Awarded {points} points."),
                    { points: awardedPts },
                  ),
                );
            } else if (res && res.outcome === "duplicate") {
              btn.textContent = t("social.alreadyClaimed", "Already claimed");
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
