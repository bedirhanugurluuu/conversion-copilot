export interface AiSuggestInput {
  id: string;
  title: string;
  descriptionPlain: string;
  seoTitle: string | null;
  seoDescription: string | null;
  issues: string[];
  imageCount: number;
}

export interface AiSuggestions {
  priority: string;
  summary: string;
  suggestedDescription: string;
  suggestedSeoTitle: string;
  suggestedSeoDescription: string;
  suggestedAltText: string;
}

export interface AiCachedEntry {
  suggestions: AiSuggestions;
  createdAt: string;
  isStale: boolean;
  contentLocale: string;
}

export type AiSuggestionsMap = Record<string, AiCachedEntry>;

export function toAiSuggestInput(product: {
  id: string;
  title: string;
  descriptionPlain: string;
  seoTitle: string | null;
  seoDescription: string | null;
  imageCount: number;
  issues: Array<{ label: string }>;
}): AiSuggestInput {
  return {
    id: product.id,
    title: product.title,
    descriptionPlain: product.descriptionPlain,
    seoTitle: product.seoTitle,
    seoDescription: product.seoDescription,
    imageCount: product.imageCount,
    issues: product.issues.map((issue) => issue.label),
  };
}
