import { createHash } from "node:crypto";
import type {
  AiCachedEntry,
  AiSuggestInput,
  AiSuggestions,
  AiSuggestionsMap,
} from "../lib/ai";
import { toAiSuggestInput } from "../lib/ai";
import { aiCacheKey } from "../lib/shop-locale";
import prisma from "../db.server";

export type { AiCachedEntry, AiSuggestionsMap };

export function computeInputHash(input: AiSuggestInput): string {
  return createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex")
    .slice(0, 16);
}

function rowToSuggestions(row: {
  priority: string;
  summary: string;
  suggestedDescription: string;
  suggestedSeoTitle: string;
  suggestedSeoDescription: string;
  suggestedAltText: string;
}): AiSuggestions {
  return {
    priority: row.priority,
    summary: row.summary,
    suggestedDescription: row.suggestedDescription,
    suggestedSeoTitle: row.suggestedSeoTitle,
    suggestedSeoDescription: row.suggestedSeoDescription,
    suggestedAltText: row.suggestedAltText,
  };
}

export async function loadAiSuggestionsForShop(
  shop: string,
  products: Parameters<typeof toAiSuggestInput>[0][],
  contentLocale: string,
): Promise<AiSuggestionsMap> {
  const rows = await prisma.aiSuggestionCache.findMany({
    where: { shop, contentLocale },
  });
  const productHashes = new Map(
    products.map((product) => [
      product.id,
      computeInputHash(toAiSuggestInput(product)),
    ]),
  );

  const result: AiSuggestionsMap = {};

  for (const row of rows) {
    const currentHash = productHashes.get(row.productId);
    if (!currentHash) continue;

    result[aiCacheKey(row.productId, row.contentLocale)] = {
      suggestions: rowToSuggestions(row),
      createdAt: row.updatedAt.toISOString(),
      isStale: currentHash !== row.inputHash,
      contentLocale: row.contentLocale,
    };
  }

  return result;
}

export async function getOrCreateAiSuggestion(
  shop: string,
  product: AiSuggestInput,
  contentLocale: string,
  generate: () => Promise<AiSuggestions>,
  forceRegenerate = false,
): Promise<{ suggestions: AiSuggestions; fromCache: boolean }> {
  const inputHash = computeInputHash(product);
  const existing = await prisma.aiSuggestionCache.findUnique({
    where: {
      shop_productId_contentLocale: {
        shop,
        productId: product.id,
        contentLocale,
      },
    },
  });

  if (!forceRegenerate && existing && existing.inputHash === inputHash) {
    return {
      suggestions: rowToSuggestions(existing),
      fromCache: true,
    };
  }

  const suggestions = await generate();

  await prisma.aiSuggestionCache.upsert({
    where: {
      shop_productId_contentLocale: {
        shop,
        productId: product.id,
        contentLocale,
      },
    },
    create: {
      shop,
      productId: product.id,
      contentLocale,
      inputHash,
      priority: suggestions.priority,
      summary: suggestions.summary,
      suggestedDescription: suggestions.suggestedDescription,
      suggestedSeoTitle: suggestions.suggestedSeoTitle,
      suggestedSeoDescription: suggestions.suggestedSeoDescription,
      suggestedAltText: suggestions.suggestedAltText,
    },
    update: {
      inputHash,
      priority: suggestions.priority,
      summary: suggestions.summary,
      suggestedDescription: suggestions.suggestedDescription,
      suggestedSeoTitle: suggestions.suggestedSeoTitle,
      suggestedSeoDescription: suggestions.suggestedSeoDescription,
      suggestedAltText: suggestions.suggestedAltText,
    },
  });

  return { suggestions, fromCache: false };
}

export async function getCachedAiSuggestion(
  shop: string,
  productId: string,
  contentLocale: string,
) {
  const row = await prisma.aiSuggestionCache.findUnique({
    where: {
      shop_productId_contentLocale: {
        shop,
        productId,
        contentLocale,
      },
    },
  });

  if (!row) return null;

  return {
    suggestions: rowToSuggestions(row),
    inputHash: row.inputHash,
    updatedAt: row.updatedAt.toISOString(),
    contentLocale: row.contentLocale,
  };
}
