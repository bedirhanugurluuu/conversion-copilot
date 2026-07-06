export type IssueType =
  | "missing_alt_text"
  | "short_description"
  | "missing_seo"
  | "missing_image";

export interface ProductIssue {
  type: IssueType;
  penalty: number;
  label: string;
}

export interface AnalyzedProduct {
  id: string;
  title: string;
  featuredImageUrl: string | null;
  descriptionPlain: string;
  seoTitle: string | null;
  seoDescription: string | null;
  imageCount: number;
  issues: ProductIssue[];
  score: number;
  isHealthy: boolean;
}

export interface IssueSummary {
  type: IssueType;
  label: string;
  count: number;
  penalty: number;
}

export interface StoreAnalysis {
  healthScore: number;
  totalProducts: number;
  healthyCount: number;
  issueSummaries: IssueSummary[];
  products: AnalyzedProduct[];
}

export type ProductFilter = IssueType | "all" | "healthy" | "issues";

export type ProductSort = "score_asc" | "score_desc" | "name_asc";

export const ISSUE_CONFIG: Record<
  IssueType,
  { penalty: number; label: string; pluralLabel: string }
> = {
  missing_alt_text: {
    penalty: 5,
    label: "Alt text eksik",
    pluralLabel: "ürünün alt text'i eksik",
  },
  short_description: {
    penalty: 5,
    label: "Kısa açıklama",
    pluralLabel: "ürünün açıklaması çok kısa",
  },
  missing_seo: {
    penalty: 10,
    label: "SEO eksik",
    pluralLabel: "ürünün SEO bilgisi eksik",
  },
  missing_image: {
    penalty: 5,
    label: "Görsel eksik",
    pluralLabel: "üründe görsel yok",
  },
};

export const ISSUE_FIX_TIPS: Record<IssueType, string> = {
  missing_alt_text:
    "Ürün görsellerine açıklayıcı alt text ekleyin: Products → ürünü aç → görsele tıkla → Alt text.",
  short_description:
    "Ürün açıklamasını en az 100 karakter olacak şekilde genişletin. Özellikler ve faydaları ekleyin.",
  missing_seo:
    "Search engine listing bölümünden SEO title ve meta description doldurun.",
  missing_image:
    "Ürüne en az bir kaliteli görsel ekleyin. Müşteriler görsel olmadan satın alma eğiliminde değildir.",
};

const BREAKDOWN_COLORS: Record<IssueType, string> = {
  missing_alt_text: "#b98900",
  short_description: "#2c6ecb",
  missing_seo: "#e51c00",
  missing_image: "#8a6116",
};

export interface ScoreBreakdownItem {
  type: IssueType;
  label: string;
  count: number;
  color: string;
}

export function getHealthTone(
  score: number,
): "success" | "warning" | "critical" {
  if (score >= 80) return "success";
  if (score >= 60) return "warning";
  return "critical";
}

export function filterProducts(
  products: AnalyzedProduct[],
  filter: ProductFilter,
  searchQuery: string,
): AnalyzedProduct[] {
  const query = searchQuery.trim().toLowerCase();

  return products.filter((product) => {
    if (filter === "healthy" && !product.isHealthy) return false;
    if (filter === "issues" && product.isHealthy) return false;
    if (filter !== "all" && filter !== "healthy" && filter !== "issues") {
      if (!product.issues.some((issue) => issue.type === filter)) return false;
    }
    if (query && !product.title.toLowerCase().includes(query)) return false;
    return true;
  });
}

export function sortProducts(
  products: AnalyzedProduct[],
  sort: ProductSort,
): AnalyzedProduct[] {
  const sorted = [...products];

  switch (sort) {
    case "score_desc":
      return sorted.sort((a, b) => b.score - a.score);
    case "name_asc":
      return sorted.sort((a, b) => a.title.localeCompare(b.title, "tr"));
    case "score_asc":
    default:
      return sorted.sort((a, b) => a.score - b.score);
  }
}

export function getScoreBreakdown(
  products: AnalyzedProduct[],
): ScoreBreakdownItem[] {
  const counts = new Map<IssueType, number>();

  for (const product of products) {
    for (const issue of product.issues) {
      counts.set(issue.type, (counts.get(issue.type) ?? 0) + 1);
    }
  }

  return (Object.keys(ISSUE_CONFIG) as IssueType[])
    .filter((type) => (counts.get(type) ?? 0) > 0)
    .map((type) => ({
      type,
      label: ISSUE_CONFIG[type].label,
      count: counts.get(type) ?? 0,
      color: BREAKDOWN_COLORS[type],
    }));
}

export function buildIssueSummaries(
  products: AnalyzedProduct[],
): IssueSummary[] {
  const counts = new Map<IssueType, number>();

  for (const product of products) {
    for (const issue of product.issues) {
      counts.set(issue.type, (counts.get(issue.type) ?? 0) + 1);
    }
  }

  return (Object.keys(ISSUE_CONFIG) as IssueType[])
    .filter((type) => (counts.get(type) ?? 0) > 0)
    .map((type) => ({
      type,
      label: ISSUE_CONFIG[type].pluralLabel,
      count: counts.get(type) ?? 0,
      penalty: ISSUE_CONFIG[type].penalty,
    }));
}
