import type { Product } from "../services/products.server";
import {
  buildIssueSummaries,
  ISSUE_CONFIG,
  type AnalyzedProduct,
  type ProductIssue,
  type StoreAnalysis,
} from "../lib/analyzer";

const MIN_DESCRIPTION_LENGTH = 100;

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function analyzeProduct(product: Product): AnalyzedProduct {
  const issues: ProductIssue[] = [];

  if (product.images.length < 1) {
    const config = ISSUE_CONFIG.missing_image;
    issues.push({
      type: "missing_image",
      penalty: config.penalty,
      label: config.label,
    });
  }

  if (
    product.images.length > 0 &&
    product.images.some((image) => !image.altText?.trim())
  ) {
    const config = ISSUE_CONFIG.missing_alt_text;
    issues.push({
      type: "missing_alt_text",
      penalty: config.penalty,
      label: config.label,
    });
  }

  const plainDescription = stripHtml(product.descriptionHtml);
  if (plainDescription.length < MIN_DESCRIPTION_LENGTH) {
    const config = ISSUE_CONFIG.short_description;
    issues.push({
      type: "short_description",
      penalty: config.penalty,
      label: config.label,
    });
  }

  const seoTitle = product.seo.title?.trim();
  const seoDescription = product.seo.description?.trim();
  if (!seoTitle || !seoDescription) {
    const config = ISSUE_CONFIG.missing_seo;
    issues.push({
      type: "missing_seo",
      penalty: config.penalty,
      label: config.label,
    });
  }

  const totalPenalty = issues.reduce((sum, issue) => sum + issue.penalty, 0);
  const score = Math.max(0, 100 - totalPenalty);

  return {
    id: product.id,
    title: product.title,
    featuredImageUrl:
      product.featuredImage?.url ?? product.images[0]?.url ?? null,
    descriptionPlain: plainDescription,
    seoTitle: product.seo.title?.trim() || null,
    seoDescription: product.seo.description?.trim() || null,
    imageCount: product.images.length,
    issues,
    score,
    isHealthy: issues.length === 0,
  };
}

export function analyzeStore(products: Product[]): StoreAnalysis {
  const analyzedProducts = products.map(analyzeProduct);
  const healthyCount = analyzedProducts.filter((p) => p.isHealthy).length;
  const totalProducts = analyzedProducts.length;

  const healthScore =
    totalProducts === 0
      ? 100
      : Math.round(
          analyzedProducts.reduce((sum, product) => sum + product.score, 0) /
            totalProducts,
        );

  return {
    healthScore,
    totalProducts,
    healthyCount,
    issueSummaries: buildIssueSummaries(analyzedProducts),
    products: analyzedProducts.sort((a, b) => a.score - b.score),
  };
}
