import type { AiSuggestions } from "../lib/ai";

import type { ApplyDebugInfo } from "../lib/apply-debug.server";

import { logApply } from "../lib/apply-debug.server";

import { assertShopifyMutation } from "./shopify-graphql.server";



type AdminGraphQLClient = {

  graphql: (

    query: string,

    options?: { variables?: Record<string, unknown> },

  ) => Promise<Response>;

};



interface TranslatableContent {

  key: string;

  digest: string;

}



const TRANSLATION_KEYS = {

  description: "body_html",

  seoTitle: "meta_title",

  seoDescription: "meta_description",

} as const;



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



async function getTranslatableDigests(

  admin: AdminGraphQLClient,

  resourceId: string,

): Promise<Map<string, string>> {

  const response = await admin.graphql(

    `#graphql

      query ProductTranslatableContent($resourceId: ID!) {

        translatableResource(resourceId: $resourceId) {

          translatableContent {

            key

            digest

          }

        }

      }`,

    { variables: { resourceId } },

  );



  const json = (await response.json()) as {

    data?: {

      translatableResource?: {

        translatableContent?: TranslatableContent[];

      };

    };

    errors?: Array<{ message: string }>;

  };



  if (json.errors?.length) {

    throw new Error(

      `Could not load translatable content: ${json.errors.map((error) => error.message).join(", ")}`,

    );

  }



  const entries = json.data?.translatableResource?.translatableContent ?? [];

  logApply(`Translatable keys for ${resourceId}`, entries.map((entry) => entry.key));

  return new Map(entries.map((entry) => [entry.key, entry.digest]));

}



async function fetchProductPrimaryFields(

  admin: AdminGraphQLClient,

  productId: string,

) {

  const response = await admin.graphql(

    `#graphql

      query ProductPrimaryFields($id: ID!) {

        product(id: $id) {

          title

          descriptionHtml

          seo {

            title

            description

          }

        }

      }`,

    { variables: { id: productId } },

  );



  const json = (await response.json()) as {

    data?: {

      product?: {

        title: string;

        descriptionHtml: string;

        seo: { title: string | null; description: string | null };

      };

    };

    errors?: Array<{ message: string }>;

  };



  if (json.errors?.length || !json.data?.product) {

    throw new Error("Could not load product fields before saving translations.");

  }



  return json.data.product;

}



