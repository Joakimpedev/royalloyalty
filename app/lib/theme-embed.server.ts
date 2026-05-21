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

// Use the raw fetch path (not admin.graphql) because the SDK wrapper throws
// on non-2xx and only surfaces the error message string, which obscures the
// actual response body. With a direct fetch we keep the full status, error
// extensions, and body even on failure — critical for diagnosing
// "Access denied" cases without a scope name.
export interface RawSession {
  shop: string;
  accessToken?: string;
}

const API_VERSION = "2026-01";

export interface EmbedCheck {
  enabled: boolean | null;
  /** Short human-readable summary surfaced in the admin. */
  debug: string;
  /** Full diagnostic payload — rendered as JSON in the UI behind a copy
   *  button when enabled === null, so users can hand us the exact state
   *  without needing server log access. */
  dump: Record<string, unknown>;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + `… [+${s.length - max} chars truncated]`;
}

export async function checkAppEmbedEnabled(
  admin: AdminLike,
  session?: RawSession,
): Promise<EmbedCheck> {
  const dump: Record<string, unknown> = {
    extension_uid: EXTENSION_UID,
    query: QUERY,
    api_version: API_VERSION,
    timestamp: new Date().toISOString(),
    transport: session?.accessToken ? "raw-fetch" : "sdk-admin.graphql",
  };

  try {
    let res: Response;
    if (session?.accessToken && session.shop) {
      // Raw fetch — preserves the response body even on non-2xx so we can
      // see why Shopify denies the call.
      res = await fetch(
        `https://${session.shop}/admin/api/${API_VERSION}/graphql.json`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": session.accessToken,
          },
          body: JSON.stringify({ query: QUERY }),
        },
      );
    } else {
      res = await admin.graphql(QUERY);
    }
    dump.http_status = res.status;
    dump.http_ok = res.ok;
    // Include a couple of response headers that Shopify sets on auth failures.
    dump.response_headers = {
      "x-request-id": res.headers.get("x-request-id"),
      "x-shopify-api-version": res.headers.get("x-shopify-api-version"),
      "www-authenticate": res.headers.get("www-authenticate"),
    };
    const raw = await res.text();
    dump.raw_response_first_4kb = truncate(raw, 4000);

    let json: {
      data?: {
        themes?: {
          nodes?: Array<{
            id?: string;
            role?: string;
            name?: string;
            files?: {
              nodes?: Array<{ body?: { content?: string } }>;
            };
          }>;
        };
      };
      errors?: Array<{ message?: string }>;
    };
    try {
      json = JSON.parse(raw);
    } catch (e) {
      const debug = `response JSON parse failed: ${(e as Error).message}`;
      return { enabled: null, debug, dump: { ...dump, fatal: debug } };
    }

    dump.graphql_errors = json.errors ?? null;

    if (json.errors?.length) {
      const msg = json.errors.map((e) => e.message).join("; ");
      const debug = `graphql errors: ${msg}`;
      return { enabled: null, debug, dump };
    }

    const themes = json.data?.themes?.nodes ?? [];
    dump.themes_summary = themes.map((t) => ({
      id: t.id,
      role: t.role,
      name: t.name,
      hasSettingsFile: !!t.files?.nodes?.[0]?.body?.content,
    }));

    if (!themes.length) {
      const debug = "no themes returned by Admin API";
      return { enabled: null, debug, dump };
    }

    const mainTheme = themes.find(
      (t) => (t.role ?? "").toUpperCase() === "MAIN",
    );
    if (!mainTheme) {
      const roles = themes.map((t) => t.role ?? "?").join(",");
      const debug = `no MAIN theme (roles: ${roles})`;
      return { enabled: null, debug, dump };
    }
    dump.main_theme_id = mainTheme.id;

    const content = mainTheme.files?.nodes?.[0]?.body?.content;
    if (!content) {
      const debug = "MAIN theme returned no settings_data.json content";
      return { enabled: null, debug, dump };
    }
    dump.settings_data_size = content.length;
    dump.settings_data_first_2kb = truncate(content, 2000);

    let settings: {
      current?:
        | string
        | {
            blocks?: Record<string, { type?: string; disabled?: boolean }>;
          };
      presets?: Record<
        string,
        { blocks?: Record<string, { type?: string; disabled?: boolean }> }
      >;
    };
    try {
      settings = JSON.parse(content);
    } catch (e) {
      const debug = `settings_data.json parse failed: ${(e as Error).message}`;
      return { enabled: null, debug, dump };
    }

    dump.has_current = !!settings.current;
    dump.current_type = typeof settings.current;
    dump.preset_names = settings.presets ? Object.keys(settings.presets) : null;

    if (!settings.current) {
      const debug = "settings_data.json has no `current`";
      return { enabled: null, debug, dump };
    }

    // Resolve blocks from either the inline `current` object or the named
    // preset it references. Older themes / fresh installs use the string
    // form pointing at `presets.<name>`.
    let blocksSource: "current" | `preset:${string}` | null = null;
    let blocks: Record<string, { type?: string; disabled?: boolean }> = {};
    if (typeof settings.current === "string") {
      const preset = settings.presets?.[settings.current];
      if (!preset) {
        const debug = `current preset "${settings.current}" not found in presets`;
        return { enabled: null, debug, dump };
      }
      blocks = preset.blocks ?? {};
      blocksSource = `preset:${settings.current}`;
    } else {
      blocks = settings.current.blocks ?? {};
      blocksSource = "current";
    }
    dump.blocks_source = blocksSource;

    const blockKeys = Object.keys(blocks);
    dump.block_count = blockKeys.length;
    dump.block_types = blockKeys.map((k) => ({
      key: k,
      type: blocks[k]?.type,
      disabled: !!blocks[k]?.disabled,
    }));

    for (const key of blockKeys) {
      const block = blocks[key];
      if (!block?.type) continue;
      // App embed block types look like:
      //   shopify://apps/{api_client_id}/blocks/{handle}/{extension_uid}
      if (block.type.includes(EXTENSION_UID)) {
        const debug = `matched block ${key} (type=${block.type}, disabled=${!!block.disabled})`;
        return { enabled: !block.disabled, debug, dump };
      }
    }

    const sample = blockKeys
      .slice(0, 3)
      .map((k) => blocks[k]?.type ?? "?")
      .join(" | ");
    const debug = `extension uid not in ${blocksSource} blocks (${blockKeys.length} block(s); sample types: ${sample || "none"})`;
    return { enabled: false, debug, dump };
  } catch (err) {
    const debug = `exception: ${(err as Error).message}`;
    return {
      enabled: null,
      debug,
      dump: {
        ...dump,
        exception_message: (err as Error).message,
        exception_stack: (err as Error).stack,
      },
    };
  }
}
