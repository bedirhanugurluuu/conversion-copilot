const PREFIX = "[Conversion Copilot Apply]";

export function logApply(message: string, data?: unknown) {
  if (data !== undefined) {
    console.log(PREFIX, message, JSON.stringify(data, null, 2));
  } else {
    console.log(PREFIX, message);
  }
}

export interface ApplyDebugInfo {
  mode: "primary" | "translation";
  productId: string;
  contentLocale: string;
  primaryLocale: string;
  suggestionLengths: Record<string, number>;
  steps: string[];
  shopifyResponses: Record<string, unknown>;
  verification?: Record<string, unknown>;
}

export function createApplyDebug(
  productId: string,
  contentLocale: string,
  primaryLocale: string,
): ApplyDebugInfo {
  return {
    mode: contentLocale === primaryLocale ? "primary" : "translation",
    productId,
    contentLocale,
    primaryLocale,
    suggestionLengths: {},
    steps: [],
    shopifyResponses: {},
  };
}
