// Mirror the saved Branding colors into shop metafields so the storefront
// Liquid block can render them on first paint (no JS flash). The Prisma DB
// is still the source of truth; metafields are a write-through cache.
//
// Storefront access requires a definition with access.storefront=PUBLIC_READ.
// We ensure the definitions exist (idempotent — TAKEN errors are ignored)
// before each write so a brand-new shop bootstraps itself.

type AdminClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

const NAMESPACE = "royal_loyalty";
const DEFINITIONS = [
  { key: "primary_color", name: "Royal Loyalty primary color" },
  { key: "secondary_color", name: "Royal Loyalty secondary color" },
];

async function ensureDefinitions(
  admin: AdminClient,
  steps: Array<{ key: string; created: boolean; updated: boolean; errors: string[] }>,
): Promise<void> {
  const createMutation = `#graphql
    mutation CreateBrandingDef($def: MetafieldDefinitionInput!) {
      metafieldDefinitionCreate(definition: $def) {
        createdDefinition { id }
        userErrors { code field message }
      }
    }
  `;
  const updateMutation = `#graphql
    mutation UpdateBrandingDef($def: MetafieldDefinitionUpdateInput!) {
      metafieldDefinitionUpdate(definition: $def) {
        updatedDefinition { id }
        userErrors { code field message }
      }
    }
  `;
  for (const d of DEFINITIONS) {
    const step = { key: d.key, created: false, updated: false, errors: [] as string[] };
    steps.push(step);
    try {
      const res = await admin.graphql(createMutation, {
        variables: {
          def: {
            name: d.name,
            namespace: NAMESPACE,
            key: d.key,
            type: "color",
            ownerType: "SHOP",
            access: { storefront: "PUBLIC_READ" },
          },
        },
      });
      const json = (await res.json()) as {
        data?: {
          metafieldDefinitionCreate?: {
            createdDefinition?: { id?: string } | null;
            userErrors?: Array<{ code?: string; message?: string }>;
          };
        };
      };
      const errs = json?.data?.metafieldDefinitionCreate?.userErrors ?? [];
      const taken = errs.find((e) => e.code === "TAKEN");
      const other = errs.filter((e) => e.code !== "TAKEN");
      step.created = !!json?.data?.metafieldDefinitionCreate?.createdDefinition;
      if (other.length) {
        step.errors.push(
          ...other.map((e) => `create: ${e.code ?? ""} ${e.message ?? ""}`.trim()),
        );
        console.warn(
          "[branding-metafields] definition create userErrors",
          d.key,
          other,
        );
      }
      if (taken) {
        // Definition exists from a prior save (possibly created before we
        // added storefront access). Update it so the value becomes readable
        // from storefront Liquid (`shop.metafields.royal_loyalty.<key>`).
        try {
          const upd = await admin.graphql(updateMutation, {
            variables: {
              def: {
                namespace: NAMESPACE,
                key: d.key,
                ownerType: "SHOP",
                access: { storefront: "PUBLIC_READ" },
              },
            },
          });
          const updJson = (await upd.json()) as {
            data?: {
              metafieldDefinitionUpdate?: {
                updatedDefinition?: { id?: string } | null;
                userErrors?: Array<{ code?: string; message?: string }>;
              };
            };
          };
          const updErrs =
            updJson?.data?.metafieldDefinitionUpdate?.userErrors ?? [];
          step.updated = !!updJson?.data?.metafieldDefinitionUpdate?.updatedDefinition;
          if (updErrs.length) {
            step.errors.push(
              ...updErrs.map(
                (e) => `update: ${e.code ?? ""} ${e.message ?? ""}`.trim(),
              ),
            );
            console.warn(
              "[branding-metafields] definition update userErrors",
              d.key,
              updErrs,
            );
          }
        } catch (e) {
          step.errors.push(
            `update threw: ${e instanceof Error ? e.message : String(e)}`,
          );
          console.warn(
            "[branding-metafields] definition update threw",
            d.key,
            e,
          );
        }
      }
    } catch (e) {
      step.errors.push(
        `create threw: ${e instanceof Error ? e.message : String(e)}`,
      );
      console.warn("[branding-metafields] definition create threw", d.key, e);
    }
  }
}

