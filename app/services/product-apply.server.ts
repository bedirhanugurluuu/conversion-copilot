import type { AiSuggestions } from "../lib/ai";
import type { ApplyDebugInfo } from "../lib/apply-debug.server";
import { createApplyDebug, logApply } from "../lib/apply-debug.server";
import { assertShopifyMutation } from "./shopify-graphql.server";
import { applyProductTranslations } from "./product-translations.server";

type AdminGraphQLClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

export interface ApplyResult {
  updatedFields: string[];
  skippedFields: string[];
  debug: ApplyDebugInfo;
}

function plainTextToDescriptionHtml(text: string): string {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) {
    return `<p>${escapeHtml(text.trim())}</p>`;
  }

  return paragraphs.map((part) => `<p>${escapeHtml(part)}</p>`).join("");

}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function getProductMediaIds(
  admin: AdminGraphQLClient,
  productId: string,
): Promise<string[]> {
  const response = await admin.graphql(
    `#graphql
      query GetProductMedia($id: ID!) {
        product(id: $id) {
          media(first: 10) {
            edges {
              node {
                ... on MediaImage {
                  id
                }
              }
            }
          }
        }
      }`,
    { variables: { id: productId } },
  );

  const json = (await response.json()) as {
    data?: {
      product?: {
        media?: {
          edges: Array<{ node: { id?: string } | null }>;
        };
      };
    };
    errors?: Array<{ message: string }>;
  };

  if (json.errors?.length) {
    throw new Error(
      `Could not load product media: ${json.errors.map((error) => error.message).join(", ")}`,
    );
  }

  return (
    json.data?.product?.media?.edges
      .map((edge) => edge.node?.id)
      .filter((id): id is string => Boolean(id)) ?? []
  );
}

async function verifyProductContent(
  admin: AdminGraphQLClient,
  productId: string,
  contentLocale: string,
  primaryLocale: string,
) {
  const isPrimary = contentLocale === primaryLocale;

  const response = await admin.graphql(
    `#graphql
      query VerifyAppliedProduct($id: ID!, $locale: String!, $withTranslations: Boolean!) {
        product(id: $id) {
          id
          title
          descriptionHtml
          seo {
            title
            description
          }
          media(first: 1) {
            edges {
              node {
                ... on MediaImage {
                  id
                  alt
                }
              }
            }
          }
          translations(locale: $locale) @include(if: $withTranslations) {
            key
            value
          }
        }
      }`,
    {
      variables: {
        id: productId,
        locale: contentLocale,
        withTranslations: !isPrimary,
      },
    },
  );

  const json = (await response.json()) as {
    data?: {
      product?: {
        id: string;
        title: string;
        descriptionHtml: string;
        seo: { title: string | null; description: string | null };
        media: {
          edges: Array<{ node: { id?: string; alt?: string | null } | null }>;
        };
        translations?: Array<{ key: string; value: string }>;
      };
    };
    errors?: Array<{ message: string }>;
  };

  const product = json.data?.product;
  if (!product) {
    return { error: "Verification query returned no product", raw: json };
  }

  const translationMap = new Map(
    (product.translations ?? []).map((entry) => [entry.key, entry.value]),
  );

  return {
    mode: isPrimary ? "primary" : "translation",
    title: isPrimary ? product.title : translationMap.get("title") ?? product.title,
    descriptionHtml: isPrimary
      ? product.descriptionHtml
      : translationMap.get("body_html") ?? "",
    seoTitle: isPrimary
      ? product.seo?.title
      : translationMap.get("meta_title") ?? product.seo?.title,
    seoDescription: isPrimary
      ? product.seo?.description
      : translationMap.get("meta_description") ?? product.seo?.description,
    mediaAlt: product.media.edges[0]?.node?.alt ?? null,
    translationKeys: [...translationMap.keys()],
  };
}

