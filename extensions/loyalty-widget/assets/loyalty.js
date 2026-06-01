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

  // Each extension block (launcher, loyalty-page, customer-account) ships
  // its own <script src="loyalty.js" defer> tag. The browser sometimes
  // executes the file multiple times on the same page, creating multiple
  // independent IIFE scopes. Each scope had its own _balanceInFlight, so
  // coalescing didn't work — fix is to dedupe at the IIFE level so only
  // ONE copy of every helper exists per page load.
  if (window.__royalLoyaltyIIFE) {
    try { console.log("[RoyalLoyalty] loyalty.js already initialized — skipping"); } catch (e) {}
    return;
  }
  window.__royalLoyaltyIIFE = true;

  // Loud breadcrumb: if you don't see this in the console, loyalty.js never
  // executed on this page (extension not deployed, theme app embed off, or
  // CDN serving an older bundle).
  try { console.log("[RoyalLoyalty] loyalty.js loaded"); } catch (e) {}

  // Always-on visible diagnostic. Survives even if the launcher block isn't
  // on the page or if /loyalty/balance never resolves — so we can tell the
  // difference between "block missing" and "block silent".
  //
  // CRITICAL: merge into any existing window.__royalDiag instead of replacing
  // it. The launcher.liquid inline script writes to window.__royalDiag before
  // loyalty.js loads (because the launcher script is inline, loyalty.js is
  // deferred). A naive overwrite here erases the launcher's stage markers
  // and we'd never see them in the panel.
  var preExisting =
    (typeof window !== "undefined" && window.__royalDiag) || {};
  var __royalDiag = Object.assign(
    {
      startedAt: Date.now(),
      loyaltyJsLoaded: true,
      royalLoyaltyDefined: false,
      payloadStatus: "(waiting…)",
      payloadBranding: null,
      lastFetchUrl: null,
      lastFetchStatus: null,
      errors: [],
    },
    preExisting,
  );
  // Make sure errors is still an array even if preExisting had a different
  // type for it.
  if (!Array.isArray(__royalDiag.errors)) __royalDiag.errors = [];
  try {
    window.addEventListener("error", function (e) {
      try {
        var m = (e && e.message) || "error";
        var src = e && e.filename ? " @ " + e.filename + ":" + e.lineno : "";
        __royalDiag.errors.push(m + src);
      } catch (_) {}
    });
    window.addEventListener("unhandledrejection", function (e) {
      try {
        __royalDiag.errors.push("unhandled: " + ((e && e.reason && e.reason.message) || e.reason || "rejection"));
      } catch (_) {}
    });
  } catch (e) {}

  try {
    var earlyBox = document.createElement("div");
    earlyBox.id = "royal-debug-overlay";
    earlyBox.style.cssText =
      "position:fixed;top:8px;left:8px;z-index:2147483647;" +
      "background:#111;color:#fff;font:12px/1.4 ui-monospace,monospace;" +
      "padding:6px 8px;border-radius:8px;max-width:380px;" +
      "box-shadow:0 6px 24px rgba(0,0,0,.35);";
    // Header row stays visible even when collapsed — toggle on the left,
    // Copy on the right so the merchant can grab the diagnostic dump
    // without expanding the overlay.
    var header = document.createElement("div");
    header.style.cssText =
      "display:flex;align-items:center;justify-content:space-between;gap:8px;";
    var earlyToggle = document.createElement("button");
    earlyToggle.type = "button";
    earlyToggle.style.cssText =
      "background:transparent;color:#fff;border:none;font:inherit;" +
      "cursor:pointer;padding:2px 4px;display:inline-flex;align-items:center;gap:6px;";
    var earlyCopy = document.createElement("button");
    earlyCopy.type = "button";
    earlyCopy.textContent = "Copy";
    earlyCopy.style.cssText =
      "background:#fff;color:#111;border:none;" +
      "border-radius:4px;padding:3px 10px;font:inherit;cursor:pointer;";
    earlyCopy.addEventListener("click", function () {
      var txt = (document.getElementById("royal-debug-overlay__text") || {}).textContent || "";
      var done = function () {
        var orig = earlyCopy.textContent;
        earlyCopy.textContent = "Copied!";
        setTimeout(function () { earlyCopy.textContent = orig; }, 1200);
      };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(txt).then(done, function () { fallbackCopy(txt); done(); });
        } else { fallbackCopy(txt); done(); }
      } catch (e) { fallbackCopy(txt); done(); }
    });
    function fallbackCopy(t) {
      try {
        var ta = document.createElement("textarea");
        ta.value = t; document.body.appendChild(ta); ta.select();
        document.execCommand("copy"); document.body.removeChild(ta);
      } catch (e) { /* give up */ }
    }
    var earlyText = document.createElement("pre");
    earlyText.id = "royal-debug-overlay__text";
    earlyText.style.cssText =
      "margin:8px 0 0;white-space:pre-wrap;font:inherit;color:inherit;";
    // Collapsed by default so the overlay doesn't dominate the storefront
    // during normal QA. Click the chevron (or the title) to expand.
    var collapsed = true;
    function applyCollapsed() {
      earlyText.style.display = collapsed ? "none" : "block";
      earlyToggle.textContent = (collapsed ? "▸ " : "▾ ") + "Royal diag";
    }
    earlyToggle.addEventListener("click", function () {
      collapsed = !collapsed;
      applyCollapsed();
    });
    applyCollapsed();
    header.appendChild(earlyToggle);
    header.appendChild(earlyCopy);
    earlyBox.appendChild(header);
    earlyBox.appendChild(earlyText);
    var mount = function () {
      if (document.body) document.body.appendChild(earlyBox);
      else setTimeout(mount, 50);
    };
    mount();

    // ---- Deep network probe ----------------------------------------------
    // Fires once per page load against the same URL the launcher hangs on,
    // so the diag box can answer "is it the server, the browser, or the
    // fetch options?" without making the user open DevTools.
    //
    // We run TWO parallel probes against the SAME URL:
    //   probe A: credentials: "same-origin" (what the launcher does)
    //   probe B: credentials: "omit"        (rules out a cookie / CORS bug)
    // Plus we capture Resource-Timing entries for the launcher's own fetch
    // when it eventually completes, so we can see DNS / TCP / TTFB / total.
    var __royalProbes = {
      started: false,
      a: { state: "not started" },
      b: { state: "not started" },
    };
    window.__royalProbes = __royalProbes;
    function runDeepProbe() {
      if (__royalProbes.started) return;
      __royalProbes.started = true;
      var cfgEl = document.getElementById("royal-launcher-root");
      var cfg = {};
      try {
        cfg = JSON.parse(cfgEl ? cfgEl.getAttribute("data-royal-config") || "{}" : "{}");
      } catch (e) {}
      var proxy = (cfg.proxy || "").replace(/\/$/, "");
      if (!proxy) {
        __royalProbes.a.state = "skip (no cfg.proxy)";
        __royalProbes.b.state = "skip (no cfg.proxy)";
        return;
      }
      var customerQs =
        cfg.customerId != null
          ? "?logged_in_customer_id=" + encodeURIComponent(cfg.customerId)
          : "";
      var url = proxy + "/loyalty/balance" + customerQs;
      __royalProbes.url = url;
      function probe(label, opts) {
        var slot = __royalProbes[label];
        slot.state = "fetching…";
        slot.startedAt = Date.now();
        var ac =
          typeof AbortController !== "undefined" ? new AbortController() : null;
        if (ac) opts.signal = ac.signal;
        var killer = setTimeout(function () {
          if (slot.state !== "fetching…") return;
          try { if (ac) ac.abort(); } catch (e) {}
          slot.state = "ABORTED after 15s";
          slot.elapsedMs = Date.now() - slot.startedAt;
        }, 15000);
        fetch(url, opts)
          .then(function (r) {
            clearTimeout(killer);
            slot.status = r.status;
            slot.contentType = r.headers.get("content-type") || "";
            return r.text().then(function (body) {
              slot.elapsedMs = Date.now() - slot.startedAt;
              slot.bodyLen = body.length;
              slot.bodySnippet = body.slice(0, 120).replace(/\s+/g, " ");
              slot.state = "ok";
            });
          })
          .catch(function (err) {
            clearTimeout(killer);
            if (slot.state !== "ABORTED after 15s") {
              slot.elapsedMs = Date.now() - slot.startedAt;
              slot.state = "FAILED — " + (err && err.message ? err.message : "?");
            }
          });
      }
      probe("a", {
        method: "GET",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      probe("b", {
        method: "GET",
        credentials: "omit",
        headers: { Accept: "application/json" },
      });

      // probe C: use the launcher's actual api() helper (post-fix). If A
      // works but C hangs, the issue is *inside* api() — closure, header
      // merge, options mutation. If both work, the launcher's loadBalance
      // is doing something different from a direct api() call.
      var slotC = (__royalProbes.c = { state: "fetching…", startedAt: Date.now() });
      try {
        api(cfg.proxy, "/loyalty/balance" + customerQs, { method: "GET" })
          .then(function (d) {
            slotC.elapsedMs = Date.now() - slotC.startedAt;
            slotC.bodyLen = JSON.stringify(d).length;
            slotC.state = "ok";
          })
          .catch(function (err) {
            slotC.elapsedMs = Date.now() - slotC.startedAt;
            slotC.state =
              "FAILED — " +
              (err && err.message ? err.message : "?") +
              (err && err.royalDiag
                ? " (status=" + (err.royalDiag.status || "?") + ")"
                : "");
          });
        // Also capture what api() actually sets on the options object by
        // patching window.fetch temporarily and recording the first call
        // matching our URL. Restore immediately on the same tick.
        if (!window.__royalFetchSpy) {
          var nativeFetch = window.fetch;
          window.__royalFetchSpy = [];
          window.fetch = function () {
            try {
              var u = arguments[0];
              var o = arguments[1] || {};
              if (typeof u === "string" && u.indexOf("/loyalty/balance") >= 0) {
                var hdrs = {};
                try {
                  if (o.headers && o.headers.constructor === Object) {
                    hdrs = o.headers;
                  } else if (o.headers && typeof o.headers.forEach === "function") {
                    o.headers.forEach(function (v, k) { hdrs[k] = v; });
                  }
                } catch (e) {}
                window.__royalFetchSpy.push({
                  at: Date.now(),
                  method: o.method || "GET",
                  credentials: o.credentials || "(default)",
                  hasBody: o.body != null,
                  hasSignal: !!o.signal,
                  headers: hdrs,
                  cache: o.cache || "(default)",
                  mode: o.mode || "(default)",
                });
              }
            } catch (e) {}
            return nativeFetch.apply(this, arguments);
          };
        }
      } catch (e) {
        slotC.state = "EXC — " + (e && e.message ? e.message : "?");
      }

      // setInterval sentinel — fires every 1s, records each tick's
      // timestamp. If ticks happen at ~10s intervals instead of ~1s, this
      // tab is heavily throttled and that's why the launcher's watchdog
      // never aborts.
      if (!window.__royalSentinelTicks) {
        window.__royalSentinelTicks = [];
        var sentStart = Date.now();
        var sent = setInterval(function () {
          window.__royalSentinelTicks.push(Date.now() - sentStart);
          if (window.__royalSentinelTicks.length >= 20) clearInterval(sent);
        }, 1000);
      }
    }

    var refresh = function () {
      try {
        var elapsed = ((Date.now() - __royalDiag.startedAt) / 1000).toFixed(1);
        var root = document.getElementById("royal-launcher-root");
        __royalDiag.royalLoyaltyDefined = !!window.RoyalLoyalty;
        var cs = root ? getComputedStyle(root) : null;
        var pill = document.getElementById("royal-launcher-btn");
        var pillCs = pill ? getComputedStyle(pill) : null;
        var ssr = null;
        if (root) {
          try { ssr = JSON.parse(root.getAttribute("data-royal-ssr") || "null"); } catch (e) {}
        }
        var fetchElapsed = __royalDiag.payloadStartedAt
          ? ((Date.now() - __royalDiag.payloadStartedAt) / 1000).toFixed(1)
          : null;
        var balanceLine =
          __royalDiag.payloadStatus +
          (fetchElapsed != null && __royalDiag.payloadStatus === "fetching…"
            ? "  (" + fetchElapsed + "s elapsed)"
            : "");
        var lines = [
          "Royal Loyalty diagnostics  (t+" + elapsed + "s)",
          "loyalty.js loaded:        " + (__royalDiag.loyaltyJsLoaded ? "yes" : "NO"),
          "window.RoyalLoyalty:      " + (__royalDiag.royalLoyaltyDefined ? "yes" : "NO"),
          "launcher block in DOM:    " + (root ? "yes" : "NO"),
          "launcher load() called:   " +
            (__royalDiag.payloadStartedAt ? "yes" : "NO (init never reached load())"),
          "launcher stage:           " +
            (__royalDiag.launcherStage ||
              window.__royalLauncherStage ||
              "(none)"),
          "init() calls fired:       " +
            (window.__royalInitCalls || 0),
          "balance watchdog ticks:   " +
            (window.__royalBalanceTicks != null
              ? window.__royalBalanceTicks
              : "(not started)"),
          "inline-script canary:     " +
            (typeof window.__royalCanary === "number"
              ? "yes (n=" + window.__royalCanary + ")"
              : "NO (inline scripts blocked — CSP?)"),
          "script tags in body:      " +
            document.querySelectorAll("script").length,
          "/loyalty/balance:         " + balanceLine,
        ];
        if (ssr) {
          lines.push("--- Liquid SSR (first paint) ---");
          lines.push("ssr.metafieldPrimary:     " + JSON.stringify(ssr.metafieldPrimary));
          lines.push("ssr.metafieldSecondary:   " + JSON.stringify(ssr.metafieldSecondary));
          lines.push("ssr.metafieldPosition:    " + JSON.stringify(ssr.metafieldPosition));
          lines.push("ssr.metafieldLauncherText:" + JSON.stringify(ssr.metafieldLauncherText));
          lines.push("ssr.metafieldPanelTitle:  " + JSON.stringify(ssr.metafieldPanelTitle));
          lines.push("ssr.metafieldPanelSub:    " + JSON.stringify(ssr.metafieldPanelSubtitle));
          lines.push("ssr.renderedPrimary:      " + JSON.stringify(ssr.renderedPrimary));
          lines.push("ssr.renderedSecondary:    " + JSON.stringify(ssr.renderedSecondary));
          lines.push("ssr.renderedPosition:     " + JSON.stringify(ssr.renderedPosition));
          lines.push("ssr.renderedLauncherText: " + JSON.stringify(ssr.renderedLauncherText));
          lines.push("ssr.renderedPanelTitle:   " + JSON.stringify(ssr.renderedPanelTitle));
          lines.push("ssr.renderedPanelSub:     " + JSON.stringify(ssr.renderedPanelSubtitle));
          lines.push("--- runtime ---");
        }
        if (__royalDiag.lastFetchUrl) {
          lines.push("  last url:               " + __royalDiag.lastFetchUrl);
        }
        if (__royalDiag.lastFetchStatus != null) {
          lines.push("  last http status:       " + __royalDiag.lastFetchStatus);
        }
        if (__royalDiag.payloadBranding) {
          var b = __royalDiag.payloadBranding;
          lines.push("payload.primaryColor:     " + (b.primaryColor || "(none)"));
          lines.push("payload.secondaryColor:   " + (b.secondaryColor || "(none)"));
        }
        if (__royalDiag.payloadBalance != null) {
          lines.push("payload.balance:          " + __royalDiag.payloadBalance + " pts");
        }
        if (__royalDiag.payloadStoreCredit) {
          var sc = __royalDiag.payloadStoreCredit;
          lines.push(
            "payload.storeCredit:      " +
              (sc.balance != null ? sc.balance : "(missing)") +
              " " + (sc.currency || "")
          );
        }
        if (__royalDiag.payloadCashback) {
          var cb = __royalDiag.payloadCashback;
          lines.push(
            "payload.cashback:         " +
              (cb.enabled ? "enabled " + (cb.percent || 0) + "%" : "disabled")
          );
        }
        if (cs) {
          lines.push("css --royal-primary:      " + cs.getPropertyValue("--royal-primary").trim());
          lines.push("css --royal-secondary:    " + cs.getPropertyValue("--royal-secondary").trim());
        }
        // --- Referral claim diagnostics ---
        lines.push("--- referral claim ---");
        try {
          var cfgEl = document.getElementById("royal-launcher-root");
          var cfgJson = cfgEl ? JSON.parse(cfgEl.getAttribute("data-royal-config") || "{}") : {};
          lines.push(
            "cfg.loggedIn (SSR):       " +
              (cfgJson.loggedIn === true ? "true" : "false"),
          );
          lines.push(
            "cfg.customerId (SSR):     " +
              (cfgJson.customerId == null ? "(null)" : JSON.stringify(cfgJson.customerId)),
          );
        } catch (e) {
          lines.push("cfg (SSR):                (parse failed)");
        }
        try {
          var cookieMatch = document.cookie.match(/(?:^|; )royal_ref=([^;]+)/);
          var cookieVal = cookieMatch ? decodeURIComponent(cookieMatch[1]) : "(none)";
          lines.push("royal_ref cookie:         " + cookieVal);
        } catch (e) {
          lines.push("royal_ref cookie:         (read failed)");
        }
        if (__royalDiag.claimCode) {
          lines.push("claim code:               " + __royalDiag.claimCode);
        }
        if (__royalDiag.claimStatus) {
          lines.push("claim status:             " + __royalDiag.claimStatus);
        } else {
          lines.push("claim status:             (not attempted yet)");
        }
        if (__royalDiag.claimResult) {
          try {
            lines.push(
              "claim result:             " +
                JSON.stringify(__royalDiag.claimResult),
            );
          } catch (e) {
            lines.push("claim result:             (unserialisable)");
          }
        }
        if (__royalDiag.claimSteps && __royalDiag.claimSteps.length) {
          lines.push("claim steps:");
          var startedAt = __royalDiag.claimSteps[0].at;
          for (var ci = 0; ci < __royalDiag.claimSteps.length; ci++) {
            var step = __royalDiag.claimSteps[ci];
            var t = ((step.at - startedAt) / 1000).toFixed(2);
            var extraStr = "";
            if (step.extra) {
              try {
                extraStr =
                  " " +
                  (typeof step.extra === "string"
                    ? step.extra
                    : JSON.stringify(step.extra));
              } catch (e) {
                extraStr = " (extra unserialisable)";
              }
            }
            lines.push("  +" + t + "s  " + step.msg + extraStr);
          }
        }
        if (pillCs) {
          lines.push("pill bg (computed):       " + pillCs.backgroundColor);
          lines.push("pill color (computed):    " + pillCs.color);
        }
        if (__royalDiag.errors.length) {
          lines.push("errors (" + __royalDiag.errors.length + "):");
          for (var i = 0; i < Math.min(__royalDiag.errors.length, 5); i++) {
            lines.push("  - " + __royalDiag.errors[i]);
          }
        }

        // ---- Deep network probe (fires once, polled into diag) ----
        runDeepProbe();
        lines.push("--- deep probe ---");
        if (__royalProbes.url) {
          lines.push("probe url:                " + __royalProbes.url);
        }
        function fmtProbe(label, slot) {
          var pieces = [slot.state];
          if (slot.elapsedMs != null) pieces.push(slot.elapsedMs + "ms");
          if (slot.status != null) pieces.push("status=" + slot.status);
          if (slot.contentType) pieces.push("ct=" + slot.contentType);
          if (slot.bodyLen != null) pieces.push("bodyLen=" + slot.bodyLen);
          lines.push("probe " + label + " (" + (label === "a" ? "same-origin" : "omit") + "):  " + pieces.join("  "));
          if (slot.bodySnippet) {
            lines.push("  body[:120]: " + slot.bodySnippet);
          }
        }
        fmtProbe("a", __royalProbes.a);
        fmtProbe("b", __royalProbes.b);
        if (__royalProbes.c) {
          var c = __royalProbes.c;
          var elapsed = c.elapsedMs != null ? c.elapsedMs + "ms" : "in flight";
          var extra = c.bodyLen != null ? " bodyLen=" + c.bodyLen : "";
          lines.push("probe c (via api() helper):  " + c.state + "  " + elapsed + extra);
        }

        // loadBalance call log — every invocation with timing + stack
        if (window.__royalLoadBalanceCalls && window.__royalLoadBalanceCalls.length) {
          lines.push("loadBalance() calls:        " + window.__royalLoadBalanceCalls.length);
          for (var lbi = 0; lbi < Math.min(window.__royalLoadBalanceCalls.length, 4); lbi++) {
            var call = window.__royalLoadBalanceCalls[lbi];
            lines.push("  #" + (lbi + 1) + " at +" + (call.sinceFirstMs / 1000).toFixed(2) + "s  [" + (call.path || "?") + "]");
            for (var fi = 0; fi < Math.min(call.stack.length, 3); fi++) {
              lines.push("     ↳ " + call.stack[fi]);
            }
          }
        }

        // Fetch spy — what api() actually sent for each /loyalty/balance call
        if (window.__royalFetchSpy && window.__royalFetchSpy.length) {
          lines.push("fetch spy (first " + Math.min(window.__royalFetchSpy.length, 4) + " /loyalty/balance calls):");
          for (var si = 0; si < Math.min(window.__royalFetchSpy.length, 4); si++) {
            var sp = window.__royalFetchSpy[si];
            var hdrStr = "";
            try { hdrStr = JSON.stringify(sp.headers); } catch (e) { hdrStr = "(unserialisable)"; }
            lines.push(
              "  #" + (si + 1) + " " + sp.method +
              " creds=" + sp.credentials +
              " hasBody=" + sp.hasBody +
              " signal=" + sp.hasSignal +
              " mode=" + sp.mode +
              " cache=" + sp.cache,
            );
            lines.push("     headers=" + hdrStr);
          }
        } else {
          lines.push("fetch spy:                  (no /loyalty/balance calls captured yet)");
        }

        // setInterval throttle sentinel
        if (window.__royalSentinelTicks) {
          var ticks = window.__royalSentinelTicks;
          if (ticks.length === 0) {
            lines.push("setInterval sentinel:     (no ticks yet)");
          } else {
            var summary = ticks.slice(0, 10).map(function (t) {
              return (t / 1000).toFixed(1) + "s";
            }).join(", ");
            var avgGap = ticks.length > 1
              ? ((ticks[ticks.length - 1] - ticks[0]) / (ticks.length - 1) / 1000).toFixed(2)
              : "n/a";
            lines.push(
              "setInterval sentinel:     " + ticks.length + " ticks, avg gap=" + avgGap + "s  [" + summary + (ticks.length > 10 ? ", …" : "") + "]"
            );
          }
        }

        // Resource Timing for the launcher's OWN balance fetch — tells us
        // DNS, TCP, TLS, request-sent, TTFB, response-end. If TTFB is huge,
        // the server is the bottleneck; if connectEnd is huge, network.
        try {
          if (__royalDiag.lastFetchUrl && performance && performance.getEntriesByName) {
            var entries = performance.getEntriesByName(__royalDiag.lastFetchUrl, "resource");
            if (entries && entries.length) {
              var lastE = entries[entries.length - 1];
              lines.push(
                "resTiming (launcher fetch):"
              );
              lines.push("  startTime:      " + lastE.startTime.toFixed(1) + "ms");
              lines.push("  duration:       " + lastE.duration.toFixed(1) + "ms");
              lines.push("  dns:            " + (lastE.domainLookupEnd - lastE.domainLookupStart).toFixed(1) + "ms");
              lines.push("  tcp:            " + (lastE.connectEnd - lastE.connectStart).toFixed(1) + "ms");
              lines.push("  tls:            " + (lastE.secureConnectionStart > 0 ? (lastE.connectEnd - lastE.secureConnectionStart).toFixed(1) : "n/a") + "ms");
              lines.push("  requestStart:   " + lastE.requestStart.toFixed(1) + "ms");
              lines.push("  responseStart:  " + lastE.responseStart.toFixed(1) + "ms (TTFB from start)");
              lines.push("  responseEnd:    " + lastE.responseEnd.toFixed(1) + "ms");
              lines.push("  transferSize:   " + (lastE.transferSize || 0) + "  encoded:" + (lastE.encodedBodySize || 0) + "  decoded:" + (lastE.decodedBodySize || 0));
              lines.push("  initiatorType:  " + lastE.initiatorType);
              lines.push("  nextHopProtocol:" + (lastE.nextHopProtocol || "(unknown)"));
            } else {
              lines.push("resTiming (launcher fetch): (no entry — request hasn't completed)");
            }
          }
        } catch (e) {
          lines.push("resTiming (launcher fetch): (read failed " + e.message + ")");
        }

        // Service workers controlling THIS page can intercept fetch.
        try {
          if (navigator.serviceWorker) {
            var ctrl = navigator.serviceWorker.controller;
            lines.push(
              "serviceWorker.controller: " +
                (ctrl
                  ? "yes — scriptURL=" + ctrl.scriptURL + " state=" + ctrl.state
                  : "none")
            );
            // List all registrations (async — best-effort, populated on next refresh).
            if (!window.__royalSWRegs && navigator.serviceWorker.getRegistrations) {
              window.__royalSWRegs = "loading…";
              navigator.serviceWorker.getRegistrations().then(function (regs) {
                window.__royalSWRegs = regs.map(function (r) {
                  return (r.active ? r.active.scriptURL : "(no active)") + " scope=" + r.scope;
                });
              }).catch(function (e) {
                window.__royalSWRegs = "FAILED " + e.message;
              });
            }
            if (window.__royalSWRegs) {
              lines.push(
                "serviceWorker.registrations: " +
                  (Array.isArray(window.__royalSWRegs)
                    ? (window.__royalSWRegs.length === 0
                        ? "(none)"
                        : "\n  - " + window.__royalSWRegs.join("\n  - "))
                    : window.__royalSWRegs)
              );
            }
          } else {
            lines.push("serviceWorker:            (not supported)");
          }
        } catch (e) {
          lines.push("serviceWorker:            (read failed " + e.message + ")");
        }

        // Network info.
        try {
          var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
          if (conn) {
            lines.push(
              "navigator.connection:     type=" + (conn.effectiveType || "?") +
                " rtt=" + (conn.rtt != null ? conn.rtt + "ms" : "?") +
                " downlink=" + (conn.downlink != null ? conn.downlink + "Mbps" : "?") +
                " saveData=" + !!conn.saveData
            );
          }
        } catch (e) {}

        // Userland fetch identity — has something monkey-patched fetch?
        try {
          var fStr = String(window.fetch);
          lines.push("fetch impl:               " + (fStr.indexOf("[native code]") >= 0 ? "native" : "PATCHED — " + fStr.slice(0, 80)));
        } catch (e) {}

        earlyText.textContent = lines.join("\n");
      } catch (e) { /* non-fatal */ }
    };
    refresh();
    var diagTimer = setInterval(refresh, 500);
    // Stop polling after 30s to save CPU; the overlay stays visible.
    setTimeout(function () { clearInterval(diagTimer); }, 30000);
    // Expose for the launcher block's inline init + loadBalance to update.
    window.__royalDiag = __royalDiag;
  } catch (e) { /* non-fatal */ }

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
    // Only attach Content-Type when there's actually a body. Sending
    // Content-Type on a bodyless GET turns the request into a CORS
    // non-simple request that requires a preflight OPTIONS — and the
    // Shopify App Proxy doesn't reliably respond to those, so the fetch
    // hangs forever waiting for a preflight that never comes back. Accept
    // is fine to always send (it's in the CORS-safelisted list).
    var hasBody = o.body != null;
    o.headers = Object.assign(
      hasBody
        ? { "Content-Type": "application/json", Accept: "application/json" }
        : { Accept: "application/json" },
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

  /* Read the royal_ref cookie value (or null). */
  function readRefCookie() {
    try {
      var m = document.cookie.match(/(?:^|; )royal_ref=([^;]+)/);
      return m ? decodeURIComponent(m[1]) : null;
    } catch (e) {
      return null;
    }
  }

  /* Clear the royal_ref cookie (called after a successful claim). */
  function clearRefCookie() {
    try {
      document.cookie =
        "royal_ref=;path=/;max-age=0;SameSite=Lax";
    } catch (e) {
      /* non-fatal */
    }
  }

  /* Once-per-session guard so we don't hammer the proxy. */
  var _claimAttempted = false;

  /* If a royal_ref cookie is present AND the current visitor is signed in,
   * post the code to the claim endpoint. Server records the attribution,
   * awards both sides points, and we drop the cookie on success. */
  function maybeClaimReferral(cfg, d) {
    function log(msg, extra) {
      try {
        console.log("[RoyalLoyalty] claim-referral: " + msg, extra || "");
      } catch (e) {}
      if (window.__royalDiag) {
        var arr = window.__royalDiag.claimSteps || [];
        arr.push({ at: Date.now(), msg: msg, extra: extra || null });
        window.__royalDiag.claimSteps = arr;
      }
    }

    if (_claimAttempted) { log("skip: already attempted this page load"); return; }
    var code = readRefCookie();
    if (!code) { log("skip: no royal_ref cookie"); return; }
    // Note: we deliberately do NOT gate on cfg.loggedIn here. Shopify's
    // {% if customer %} can be false on the first page after signup
    // (notably with New Customer Accounts), while the storefront App Proxy
    // is still able to read logged_in_customer_id from the signed query.
    // Let the server be the source of truth — if no customer is attached
    // it returns status="no_customer" and we leave the cookie for retry.
    log("cfg.loggedIn snapshot = " + (cfg.loggedIn ? "true" : "false"));
    _claimAttempted = true;

    if (window.__royalDiag) {
      window.__royalDiag.claimStatus = "posting…";
      window.__royalDiag.claimCode = code;
    }
    log("posting to /loyalty/claim-referral", { code: code });

    api(cfg.proxy, "/loyalty/claim-referral", {
      method: "POST",
      body: JSON.stringify({ code: code }),
    })
      .then(function (res) {
        log("server responded", res);
        if (window.__royalDiag) {
          window.__royalDiag.claimStatus =
            "ok=" + (res && res.ok) + " status=" + (res && res.status);
          window.__royalDiag.claimResult = res;
        }
        var terminal =
          res &&
          (res.ok === true ||
            res.status === "already_claimed" ||
            res.status === "existing_customer" ||
            res.status === "self_referral");
        if (terminal) {
          log("clearing cookie + removing banner");
          clearRefCookie();
          var ex = document.getElementById("royal-refer-banner");
          if (ex) ex.parentNode.removeChild(ex);
        } else {
          log("non-terminal status — keeping cookie for retry");
        }
      })
      .catch(function (err) {
        var diag = (err && err.royalDiag) || { note: String(err) };
        log("network/fetch failed", diag);
        if (window.__royalDiag) {
          window.__royalDiag.claimStatus = "FAILED — " + (diag.status || diag.note);
          window.__royalDiag.claimResult = diag;
        }
      });
  }

  /* Sticky welcome banner shown at the top of the storefront whenever a
   * royal_ref cookie is set AND the visitor is NOT signed in. Tells them
   * how much store credit they'll get and links to /account/register. The
   * banner is dismissible (session-storage-flagged so it doesn't re-appear
   * on subsequent page loads in the same session). */
  function injectReferralBanner(cfg, d) {
    if (cfg.loggedIn) return;
    if (!readRefCookie()) return;
    if (document.getElementById("royal-refer-banner")) return;
    try {
      if (sessionStorage.getItem("royal_refer_banner_dismissed") === "1")
        return;
    } catch (e) {
      /* sessionStorage may be unavailable in private modes */
    }
    var rr = (d && d.referralRewards) || { referee: 0 };
    if (!(rr.referee > 0)) return;
    var title = t("refer.bannerTitle", "You've been referred");
    var desc = tSubstitute(
      t(
        "refer.bannerDesc",
        "Sign up to claim {points} points",
      ),
      { points: rr.referee },
    );
    var cta = t("refer.bannerCta", "Create account");
    var dismiss = t("refer.bannerDismiss", "Dismiss");

    // The banner lives at the top of <body> so var(--royal-primary) /
    // var(--royal-secondary) don't cascade from the widget root. Set them
    // inline from the branding payload so the banner matches the merchant's
    // chosen colors.
    var br = (d && d.branding) || {};
    var primary = br.primaryColor || "#2C2A29";
    var secondary = br.secondaryColor || "#FFFFFF";

    var banner = document.createElement("div");
    banner.id = "royal-refer-banner";
    banner.className = "royal-refer-banner";
    banner.setAttribute("role", "region");
    banner.setAttribute("aria-label", title);
    banner.setAttribute(
      "style",
      "--royal-primary:" + primary + ";--royal-secondary:" + secondary + ";",
    );
    // Gift-box icon (Material card_giftcard). currentColor inherits the
    // banner's text color so it tracks the merchant's secondary color
    // automatically.
    var iconSvg =
      '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
      '<path d="M20 6h-2.18A2.99 2.99 0 0 0 15 4c-.83 0-1.58.34-2.12.88L12 5.76l-.88-.88A3.001 3.001 0 0 0 9 4a2.99 2.99 0 0 0-2.82 2H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2zM15 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2zM9 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm11 13H4v-2h16v2zm0-5h-7v-2h2v-2h-2V8h7v6z"/>' +
      "</svg>";
    // Close X (geometric, not a glyph) — keeps weight consistent with the
    // gift icon and renders identically on every OS.
    var closeSvg =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true">' +
      '<path d="M6 6 L18 18 M18 6 L6 18"/>' +
      "</svg>";
    banner.innerHTML =
      '<div class="royal-refer-banner__inner">' +
      '<div class="royal-refer-banner__icon">' + iconSvg + "</div>" +
      '<div class="royal-refer-banner__text">' +
      '<div class="royal-refer-banner__title">' +
      escapeAttr(title) +
      "</div>" +
      '<div class="royal-refer-banner__desc">' +
      escapeAttr(desc) +
      "</div>" +
      "</div>" +
      '<a class="royal-refer-banner__cta" href="/account/register">' +
      escapeAttr(cta) +
      "</a>" +
      '<button type="button" class="royal-refer-banner__close" aria-label="' +
      escapeAttr(dismiss) +
      '">' + closeSvg + "</button>" +
      "</div>";
    document.body.appendChild(banner);
    var closeBtn = banner.querySelector(".royal-refer-banner__close");
    if (closeBtn) {
      closeBtn.addEventListener("click", function () {
        banner.parentNode && banner.parentNode.removeChild(banner);
        try {
          sessionStorage.setItem("royal_refer_banner_dismissed", "1");
        } catch (e) {
          /* non-fatal */
        }
      });
    }
  }

  function escapeAttr(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* Apply branding (colors + copy) from the /loyalty/balance response onto a
   * widget's root element. Idempotent — safe to call on every reload.
   *
   * The launcher pill is server-rendered with the colors from shop metafields
   * (see launcher.liquid), so this is only re-applying for live drift — eg.
   * the merchant just saved a new color in another tab and the storefront
   * payload has the fresh value before the metafield write has propagated. */
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
      renderDebugOverlay(branding, root);
    } catch (e) {
      /* non-fatal */
    }
  }

  /* Floating overlay shown when the storefront URL has ?royal_debug=1. Surfaces
   * the resolved branding payload + the CSS vars actually applied, so we can
   * diagnose "admin shows orange, storefront stays default" without DevTools. */
  function renderDebugOverlay(branding, root) {
    var textEl = document.getElementById("royal-debug-overlay__text");
    if (!textEl) return; // early overlay didn't mount — nothing to update
    var cs = root ? getComputedStyle(root) : null;
    var pillCs = (function () {
      var pill = document.getElementById("royal-launcher-btn");
      return pill ? getComputedStyle(pill) : null;
    })();
    textEl.textContent =
      "Royal Loyalty diagnostics\n" +
      "payload.primaryColor:   " + (branding.primaryColor || "(none)") + "\n" +
      "payload.secondaryColor: " + (branding.secondaryColor || "(none)") + "\n" +
      "css --royal-primary:    " + (cs ? cs.getPropertyValue("--royal-primary").trim() : "?") + "\n" +
      "css --royal-secondary:  " + (cs ? cs.getPropertyValue("--royal-secondary").trim() : "?") + "\n" +
      "pill bg (computed):     " + (pillCs ? pillCs.backgroundColor : "?") + "\n" +
      "pill color (computed):  " + (pillCs ? pillCs.color : "?");
  }

  /* Format a currency amount client-side using the shop's ISO 4217 currency
   * code from the loyalty payload. Delegates to Intl.NumberFormat so every
   * currency the browser knows is supported (USD → $5, EUR → €5, JPY → ¥500,
   * NOK → kr 5, INR → ₹5, …) with locale-appropriate separators. */
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
  // Module-level cache so the launcher, loyalty-page block, and
  // customer-account block share ONE /loyalty/balance fetch instead of
  // firing 3 concurrent identical requests. Shopify's App Proxy serializes
  // (or stream-limits) parallel identical requests for the same
  // shop+customer, which is why all 3 stall when fired together while a
  // standalone direct fetch returns in ~1.2s.
  var _balanceInFlight = null;   // Promise resolved with the payload
  var _balanceCached = null;     // Last successful payload
  var _balanceCachedAt = 0;
  var BALANCE_CACHE_MS = 5000;   // Reuse within 5s for any subsequent caller

  function loadBalance(cfg, onData, onError) {
    var startedAt = Date.now();
    // Record every loadBalance invocation with a stack trace so the diag
    // box can show how many times this fired, when, and from where.
    try {
      window.__royalLoadBalanceCalls = window.__royalLoadBalanceCalls || [];
      var stack = "";
      try { stack = new Error().stack || ""; } catch (e) {}
      var frames = stack.split("\n").slice(1, 5).map(function (s) {
        return s.trim().replace(/^at\s+/, "");
      });
      var pathTag = _balanceCached && (Date.now() - _balanceCachedAt < BALANCE_CACHE_MS)
        ? "CACHE_HIT"
        : _balanceInFlight
          ? "SUBSCRIBED"
          : "FETCH";
      window.__royalLoadBalanceCalls.push({
        at: startedAt,
        sinceFirstMs:
          window.__royalLoadBalanceCalls.length > 0
            ? startedAt - window.__royalLoadBalanceCalls[0].at
            : 0,
        stack: frames,
        path: pathTag,
      });
    } catch (e) {}

    // Fresh-enough cached payload? Hand it to the caller without a fetch.
    if (
      _balanceCached &&
      Date.now() - _balanceCachedAt < BALANCE_CACHE_MS &&
      typeof onData === "function"
    ) {
      try { onData(_balanceCached); } catch (e) {}
      return;
    }

    // Fetch already in flight from a sibling block? Subscribe to it.
    if (_balanceInFlight) {
      _balanceInFlight.then(
        function (d) { if (typeof onData === "function") try { onData(d); } catch (e) {} },
        function (err) { if (typeof onError === "function") try { onError(err); } catch (e) {} },
      );
      return;
    }

    if (window.__royalDiag) {
      window.__royalDiag.lastFetchUrl = (cfg.proxy || "").replace(/\/$/, "") + "/loyalty/balance";
      window.__royalDiag.payloadStatus = "fetching…";
      window.__royalDiag.payloadStartedAt = startedAt;
    }
    // Use a setInterval-based watchdog rather than setTimeout — the
    // storefront/New Customer Accounts context has been observed to silently
    // drop one-shot setTimeout callbacks, while setInterval keeps firing.
    // Every 1s we (a) increment a tick counter so the diag can show that
    // the watchdog is alive, and (b) at the 10s mark abort the fetch and
    // flip payloadStatus.
    var ac =
      typeof AbortController !== "undefined" ? new AbortController() : null;
    window.__royalBalanceTicks = 0;
    var watchdog = setInterval(function () {
      window.__royalBalanceTicks =
        (window.__royalBalanceTicks || 0) + 1;
      var status = window.__royalDiag && window.__royalDiag.payloadStatus;
      if (status !== "fetching…") {
        clearInterval(watchdog);
        return;
      }
      if (window.__royalBalanceTicks >= 10) {
        if (ac) {
          try { ac.abort(); } catch (e) {}
        }
        if (window.__royalDiag) {
          window.__royalDiag.payloadStatus =
            "FAILED — TIMEOUT 10s (watchdog)";
        }
        clearInterval(watchdog);
      }
    }, 1000);
    var timeoutId = setTimeout(function () {
      // Same job, redundant with the watchdog above. If setTimeout works
      // we'll see "(setTimeout)"; if it doesn't, the watchdog will.
      if (ac) {
        try { ac.abort(); } catch (e) {}
      }
      if (window.__royalDiag && window.__royalDiag.payloadStatus === "fetching…") {
        window.__royalDiag.payloadStatus =
          "FAILED — TIMEOUT 10s (setTimeout)";
      }
    }, 10000);
    var fetchOpts = { method: "GET" };
    if (ac) fetchOpts.signal = ac.signal;
    // Wrap the api() call in a shared promise so other callers that arrive
    // while we're in flight can subscribe via the _balanceInFlight branch
    // above instead of firing their own /loyalty/balance.
    _balanceInFlight = api(cfg.proxy, "/loyalty/balance", fetchOpts);
    _balanceInFlight
      .then(function (d) {
        _balanceCached = d;
        _balanceCachedAt = Date.now();
      })
      .catch(function () {})
      .then(function () {
        _balanceInFlight = null;
      });
    _balanceInFlight
      .then(function (d) {
        clearTimeout(timeoutId);
        try { clearInterval(watchdog); } catch (e) {}
        if (window.__royalDiag) {
          window.__royalDiag.payloadStatus = "ok (200)";
          window.__royalDiag.lastFetchStatus = 200;
          window.__royalDiag.payloadBranding = d && d.branding ? d.branding : null;
          window.__royalDiag.payloadBalance = d && d.balance != null ? d.balance : null;
          window.__royalDiag.payloadStoreCredit = d
            ? {
                balance: d.storeCreditBalance,
                currency: d.storeCreditCurrency,
              }
            : null;
          window.__royalDiag.payloadCashback = d ? d.cashback : null;
        }
        // Cache the localization bundle so t() can resolve keys without
        // needing the payload passed in everywhere. RTL locales
        // (ar/he/ur) get a global flag the renderers consult before
        // injecting cards.
        if (d && d.localization) setBundle(d.localization);
        // Auto-claim referral if the visitor is signed in and has a
        // royal_ref cookie. Idempotent on the server.
        try { maybeClaimReferral(cfg, d); } catch (e) { /* non-fatal */ }
        // Inject the welcome banner when NOT signed in but cookie present.
        try { injectReferralBanner(cfg, d); } catch (e) { /* non-fatal */ }
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
        clearTimeout(timeoutId);
        try { clearInterval(watchdog); } catch (e) {}
        if (window.__royalDiag) {
          var d = err && err.royalDiag ? err.royalDiag : { note: "unknown" };
          // Preserve the TIMEOUT message if the abort fired before the catch.
          if (window.__royalDiag.payloadStatus !== "FAILED — TIMEOUT 10s") {
            window.__royalDiag.payloadStatus =
              "FAILED — " + (d.status ? "HTTP " + d.status : d.note || "error");
          }
          window.__royalDiag.lastFetchStatus = d.status || null;
        }
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

      // Current store-credit balance — shown only when the customer has
      // any. Separate from the cashback projection appended to the earn
      // line below (that one is what THIS order will earn).
      var scBal = payload.storeCreditBalance || 0;
      var creditBalanceLine = "";
      if (scBal > 0) {
        var scCcy = payload.storeCreditCurrency || payload.currencyCode;
        creditBalanceLine =
          '<div class="royal-injected__sub royal-injected__credit-balance">' +
          t("hub.member.storeCreditBalance", "Store credit balance") +
          ": " +
          formatMoney(scBal, scCcy) +
          "</div>";
      }

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

      // Active codes block intentionally NOT rendered in the cart. The
      // panel still shows the customer their unused codes with Copy/Apply
      // buttons; here we want the cart card to look clean and only ever
      // offer one action — click a reward, it applies silently and is
      // ready at checkout. The launcher panel remains the place to manage
      // codes when the customer wants to.

      var status =
        '<div class="royal-status" id="royal-injected-cart-status" aria-live="polite"></div>';

      card.innerHTML =
        head + creditBalanceLine + earnLine + list + status;
      insertIntoForm(form, card);

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
                // Server response shape: { ok: true, result: { ok, error?, discountCode? } }
                // The outer ok=true is HTTP-level; the actual outcome lives
                // on result. Surfacing the inner error here is what made the
                // cart redeem-button look silent when it really failed
                // upstream (e.g. shop lookup, Shopify discount-code mutation).
                var inner = (res && res.result) || res || {};
                if (inner.ok === false) {
                  setStatus(
                    statusEl,
                    "error",
                    inner.error ||
                      t(
                        "error.couldNotApplyReward",
                        "We couldn't apply that reward. Please try again.",
                      ),
                  );
                  rb.disabled = false;
                  return;
                }
                // Every reward now delivers as Shopify store credit — no
                // discount code to apply, no redirect. Points are already
                // debited and the store-credit account is already credited
                // server-side by the time we get here. Show the success
                // status and let theme drawers refresh if they listen.
                setStatus(
                  statusEl,
                  "success",
                  t(
                    "cart.rewardApplied",
                    "Reward applied — store credit added to your account."
                  )
                );
                try {
                  document.dispatchEvent(new CustomEvent("cart:refresh"));
                } catch (e) { /* old browser, no CustomEvent */ }
                rb.disabled = false;
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

  /* Render the VIP tier grid into the given container. Renders all configured
   * tiers as left→right stair-step cards, highlights the current tier (if
   * any), and appends a progress bar toward the next tier. Hides the entire
   * wrap when no tiers are configured. */
  function renderTierGrid(wrap, list, d) {
    if (!list) return;
    var tiers = (d && d.tiers) || [];
    if (!tiers.length) {
      if (wrap) wrap.hidden = true;
      list.innerHTML = "";
      return;
    }
    if (wrap) wrap.hidden = false;
    // Sort ascending by threshold to defeat any sortOrder drift; the merchant
    // may have re-ordered tiers after creating them.
    var sorted = tiers.slice().sort(function (a, b) {
      return a.threshold - b.threshold;
    });
    var currentId = d.currentTier && d.currentTier.id;
    var balance = d.balance || 0;
    var html = '<div class="royal-tier-cards">';
    for (var i = 0; i < sorted.length; i++) {
      var ti = sorted[i];
      var isCurrent = ti.id === currentId;
      var classes = "royal-tier-card royal-tier-card--" + tierClass(ti.name);
      if (isCurrent) classes += " royal-tier-card--current";
      var threshLabel = ti.thresholdType === "spend"
        ? ti.threshold.toLocaleString() + " spent"
        : ti.threshold.toLocaleString() + " pts";
      html +=
        '<div class="' + classes + '">' +
          '<div class="royal-tier-card__crown" aria-hidden="true">&#9819;</div>' +
          '<div class="royal-tier-card__name">' + escapeHtml(ti.name) + '</div>' +
          '<div class="royal-tier-card__thresh">' + threshLabel + '</div>' +
          '<div class="royal-tier-card__mult">' + ti.earnMultiplier + '&times; earn</div>' +
        '</div>';
    }
    html += '</div>';
    // Progress bar toward the next tier (only when there's somewhere to go).
    if (d.nextTier && d.nextTier.pointsRemaining > 0) {
      // Anchor the bar between the current tier's threshold and the next.
      // For not-yet-enrolled customers (no currentTier) we anchor at 0.
      var fromThreshold = d.currentTier ? d.currentTier.threshold : 0;
      var span = Math.max(1, d.nextTier.threshold - fromThreshold);
      var progressed = Math.min(span, Math.max(0, balance - fromThreshold));
      var pct = Math.min(100, Math.max(0, Math.round((progressed / span) * 100)));
      html +=
        '<div class="royal-tier-progress">' +
          '<div class="royal-tier-progress__label">' +
            d.nextTier.pointsRemaining.toLocaleString() + ' pts to ' + escapeHtml(d.nextTier.name) +
          '</div>' +
          '<div class="royal-tier-progress__bar">' +
            '<span style="width:' + pct + '%"></span>' +
          '</div>' +
        '</div>';
    } else if (d.currentTier && !d.nextTier) {
      html +=
        '<div class="royal-tier-progress royal-tier-progress--max">' +
          '<div class="royal-tier-progress__label">Top tier reached</div>' +
        '</div>';
    }
    list.innerHTML = html;
  }

  // Map a tier name to a CSS class slug. Recognises bronze/silver/gold/platinum
  // and falls back to "custom" for anything else.
  function tierClass(name) {
    var n = String(name || "").toLowerCase();
    if (n === "bronze" || n === "silver" || n === "gold" || n === "platinum") return n;
    return "custom";
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
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
    renderTierGrid: renderTierGrid,
    maybeClaimReferral: maybeClaimReferral,
  };

  // Signal that RoyalLoyalty is ready. Used by the launcher block inline
  // script to escape its setTimeout retry loop, which has been observed
  // to silently stop firing after one callback inside Shopify's New
  // Customer Accounts session context.
  try {
    document.dispatchEvent(new CustomEvent("royal-loyalty-ready"));
  } catch (e) {
    /* CustomEvent unsupported (extremely old browser): the launcher
       will fall back to its retry loop. */
  }

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