async function getShopGid(
  admin: AdminClient,
  result: BrandingMetafieldsResult,
): Promise<string | null> {
  try {
    const res = await admin.graphql(`#graphql
      query GetShopId { shop { id } }
    `);
    const raw = await res.text();
    result.shopIdRawSnippet = raw.slice(0, 400);
    let json: { data?: { shop?: { id?: string } }; errors?: Array<{ message?: string }> } = {};
    try {
      json = JSON.parse(raw);
    } catch {
      result.shopIdError = "response was not valid JSON";
      return null;
    }
    if (json.errors?.length) {
      result.shopIdError = json.errors.map((e) => e.message ?? "?").join(" | ");
      return null;
    }
    const id = json?.data?.shop?.id ?? null;
    if (!id) result.shopIdError = "shop.id missing in response";
    return id;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    result.shopIdError = "threw: " + msg;
    console.warn("[branding-metafields] getShopGid threw", e);
    return null;
  }
}

export interface BrandingMetafieldsResult {
  ok: boolean;
  ownerId: string | null;
  defSteps: Array<{ key: string; created: boolean; updated: boolean; errors: string[] }>;
  setErrors: string[];
  setMetafields: Array<{ namespace: string; key: string; value: string }>;
  setRawSnippet?: string;
  shopIdError?: string;
  shopIdRawSnippet?: string;
  threw?: string;
}

export async function writeBrandingMetafields(
  admin: AdminClient,
  colors: { primaryColor: string; secondaryColor: string },
): Promise<BrandingMetafieldsResult> {
  const result: BrandingMetafieldsResult = {
    ok: false,
    ownerId: null,
    defSteps: [],
    setErrors: [],
    setMetafields: [],
  };
  try {
    await ensureDefinitions(admin, result.defSteps);
    const ownerId = await getShopGid(admin, result);
    result.ownerId = ownerId;
    if (!ownerId) return result;

    const mutation = `#graphql
      mutation SetBrandingMetafields($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { id namespace key value }
          userErrors { field message code }
        }
      }
    `;
    try {
      const res = await admin.graphql(mutation, {
        variables: {
          metafields: [
            {
              ownerId,
              namespace: NAMESPACE,
              key: "primary_color",
              type: "color",
              value: colors.primaryColor,
            },
            {
              ownerId,
              namespace: NAMESPACE,
              key: "secondary_color",
              type: "color",
              value: colors.secondaryColor,
            },
          ],
        },
      });
      const rawText = await res.text();
      result.setRawSnippet = rawText.slice(0, 600);
      let json: {
        data?: {
          metafieldsSet?: {
            metafields?: Array<{ namespace: string; key: string; value: string }>;
            userErrors?: Array<{ message?: string; code?: string }>;
          };
        };
        errors?: Array<{ message?: string }>;
      } = {};
      try {
        json = JSON.parse(rawText);
      } catch {
        result.setErrors.push("response was not valid JSON");
      }
      if (json.errors?.length) {
        result.setErrors.push(
          ...json.errors.map((e) => "graphql: " + (e.message ?? "unknown")),
        );
      }
      const errs = json?.data?.metafieldsSet?.userErrors ?? [];
      result.setErrors = errs.map((e) => `${e.code ?? ""} ${e.message ?? ""}`.trim());
      result.setMetafields = json?.data?.metafieldsSet?.metafields ?? [];
      if (errs.length) {
        console.warn("[branding-metafields] metafieldsSet userErrors", errs);
      }
      result.ok = errs.length === 0 && result.setMetafields.length === 2;
    } catch (e) {
      console.warn("[branding-metafields] metafieldsSet threw", e);
      result.threw = e instanceof Error ? e.message : String(e);
    }
  } catch (outer) {
    result.threw = outer instanceof Error ? outer.message : String(outer);
  }
  return result;
}