async function updateMediaAltText(
  admin: AdminGraphQLClient,
  mediaId: string,
  alt: string,
  debug: ApplyDebugInfo,
): Promise<void> {
  debug.steps.push(`fileUpdate alt for media ${mediaId}`);

  const response = await admin.graphql(
    `#graphql
      mutation ApplyAiFileAlt($files: [FileUpdateInput!]!) {
        fileUpdate(files: $files) {
          files {
            id
            alt
          }
          userErrors {
            field
            message
          }
        }
      }`,
    {
      variables: {
        files: [
          {
            id: mediaId,
            alt,
          },
        ],
      },
    },
  );

  const payload = await assertShopifyMutation(
    response,
    "fileUpdate",
    "Could not update image alt text",
  );
  debug.shopifyResponses.fileUpdate = payload;
}

async function applyPrimaryLocaleSuggestions(
  admin: AdminGraphQLClient,
  productId: string,
  suggestions: AiSuggestions,
  debug: ApplyDebugInfo,
): Promise<{ updatedFields: string[] }> {
  const updatedFields: string[] = [];
  const product: Record<string, unknown> = { id: productId };

  if (suggestions.suggestedDescription.trim()) {
    product.descriptionHtml = plainTextToDescriptionHtml(
      suggestions.suggestedDescription,
    );
    updatedFields.push("description");
  }

  if (
    suggestions.suggestedSeoTitle.trim() ||
    suggestions.suggestedSeoDescription.trim()
  ) {
    product.seo = {
      title: suggestions.suggestedSeoTitle.trim() || undefined,
      description: suggestions.suggestedSeoDescription.trim() || undefined,
    };
    updatedFields.push("SEO");
  }

  if (Object.keys(product).length > 1) {
    debug.steps.push("productUpdate primary locale fields");
    logApply("productUpdate variables", product);

    const response = await admin.graphql(
      `#graphql
        mutation ApplyAiProductUpdate($product: ProductUpdateInput!) {
          productUpdate(product: $product) {
            product {
              id
              descriptionHtml
              seo {
                title
                description
              }
            }
            userErrors {
              field
              message
            }
          }
        }`,
      { variables: { product } },
    );

    const payload = await assertShopifyMutation(
      response,
      "productUpdate",
      "Could not update product",
    );
    debug.shopifyResponses.productUpdate = payload;
  }

  if (suggestions.suggestedAltText.trim()) {
    const mediaIds = await getProductMediaIds(admin, productId);
    const primaryMediaId = mediaIds[0];

    if (!primaryMediaId) {
      throw new Error("Could not update image alt text: product has no images.");
    }

    await updateMediaAltText(
      admin,
      primaryMediaId,
      suggestions.suggestedAltText.trim(),
      debug,
    );
    updatedFields.push("alt text");
  }

  return { updatedFields };
}

export async function applyAiSuggestionsToProduct(
  admin: AdminGraphQLClient,
  productId: string,
  suggestions: AiSuggestions,
  options: {
    contentLocale: string;
    primaryLocale: string;
  },
): Promise<ApplyResult> {
  const debug = createApplyDebug(
    productId,
    options.contentLocale,
    options.primaryLocale,
  );
  debug.suggestionLengths = {
    description: suggestions.suggestedDescription.length,
    seoTitle: suggestions.suggestedSeoTitle.length,
    seoDescription: suggestions.suggestedSeoDescription.length,
    altText: suggestions.suggestedAltText.length,
  };

  logApply("Starting apply", debug);

  const isPrimary = options.contentLocale === options.primaryLocale;
  let updatedFields: string[];
  let skippedFields: string[] = [];

  if (isPrimary) {
    ({ updatedFields } = await applyPrimaryLocaleSuggestions(
      admin,
      productId,
      suggestions,
      debug,
    ));
    skippedFields = [];
  } else {
    debug.steps.push("translationsRegister for non-primary locale");
    const mediaIds = await getProductMediaIds(admin, productId);
    ({ updatedFields, skippedFields } = await applyProductTranslations(
      admin,
      productId,
      options.contentLocale,
      suggestions,
      mediaIds[0] ?? null,
      debug,
    ));
  }

  if (updatedFields.length === 0) {
    throw new Error("No AI suggestions were applied.");
  }

  debug.verification = await verifyProductContent(
    admin,
    productId,
    options.contentLocale,
    options.primaryLocale,
  );
  logApply("Verification after apply", debug.verification);

  return { updatedFields, skippedFields, debug };
}
