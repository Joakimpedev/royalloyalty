// Single source of truth for navigation inside the embedded admin.
//
// ⚠ IFRAME AUTH: This app runs inside the Shopify admin iframe. Session
// tokens are bound to the iframe; any time the iframe is force-reloaded by
// a full-page navigation, the new request can land WITHOUT the session
// token and the merchant ends up on a broken auth page.
//
// `<s-button href="...">` and bare `<a href="...">` clicks both trigger a
// full-iframe reload — they are NOT intercepted by React Router and (in
// practice) are not consistently intercepted by App Bridge either. The nav
// rail's `<s-link>` happens to work because Shopify treats nav-rail items
// specially; everywhere else those patterns break auth.
//
// Use this hook for every clickable navigation in the app:
//
//   const nav = useAppNavigate();
//   <s-button onClick={() => nav("/app/program")}>Go</s-button>
//   <s-button onClick={() => nav("shopify:admin/themes/current/editor")}>Open theme</s-button>
//   <div onClick={() => nav("/app/program/earn/purchase")}>Card</div>
//
// Rules:
//   - `/app/...` → React Router client-side nav. Preserves the iframe and
//     therefore the session.
//   - `shopify:admin/...` → App Bridge `shopify.open()`. Navigates the parent
//     admin frame while keeping our iframe alive.
//   - `https://...` (truly external) → `window.open(url, "_blank")`. Opens
//     in a new tab; the iframe is untouched.
//   - mailto:/tel: → `window.location.href = url` (browser handles these).
//
// Never reach for `target="_top"`, `window.top.location.href`, or
// `window.location.href` directly anywhere else.

import { useCallback, type ReactNode } from "react";
import { useNavigate } from "react-router";

type ShopifyGlobal = {
  open?: (url: string) => void;
  redirect?: {
    dispatch?: (args: {
      type: string;
      url: string;
      newContext?: boolean;
    }) => void;
  };
};

export function useAppNavigate() {
  const navigate = useNavigate();

  return useCallback(
    (href: string) => {
      if (!href) return;

      // In-app: React Router client-side nav.
      if (href.startsWith("/app") || href.startsWith("/")) {
        navigate(href);
        return;
      }

      // Shopify admin: hand off to App Bridge — it navigates the parent
      // admin frame while keeping our iframe (and session) alive.
      if (href.startsWith("shopify:")) {
        const sh = (
          window as unknown as { shopify?: ShopifyGlobal }
        ).shopify;
        if (sh?.open) {
          sh.open(href);
          return;
        }
        // App Bridge not present (local dev without embedded harness). No
        // iframe to break in that mode, so a direct nav is acceptable.
        window.location.href = href;
        return;
      }

      // External (Stripe, docs, etc.) — new tab so the iframe is untouched.
      if (href.startsWith("http://") || href.startsWith("https://")) {
        window.open(href, "_blank", "noopener,noreferrer");
        return;
      }

      // mailto:, tel:, sms: — let the browser handle.
      window.location.href = href;
    },
    [navigate],
  );
}

// Anchor-styled in-body link that routes via useAppNavigate. Use this anywhere
// you'd reach for `<s-link href=>` OUTSIDE the nav rail — `<s-link>` in body
// content does a full-page reload that breaks iframe auth. The nav rail itself
// is fine (Shopify intercepts those specifically).
export function AppLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  const nav = useAppNavigate();
  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        nav(href);
      }}
      style={{
        color: "#2c6ecb",
        textDecoration: "underline",
        cursor: "pointer",
      }}
    >
      {children}
    </a>
  );
}
