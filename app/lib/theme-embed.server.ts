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

export interface EmbedCheck {
  enabled: boolean | null;
  /** Human-readable diagnostic, surfaced in the admin when enabled === null
   *  so we can debug "why doesn't the badge render" without server logs. */
  debug: string;
}

export async function checkAppEmbedEnabled(
  admin: AdminLike,
): Promise<EmbedCheck> {
  try {
    const res = await admin.graphql(QUERY);
    const json = (await res.json()) as {
      data?: {
        themes?: {
          nodes?: Array<{
            id?: string;
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
      const msg = json.errors.map((e) => e.message).join("; ");
      return { enabled: null, debug: `graphql errors: ${msg}` };
    }

    const themes = json.data?.themes?.nodes ?? [];
    if (!themes.length) {
      return { enabled: null, debug: "no themes returned by Admin API" };
    }

    const mainTheme = themes.find(
      (t) => (t.role ?? "").toUpperCase() === "MAIN",
    );
    if (!mainTheme) {
      const roles = themes.map((t) => t.role ?? "?").join(",");
      return { enabled: null, debug: `no MAIN theme (roles: ${roles})` };
    }

    const content = mainTheme.files?.nodes?.[0]?.body?.content;
    if (!content) {
      return {
        enabled: null,
        debug: "MAIN theme returned no settings_data.json content",
      };
    }

    let settings: {
      current?:
        | string
        | {
            blocks?: Record<string, { type?: string; disabled?: boolean }>;
          };
    };
    try {
      settings = JSON.parse(content);
    } catch (e) {
      return {
        enabled: null,
        debug: `settings_data.json parse failed: ${(e as Error).message}`,
      };
    }

    if (!settings.current) {
      return { enabled: null, debug: "settings_data.json has no `current`" };
    }
    if (typeof settings.current === "string") {
      // Theme is using a preset name reference rather than inline blocks.
      // We don't follow the preset lookup yet — treat as disabled but
      // surface this so we can prioritize handling it if it's common.
      return {
        enabled: false,
        debug: `current is preset reference "${settings.current}" (inline blocks not present)`,
      };
    }

    const blocks = settings.current.blocks ?? {};
    const blockKeys = Object.keys(blocks);
    for (const key of blockKeys) {
      const block = blocks[key];
      if (!block?.type) continue;
      // App embed block types look like:
      //   shopify://apps/{api_client_id}/blocks/{handle}/{extension_uid}
      if (block.type.includes(EXTENSION_UID)) {
        return {
          enabled: !block.disabled,
          debug: `matched block ${key} (type=${block.type}, disabled=${!!block.disabled})`,
        };
      }
    }

    // None of the current blocks reference our extension UID.
    const sample = blockKeys
      .slice(0, 3)
      .map((k) => blocks[k]?.type ?? "?")
      .join(" | ");
    return {
      enabled: false,
      debug: `extension uid not in current.blocks (${blockKeys.length} block(s); sample types: ${sample || "none"})`,
    };
  } catch (err) {
    return {
      enabled: null,
      debug: `exception: ${(err as Error).message}`,
    };
  }
}
