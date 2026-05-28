// This route is the fallback Shopify's embedded-auth library redirects
// merchants to when the iframe session token has died and the App-Bridge
// re-auth dance failed. The default scaffold rendered a "Log in / enter
// shop domain" form, which is terrible UX: merchants don't know their
// myshopify.com slug off the top of their head, and the form often can't
// even render correctly inside the dead admin iframe.
//
// We replace it with a friendly "Session expired — please refresh" screen
// + a button that reloads the current frame. After a reload, Shopify
// reissues a fresh session token via the embed flow and the merchant lands
// back in the admin without ever seeing a domain prompt.
//
// We intentionally do NOT call the upstream `login()` helper here — its
// validation produces shop-domain-form errors that we'd just throw away.
import { AppProvider } from "@shopify/shopify-app-react-router/react";

export default function SessionExpired() {
  return (
    <AppProvider embedded={false}>
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          background: "#fafbfb",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        <div
          style={{
            background: "#fff",
            border: "1px solid #e1e3e5",
            borderRadius: 12,
            padding: "32px 36px",
            maxWidth: 420,
            width: "100%",
            boxShadow: "0 1px 0 rgba(22, 29, 37, 0.05)",
            textAlign: "center",
          }}
        >
          <div
            aria-hidden="true"
            style={{
              fontSize: 32,
              lineHeight: 1,
              marginBottom: 12,
              color: "#5c5f62",
            }}
          >
            ↻
          </div>
          <h1
            style={{
              fontSize: 18,
              fontWeight: 600,
              color: "#202223",
              margin: "0 0 8px",
            }}
          >
            Session expired
          </h1>
          <p
            style={{
              fontSize: 14,
              color: "#6d7175",
              lineHeight: 1.45,
              margin: "0 0 24px",
            }}
          >
            Your Shopify session timed out. Refresh your browser to keep using
            Royal Loyalty.
          </p>
          <button
            type="button"
            onClick={() => {
              // Reload the current frame only. Memory note (feedback-iframe-
              // auth-bug): never touch window.top.location in an embedded
              // context — it breaks the embed. location.reload reloads this
              // frame, which is what we want.
              try { location.reload(); } catch { /* SSR fallback */ }
            }}
            style={{
              appearance: "none",
              border: "none",
              background: "#202223",
              color: "#fff",
              fontWeight: 600,
              fontSize: 14,
              padding: "10px 20px",
              borderRadius: 8,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Refresh
          </button>
        </div>
      </div>
    </AppProvider>
  );
}