async function updatePrimaryProductFields(

  admin: AdminGraphQLClient,

  product: Record<string, unknown>,

  debug?: ApplyDebugInfo,

) {

  logApply("Initializing primary product fields for translation digests", product);

  debug?.steps.push("initialize primary locale fields for translation digests");



  const response = await admin.graphql(

    `#graphql

      mutation InitializePrimaryProduct($product: ProductUpdateInput!) {

        productUpdate(product: $product) {

          product {

            id

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

    "Could not initialize primary product fields for translation",

  );



  if (debug) {

    debug.shopifyResponses.initializePrimaryProduct = payload;

  }

}



async function ensureProductTranslationDigests(

  admin: AdminGraphQLClient,

  productId: string,

  suggestions: AiSuggestions,

  debug?: ApplyDebugInfo,

): Promise<Map<string, string>> {

  let digests = await getTranslatableDigests(admin, productId);



  const wantsDescription = Boolean(suggestions.suggestedDescription.trim());

  const wantsSeoTitle = Boolean(suggestions.suggestedSeoTitle.trim());

  const wantsSeoDescription = Boolean(suggestions.suggestedSeoDescription.trim());



  const missingKeys = [

    wantsDescription && !digests.has(TRANSLATION_KEYS.description)

      ? TRANSLATION_KEYS.description

      : null,

    wantsSeoTitle && !digests.has(TRANSLATION_KEYS.seoTitle)

      ? TRANSLATION_KEYS.seoTitle

      : null,

    wantsSeoDescription && !digests.has(TRANSLATION_KEYS.seoDescription)

      ? TRANSLATION_KEYS.seoDescription

      : null,

  ].filter((key): key is string => Boolean(key));



  if (missingKeys.length === 0) {

    return digests;

  }



  const fields = await fetchProductPrimaryFields(admin, productId);

  const productUpdate: Record<string, unknown> = { id: productId };

  let needsUpdate = false;



  if (

    missingKeys.includes(TRANSLATION_KEYS.description) &&

    !fields.descriptionHtml?.trim()

  ) {

    productUpdate.descriptionHtml = "<p></p>";

    needsUpdate = true;

  }



  const seo: Record<string, string> = {};

  if (

    missingKeys.includes(TRANSLATION_KEYS.seoTitle) &&

    !fields.seo?.title?.trim()

  ) {

    seo.title = fields.title;

    needsUpdate = true;

  }

  if (

    missingKeys.includes(TRANSLATION_KEYS.seoDescription) &&

    !fields.seo?.description?.trim()

  ) {

    seo.description = fields.title;

    needsUpdate = true;

  }



  if (Object.keys(seo).length > 0) {

    productUpdate.seo = seo;

  }



  if (needsUpdate) {

    await updatePrimaryProductFields(admin, productUpdate, debug);

    digests = await getTranslatableDigests(admin, productId);

    logApply("Digests after primary initialization", [...digests.keys()]);

  }



  return digests;

}



export async function applyProductTranslations(

  admin: AdminGraphQLClient,

  productId: string,

  contentLocale: string,

  suggestions: AiSuggestions,

  primaryMediaId: string | null,

  debug?: ApplyDebugInfo,

): Promise<{ updatedFields: string[]; skippedFields: string[] }> {

  const updatedFields: string[] = [];

  const skippedFields: string[] = [];

  const digests = await ensureProductTranslationDigests(

    admin,

    productId,

    suggestions,

    debug,

  );



  if (debug) {

    debug.shopifyResponses.productTranslatableKeys = [...digests.keys()];

  }



  const translations: Array<{

    locale: string;

    key: string;

    value: string;

    translatableContentDigest: string;

  }> = [];



  const addTranslation = (key: string, value: string, label: string) => {

    const digest = digests.get(key);

    if (!digest) {

      logApply(`Skipping translation for missing digest key: ${key}`);

      skippedFields.push(label);

      return;

    }

    if (!value.trim()) {

      logApply(`Skipping translation for empty value: ${key}`);

      skippedFields.push(label);

      return;

    }

    translations.push({

      locale: contentLocale,

      key,

      value: value.trim(),

      translatableContentDigest: digest,

    });

    updatedFields.push(label);

  };



  addTranslation(

    TRANSLATION_KEYS.description,

    plainTextToDescriptionHtml(suggestions.suggestedDescription),

    "description",

  );

  addTranslation(

    TRANSLATION_KEYS.seoTitle,

    suggestions.suggestedSeoTitle,

    "SEO title",

  );

  addTranslation(

    TRANSLATION_KEYS.seoDescription,

    suggestions.suggestedSeoDescription,

    "SEO description",

  );



  if (translations.length > 0) {

    logApply("translationsRegister product payload", {

      resourceId: productId,

      locale: contentLocale,

      keys: translations.map((entry) => entry.key),

    });



    const response = await admin.graphql(

      `#graphql

        mutation RegisterProductTranslations(

          $resourceId: ID!

          $translations: [TranslationInput!]!

        ) {

          translationsRegister(

            resourceId: $resourceId

            translations: $translations

          ) {

            userErrors {

              field

              message

            }

          }

        }`,

      {

        variables: {

          resourceId: productId,

          translations,

        },

      },

    );



    const payload = await assertShopifyMutation(

      response,

      "translationsRegister",

      "Could not save product translations",

    );

    if (debug) {

      debug.shopifyResponses.translationsRegister = payload;

    }

  }



  if (suggestions.suggestedAltText.trim() && primaryMediaId) {

    const mediaDigests = await getTranslatableDigests(admin, primaryMediaId);

    const altDigest = mediaDigests.get("alt");



    if (altDigest) {

      logApply("translationsRegister media alt payload", {

        resourceId: primaryMediaId,

        locale: contentLocale,

      });



      const mediaResponse = await admin.graphql(

        `#graphql

          mutation RegisterMediaAltTranslation(

            $resourceId: ID!

            $translations: [TranslationInput!]!

          ) {

            translationsRegister(

              resourceId: $resourceId

              translations: $translations

            ) {

              userErrors {

                field

                message

              }

            }

          }`,

        {

          variables: {

            resourceId: primaryMediaId,

            translations: [

              {

                locale: contentLocale,

                key: "alt",

                value: suggestions.suggestedAltText.trim(),

                translatableContentDigest: altDigest,

              },

            ],

          },

        },

      );



      const mediaPayload = await assertShopifyMutation(

        mediaResponse,

        "translationsRegister",

        "Could not save image alt translation",

      );

      if (debug) {

        debug.shopifyResponses.mediaTranslationsRegister = mediaPayload;

      }

      updatedFields.push("alt text");

    } else {

      logApply(`Skipping media alt translation: no digest for ${primaryMediaId}`);

      skippedFields.push("alt text");

    }

  }



  if (updatedFields.length === 0) {

    throw new Error(

      skippedFields.length > 0

        ? `Could not apply translations. Skipped: ${skippedFields.join(", ")}. Try Store locale = English (primary) or add primary content first.`

        : "No translatable AI suggestions were applied.",

    );

  }



  return { updatedFields, skippedFields };

}


