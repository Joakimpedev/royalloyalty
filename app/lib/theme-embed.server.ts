// Detect whether the Royal Loyalty theme app embed is enabled on the
// merchant's main theme. Used by the Branding page (and any surface that
// wants to signal "embed required" without making the merchant guess).
//
// Implementation: fetch the active theme's config/settings_data.json via
// the Admin GraphQL API, parse `current.blocks`, look for a block whose
// `type` contains our extension UID, and treat it as enabled when present
// and not flagged `disabled: true`. Returns null on any failure so the
// caller can degrade gracefully (we hide the badge rather than show a
// misleading red one).
//
// The extension UID must match the `uid` field in
// extensions/loyalty-widget/shopify.extension.toml.

const EXTENSION_UID = "63dc22e1-27da-358d-1f2a-1e6d9b60e4b66a03a917";

// Query all themes (typically <5 per shop) and find the MAIN one client-side
// — `roles:` argument support has flip-flopped across API versions, so this
// is the version-safe path. The `OnlineStoreThemeFileBodyText` inline
// fragment carries the JSON contents as a plain string.
const QUERY = `#graphql
  query AllThemes {
    themes(first: 20) {
      nodes {
        id
        role
        files(filenames: ["config/settings_data.json"]) {
          nodes {
            body {
              ... on OnlineStoreThemeFileBodyText { content }
            }
          }
        }
      }
    }
  }
`;

interface AdminLike {
  graphql: (query: string) => Promise<Response>;
}

export async function isAppEmbedEnabled(
  admin: AdminLike,
): Promise<boolean | null> {
  try {
    const res = await admin.graphql(QUERY);
    const json = (await res.json()) as {
      data?: {
        themes?: {
          nodes?: Array<{
            role?: string;
            files?: {
              nodes?: Array<{ body?: { content?: string } }>;
            };
          }>;
        };
      };
      errors?: Array<{ message?: string }>;
    };
    if (json.errors?.length) {
      console.warn(
        "[theme-embed] graphql errors:",
        json.errors.map((e) => e.message).join("; "),
      );
      return null;
    }
    const mainTheme = json.data?.themes?.nodes?.find(
      (t) => (t.role ?? "").toUpperCase() === "MAIN",
    );
    const content = mainTheme?.files?.nodes?.[0]?.body?.content;
    if (!content) return null;

    const settings = JSON.parse(content) as {
      current?:
        | string
        | {
            blocks?: Record<string, { type?: string; disabled?: boolean }>;
          };
    };
    // `current` is either a preset name (string) referring to `presets[name]`,
    // or an inline preset object with its own blocks. We only check the
    // inline form — that's the standard shape once a merchant edits theme
    // settings, which they will have done if they enabled an app embed.
    if (!settings.current || typeof settings.current === "string") return false;

    const blocks = settings.current.blocks ?? {};
    for (const key of Object.keys(blocks)) {
      const block = blocks[key];
      if (!block?.type) continue;
      // App embed block types look like:
      //   shopify://apps/{api_client_id}/blocks/{handle}/{extension_uid}
      // Matching on the extension UID is stable across app handle / client
      // changes and unambiguous.
      if (block.type.includes(EXTENSION_UID)) {
        return !block.disabled;
      }
    }
    return false;
  } catch (err) {
    console.warn("[theme-embed] check failed:", err);
    return null;
  }
}
