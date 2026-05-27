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

async function ensureDefinitions(admin: AdminClient): Promise<void> {
  const mutation = `#graphql
    mutation CreateBrandingDef($def: MetafieldDefinitionInput!) {
      metafieldDefinitionCreate(definition: $def) {
        createdDefinition { id }
        userErrors { code field message }
      }
    }
  `;
  for (const d of DEFINITIONS) {
    try {
      const res = await admin.graphql(mutation, {
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
      // Swallow "TAKEN" — definition already exists from a prior save.
      // Other userErrors are surfaced via console so they show up in logs
      // but don't break the save (the DB write is the real persistence).
      const json = (await res.json()) as {
        data?: {
          metafieldDefinitionCreate?: {
            userErrors?: Array<{ code?: string; message?: string }>;
          };
        };
      };
      const errs =
        json?.data?.metafieldDefinitionCreate?.userErrors?.filter(
          (e) => e.code !== "TAKEN",
        ) ?? [];
      if (errs.length) {
        console.warn(
          "[branding-metafields] definition create userErrors",
          d.key,
          errs,
        );
      }
    } catch (e) {
      console.warn("[branding-metafields] definition create threw", d.key, e);
    }
  }
}

async function getShopGid(admin: AdminClient): Promise<string | null> {
  try {
    const res = await admin.graphql(`#graphql { shop { id } }`);
    const json = (await res.json()) as { data?: { shop?: { id?: string } } };
    return json?.data?.shop?.id ?? null;
  } catch (e) {
    console.warn("[branding-metafields] getShopGid threw", e);
    return null;
  }
}

export async function writeBrandingMetafields(
  admin: AdminClient,
  colors: { primaryColor: string; secondaryColor: string },
): Promise<void> {
  await ensureDefinitions(admin);
  const ownerId = await getShopGid(admin);
  if (!ownerId) return;

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
    const json = (await res.json()) as {
      data?: {
        metafieldsSet?: { userErrors?: Array<{ message?: string }> };
      };
    };
    const errs = json?.data?.metafieldsSet?.userErrors ?? [];
    if (errs.length) {
      console.warn("[branding-metafields] metafieldsSet userErrors", errs);
    }
  } catch (e) {
    console.warn("[branding-metafields] metafieldsSet threw", e);
  }
}
