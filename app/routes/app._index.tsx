import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData, useSearchParams } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { fetchProducts } from "../services/products.server";
import { analyzeStore } from "../services/analyzer.server";
import { generateProductSuggestions } from "../services/ai.server";
import {
  getCachedAiSuggestion,
  getOrCreateAiSuggestion,
  loadAiSuggestionsForShop,
  computeInputHash,
} from "../services/ai-cache.server";
import { applyAiSuggestionsToProduct } from "../services/product-apply.server";
import {
  assertCanConsumeAiCredit,
  BillingLimitError,
  recordAiGeneration,
  syncShopBilling,
  willBillAiGeneration,
} from "../services/billing.server";
import { toAiSuggestInput, type AiSuggestions, type AiSuggestionsMap } from "../lib/ai";
import {
  fetchShopLocales,
  getPrimaryLocale,
  resolveContentLocale,
} from "../services/locales.server";
import type { ShopLocale } from "../lib/shop-locale";
import {
  aiCacheKey,
  readStoredContentLocale,
  storeContentLocale,
} from "../lib/shop-locale";
import {
  getTranslations,
  localeTag,
  parseAiLanguage,
  parseContentLocale,
  readStoredLocale,
  storeLocale,
  type AppLocale,
} from "../lib/i18n";
import {
  filterProducts,
  getHealthTone,
  getScoreBreakdown,
  sortProducts,
  type AnalyzedProduct,
  type IssueType,
  type ProductFilter,
  type ProductSort,
} from "../lib/analyzer";
import styles from "../styles/dashboard.module.css";
import billingStyles from "../styles/billing.module.css";
import { ClientOnly } from "../components/ClientOnly";
import { Link } from "react-router";
import type { BillingSummary } from "../lib/billing";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session, billing } = await authenticate.admin(request);
  const url = new URL(request.url);
  const shopLocales = await fetchShopLocales(admin);
  const primary = getPrimaryLocale(shopLocales);
  const contentLocale = resolveContentLocale(
    shopLocales,
    url.searchParams.get("contentLocale"),
  );
  const products = await fetchProducts(admin, {
    contentLocale,
    primaryLocale: primary.locale,
  });
  const analysis = analyzeStore(products);
  const aiSuggestions = await loadAiSuggestionsForShop(
    session.shop,
    analysis.products,
    contentLocale,
  );
  const billingSummary = await syncShopBilling(session.shop, billing);

  return {
    analysis,
    analyzedAt: new Date().toISOString(),
    aiSuggestions,
    shopLocales,
    contentLocale,
    primaryLocale: primary.locale,
    billingSummary,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session, billing } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "apply-ai") {
    const productId = formData.get("productId");
    const uiLocale = parseAiLanguage(formData.get("uiLocale"));
    const primaryLocale = parseContentLocale(
      formData.get("primaryLocale"),
      "en",
    );
    const contentLocale = parseContentLocale(
      formData.get("contentLocale"),
      primaryLocale,
    );
    const errors = getTranslations(uiLocale).errors;
    if (typeof productId !== "string" || !productId) {
      return {
        intent: "apply-ai",
        productId: null,
        success: false,
        updatedFields: [] as string[],
        error: errors.missingProductId,
      };
    }

    try {
      const suggestionsJson = formData.get("suggestions");
      let suggestions: AiSuggestions | null = null;

      if (typeof suggestionsJson === "string" && suggestionsJson.trim()) {
        suggestions = JSON.parse(suggestionsJson) as AiSuggestions;
      }

      if (!suggestions) {
        const cached = await getCachedAiSuggestion(
          session.shop,
          productId,
          contentLocale,
        );
        if (!cached) {
          return {
            intent: "apply-ai",
            productId,
            success: false,
            updatedFields: [],
            error: errors.createAiFirst,
            debug: null,
          };
        }
        suggestions = cached.suggestions;
      }

      const { updatedFields, skippedFields, debug } = await applyAiSuggestionsToProduct(
        admin,
        productId,
        suggestions,
        { contentLocale, primaryLocale },
      );

      return {
        intent: "apply-ai",
        productId,
        success: true,
        updatedFields,
        skippedFields,
        error: null,
        debug,
      };
    } catch (error) {
      console.error("[Conversion Copilot Apply] action failed", error);
      return {
        intent: "apply-ai",
        productId,
        success: false,
        updatedFields: [],
        error:
          error instanceof Error ? error.message : errors.applyFailed,
        debug: null,
      };
    }
  }

  if (intent !== "ai-suggest") {
    return {
      intent: "ai-suggest",
      error: getTranslations("en").errors.invalidRequest,
      productId: null as string | null,
      suggestions: null,
      fromCache: false,
    };
  }

  const productJson = formData.get("product");
  const uiLocale = parseAiLanguage(formData.get("uiLocale"));
  const primaryLocale = parseContentLocale(formData.get("primaryLocale"), "en");
  const contentLocale = parseContentLocale(
    formData.get("contentLocale"),
    primaryLocale,
  );
  const errors = getTranslations(uiLocale).errors;

  if (typeof productJson !== "string") {
    return {
      intent: "ai-suggest",
      error: errors.missingProductData,
      productId: null,
      suggestions: null,
      fromCache: false,
      billingSummary: null,
    };
  }

  const forceRegenerate = formData.get("forceRegenerate") === "true";

  try {
    const product = JSON.parse(productJson) as ReturnType<typeof toAiSuggestInput>;
    const inputHash = computeInputHash(product);
    const willBill = await willBillAiGeneration(
      session.shop,
      product.id,
      contentLocale,
      inputHash,
      forceRegenerate,
    );

    if (willBill) {
      await assertCanConsumeAiCredit(session.shop, billing);
    }

    const { suggestions, fromCache } = await getOrCreateAiSuggestion(
      session.shop,
      product,
      contentLocale,
      () => generateProductSuggestions(product, contentLocale),
      forceRegenerate,
    );

    let billingSummary = await syncShopBilling(session.shop, billing);
    if (!fromCache && willBill) {
      billingSummary = await recordAiGeneration(session.shop, {
        productId: product.id,
        contentLocale,
      });
    }

    return {
      intent: "ai-suggest",
      productId: product.id,
      contentLocale,
      suggestions,
      fromCache,
      billingSummary,
      error: null,
    };
  } catch (error) {
    if (error instanceof BillingLimitError) {
      return {
        intent: "ai-suggest",
        productId: null,
        suggestions: null,
        fromCache: false,
        billingSummary: error.summary,
        error: errors.billingLimitExceeded,
      };
    }

    return {
      intent: "ai-suggest",
      productId: null,
      suggestions: null,
      fromCache: false,
      billingSummary: null,
      error:
        error instanceof Error ? error.message : errors.aiFailed,
    };
  }
};

const FILTER_ORDER: ProductFilter[] = [
  "all",
  "issues",
  "healthy",
  "missing_alt_text",
  "short_description",
  "missing_seo",
  "missing_image",
];

function getScoreClass(score: number) {
  const tone = getHealthTone(score);
  if (tone === "success") return styles.scoreSuccess;
  if (tone === "warning") return styles.scoreWarning;
  return styles.scoreCritical;
}

function getRingColor(score: number) {
  const tone = getHealthTone(score);
  if (tone === "success") return "#29845a";
  if (tone === "warning") return "#b98900";
  return "#e51c00";
}

function formatScanTime(iso: string, locale: AppLocale) {
  return new Intl.DateTimeFormat(localeTag(locale), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

function readFieldValue(event: Event) {
  const target = event.currentTarget as HTMLInputElement | HTMLSelectElement;
  return target.value ?? "";
}

interface DashboardContentProps {
  analysis: ReturnType<typeof analyzeStore>;
  analyzedAt: string;
  shopify: ReturnType<typeof useAppBridge>;
  initialAiSuggestions: AiSuggestionsMap;
  shopLocales: ShopLocale[];
  contentLocale: string;
  primaryLocale: string;
  initialBillingSummary: BillingSummary;
}

function DashboardContent({
  analysis,
  analyzedAt,
  shopify,
  initialAiSuggestions,
  shopLocales,
  contentLocale,
  primaryLocale,
  initialBillingSummary,
}: DashboardContentProps) {
  const [, setSearchParams] = useSearchParams();
  const aiFetcher = useFetcher<typeof action>();
  const applyFetcher = useFetcher<typeof action>();
  const { healthScore, totalProducts, healthyCount, issueSummaries, products } =
    analysis;

  const [filter, setFilter] = useState<ProductFilter>("all");
  const [sort, setSort] = useState<ProductSort>("score_asc");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedProductId, setExpandedProductId] = useState<string | null>(
    null,
  );
  const [aiLoadingProductId, setAiLoadingProductId] = useState<string | null>(
    null,
  );
  const [applyLoadingProductId, setApplyLoadingProductId] = useState<
    string | null
  >(null);
  const [confirmApplyProductId, setConfirmApplyProductId] = useState<
    string | null
  >(null);
  const [uiLocale, setUiLocale] = useState<AppLocale>(() => readStoredLocale());
  const [aiCache, setAiCache] =
    useState<AiSuggestionsMap>(initialAiSuggestions);
  const [billingSummary, setBillingSummary] = useState(initialBillingSummary);
  const strings = useMemo(() => getTranslations(uiLocale), [uiLocale]);

  const activeShopLocale = useMemo(
    () =>
      shopLocales.find((entry) => entry.locale === contentLocale) ?? {
        locale: contentLocale,
        name: contentLocale,
        primary: contentLocale === primaryLocale,
        published: true,
      },
    [shopLocales, contentLocale, primaryLocale],
  );

  const primaryShopLocaleName = useMemo(
    () =>
      shopLocales.find((entry) => entry.locale === primaryLocale)?.name ??
      primaryLocale,
    [shopLocales, primaryLocale],
  );

  const changeUiLocale = (next: AppLocale) => {
    setUiLocale(next);
    storeLocale(next);
  };

  const changeContentLocale = (next: string) => {
    storeContentLocale(next);
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      if (next === primaryLocale) {
        params.delete("contentLocale");
      } else {
        params.set("contentLocale", next);
      }
      return params;
    });
  };

  useEffect(() => {
    setAiCache(initialAiSuggestions);
  }, [initialAiSuggestions]);

  useEffect(() => {
    setBillingSummary(initialBillingSummary);
  }, [initialBillingSummary]);

  useEffect(() => {
    const stored = readStoredContentLocale(primaryLocale);
    if (stored !== contentLocale && stored !== primaryLocale) {
      changeContentLocale(stored);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (aiFetcher.state === "idle") {
      setAiLoadingProductId(null);
    }
  }, [aiFetcher.state]);

  useEffect(() => {
    if (applyFetcher.state === "idle") {
      setApplyLoadingProductId(null);
    }
  }, [applyFetcher.state]);

  useEffect(() => {
    if (aiFetcher.data?.intent !== "ai-suggest") return;

    if (aiFetcher.data.error) {
      shopify.toast.show(aiFetcher.data.error, { isError: true });
      return;
    }

    if (aiFetcher.data.suggestions && aiFetcher.data.productId) {
      const nextContentLocale = aiFetcher.data.contentLocale ?? contentLocale;
      setAiCache((current) => ({
        ...current,
        [aiCacheKey(aiFetcher.data!.productId!, nextContentLocale)]: {
          suggestions: aiFetcher.data!.suggestions!,
          createdAt: new Date().toISOString(),
          isStale: false,
          contentLocale: nextContentLocale,
        },
      }));

      if (aiFetcher.data.billingSummary) {
        setBillingSummary(aiFetcher.data.billingSummary);
      }

      if (!aiFetcher.data.fromCache) {
        shopify.toast.show(strings.toastAiSaved);
      }
    }
  }, [aiFetcher.data, shopify, contentLocale, strings.toastAiSaved]);

  useEffect(() => {
    if (applyFetcher.data?.intent !== "apply-ai") return;

    console.log("[Conversion Copilot Apply] response", applyFetcher.data);

    if (applyFetcher.data.error) {
      shopify.toast.show(applyFetcher.data.error, { isError: true });
      return;
    }

    if (applyFetcher.data.success && applyFetcher.data.productId) {
      const mode = applyFetcher.data.debug?.mode;
      const verifiedDescription =
        applyFetcher.data.debug?.verification?.descriptionHtml;
      const descriptionPreview =
        typeof verifiedDescription === "string"
          ? verifiedDescription.slice(0, 80)
          : "";
      const skipped = applyFetcher.data.skippedFields ?? [];
      const applied = applyFetcher.data.updatedFields.join(", ");

      shopify.toast.show(
        mode === "translation"
          ? skipped.length > 0
            ? `Applied: ${applied}. Skipped: ${skipped.join(", ")}. Open product → Languages → ${contentLocale.toUpperCase()}`
            : `Applied: ${applied}. Open product → Languages → ${contentLocale.toUpperCase()} to view translation`
          : strings.toastApplied(applied),
      );

      if (descriptionPreview) {
        console.log(
          "[Conversion Copilot Apply] verified description preview:",
          descriptionPreview,
        );
      } else {
        console.warn(
          "[Conversion Copilot Apply] verification shows empty description — see terminal logs",
        );
      }

      window.location.reload();
    }
  }, [applyFetcher.data, shopify, strings, contentLocale]);

  const issueCount = totalProducts - healthyCount;
  const breakdown = useMemo(() => getScoreBreakdown(products), [products]);
  const totalIssueInstances = breakdown.reduce((sum, item) => sum + item.count, 0);

  const visibleProducts = useMemo(() => {
    const filtered = filterProducts(products, filter, searchQuery);
    return sortProducts(filtered, sort);
  }, [products, filter, searchQuery, sort]);

  const toggleFilter = (next: ProductFilter) => {
    setFilter((current) => (current === next ? "all" : next));
  };

  const toggleExpand = (productId: string) => {
    setExpandedProductId((current) =>
      current === productId ? null : productId,
    );
  };

  const requestAiSuggestion = (
    product: AnalyzedProduct,
    forceRegenerate = false,
  ) => {
    setExpandedProductId(product.id);

    const cacheKey = aiCacheKey(product.id, contentLocale);
    const cached = aiCache[cacheKey];
    if (!forceRegenerate && cached && !cached.isStale) {
      return;
    }

    setAiLoadingProductId(product.id);
    aiFetcher.submit(
      {
        intent: "ai-suggest",
        product: JSON.stringify(toAiSuggestInput(product)),
        contentLocale,
        primaryLocale,
        uiLocale,
        forceRegenerate: forceRegenerate ? "true" : "false",
      },
      { method: "post" },
    );
  };

  const formatAiCacheTime = (iso: string) =>
    new Intl.DateTimeFormat(localeTag(uiLocale), {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));

  const openApplyConfirm = (product: AnalyzedProduct) => {
    setConfirmApplyProductId(product.id);
  };

  const closeApplyConfirm = () => {
    setConfirmApplyProductId(null);
  };

  const confirmApplyToShopify = (
    productId: string,
    suggestions: AiSuggestions,
  ) => {
    setConfirmApplyProductId(null);
    setApplyLoadingProductId(productId);
    console.log("[Conversion Copilot Apply] submitting", {
      productId,
      contentLocale,
      primaryLocale,
      suggestionLengths: {
        description: suggestions.suggestedDescription.length,
        seoTitle: suggestions.suggestedSeoTitle.length,
        seoDescription: suggestions.suggestedSeoDescription.length,
        altText: suggestions.suggestedAltText.length,
      },
    });
    applyFetcher.submit(
      {
        intent: "apply-ai",
        productId,
        contentLocale,
        primaryLocale,
        uiLocale,
        suggestions: JSON.stringify(suggestions),
      },
      { method: "post" },
    );
  };

  const copySuggestion = async (label: string, value: string) => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    shopify.toast.show(strings.copied(label));
  };

  return (
    <>
      <s-section>
        <div className={styles.dashboard}>
          <div className={styles.statsGrid}>
            <div className={styles.healthCard}>
              <div
                className={styles.healthRing}
                style={
                  {
                    "--score": healthScore,
                    "--ring-color": getRingColor(healthScore),
                  } as CSSProperties
                }
              >
                <div className={styles.healthRingValue}>
                  {healthScore}
                  <span>/100</span>
                </div>
              </div>
              <div className={styles.healthMeta}>
                <h2>{strings.storeHealth}</h2>
                <p>{strings.storeHealthDesc}</p>
                <p className={styles.scanMeta}>
                  {strings.lastScan}: {formatScanTime(analyzedAt, uiLocale)}
                </p>
              </div>
            </div>

            <div className={styles.statCard}>
              <span className={styles.statLabel}>{strings.productsWithIssues}</span>
              <span className={styles.statValue}>{issueCount}</span>
              <span className={styles.statHint}>
                {totalProducts > 0
                  ? strings.percentAffected(
                      Math.round((issueCount / totalProducts) * 100),
                    )
                  : strings.noAnalysisYet}
              </span>
            </div>

            <div className={styles.statCard}>
              <span className={styles.statLabel}>{strings.healthyProducts}</span>
              <span className={styles.statValue}>{healthyCount}</span>
              <span className={styles.statHint}>
                {strings.healthyHint(healthyCount, totalProducts)}
              </span>
            </div>
          </div>

          {breakdown.length > 0 && (
            <div className={styles.breakdownCard}>
              <p className={styles.breakdownTitle}>{strings.issueBreakdown}</p>
              <div className={styles.breakdownBar}>
                {breakdown.map((item) => (
                  <div
                    key={item.type}
                    className={styles.breakdownSegment}
                    style={{
                      width: `${(item.count / totalIssueInstances) * 100}%`,
                      background: item.color,
                    }}
                    title={`${strings.issueLabels[item.type]}: ${item.count}`}
                  />
                ))}
              </div>
              <div className={styles.breakdownLegend}>
                {breakdown.map((item) => (
                  <span key={item.type} className={styles.legendItem}>
                    <span
                      className={styles.legendDot}
                      style={{ background: item.color }}
                    />
                    {strings.issueLabels[item.type]} ({item.count})
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </s-section>

      <s-section heading={strings.seoIssues}>
        {issueSummaries.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyStateIcon}>✅</div>
            <p className={styles.emptyStateTitle}>{strings.noSeoIssues}</p>
            <p className={styles.emptyStateText}>{strings.noSeoIssuesDesc}</p>
          </div>
        ) : (
          <s-stack direction="block" gap="small">
            {issueSummaries.map((issue) => (
              <div
                key={issue.type}
                className={
                  filter === issue.type
                    ? styles.issueRowActive
                    : styles.issueRowClickable
                }
              >
                <s-clickable onClick={() => toggleFilter(issue.type as IssueType)}>
                  <div className={styles.issueRowInner}>
                    <div className={styles.issueLeft}>
                      <div className={styles.issueIcon}>⚠️</div>
                      <p className={styles.issueText}>
                        <strong>{issue.count}</strong>{" "}
                        {strings.issueSummaries[issue.type]}
                      </p>
                    </div>
                    <s-badge tone="warning">
                      {strings.pointsPerProduct(issue.penalty)}
                    </s-badge>
                  </div>
                </s-clickable>
              </div>
            ))}
          </s-stack>
        )}
      </s-section>

      <s-section heading={strings.productStatus}>
        {products.length === 0 ? (
          <s-banner tone="info" heading={strings.noProducts}>
            {strings.noProductsDesc}
          </s-banner>
        ) : (
          <div className={styles.tableWrap}>
            <div className={styles.controlsPanel}>
              <div className={styles.controlsHeader}>
                <p className={styles.controlsLabel}>{strings.filter}</p>
                <button
                  type="button"
                  className={styles.dashBtnSecondary}
                  onClick={() => window.location.reload()}
                >
                  {strings.rescan}
                </button>
              </div>
              <div className={styles.controlsRow}>
                <div className={styles.controlsGroup}>
                  <p className={styles.controlsSubLabel}>{strings.filter}</p>
                  <div className={styles.productRowActions}>
                    {FILTER_ORDER.map((key) => (
                      <button
                        key={key}
                        type="button"
                        className={
                          filter === key
                            ? styles.dashBtnPrimary
                            : styles.dashBtnSecondary
                        }
                        onClick={() => setFilter(key)}
                      >
                        {strings.filters[key]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className={styles.controlsGroup}>
                  <p className={styles.controlsSubLabel}>{strings.uiLanguage}</p>
                  <div className={styles.productRowActions}>
                    <button
                      type="button"
                      className={
                        uiLocale === "en"
                          ? styles.dashBtnPrimary
                          : styles.dashBtnSecondary
                      }
                      onClick={() => changeUiLocale("en")}
                    >
                      English
                    </button>
                    <button
                      type="button"
                      className={
                        uiLocale === "tr"
                          ? styles.dashBtnPrimary
                          : styles.dashBtnSecondary
                      }
                      onClick={() => changeUiLocale("tr")}
                    >
                      Türkçe
                    </button>
                  </div>
                </div>
                <div className={styles.controlsGroup}>
                  <div className={styles.controlsLabelRow}>
                    <p className={styles.controlsSubLabel}>
                      {strings.contentLocale}
                    </p>
                    <span className={styles.infoTooltipWrap}>
                      <button
                        type="button"
                        className={styles.infoButton}
                        aria-label={strings.contentLocaleInfoLabel}
                      >
                        i
                      </button>
                      <span className={styles.infoTooltip} role="tooltip">
                        {strings.contentLocaleInfoTooltip(primaryShopLocaleName)}
                      </span>
                    </span>
                  </div>
                  <div className={styles.sortFieldWrap}>
                    <s-select
                      label={strings.contentLocale}
                      labelAccessibilityVisibility="exclusive"
                      value={contentLocale}
                      onChange={(event) =>
                        changeContentLocale(readFieldValue(event))
                      }
                    >
                      {shopLocales.map((entry) => (
                        <s-option key={entry.locale} value={entry.locale}>
                          {entry.name}
                          {entry.primary ? ` (${strings.primaryLocale})` : ""}
                        </s-option>
                      ))}
                    </s-select>
                  </div>
                </div>
              </div>

              {contentLocale !== primaryLocale && (
                <p className={styles.contentLocaleBanner}>
                  {strings.contentLocaleActive(activeShopLocale.name)}
                </p>
              )}

              <div className={styles.toolbarRow}>
                <div className={styles.searchFieldWrap}>
                  <s-search-field
                    label={strings.searchProducts}
                    labelAccessibilityVisibility="exclusive"
                    placeholder={strings.searchPlaceholder}
                    value={searchQuery}
                    onInput={(event) =>
                      setSearchQuery(readFieldValue(event))
                    }
                    onChange={(event) =>
                      setSearchQuery(readFieldValue(event))
                    }
                  />
                </div>
                <div className={styles.sortFieldWrap}>
                  <s-select
                    label={strings.sort}
                    labelAccessibilityVisibility="exclusive"
                    value={sort}
                    onChange={(event) =>
                      setSort(readFieldValue(event) as ProductSort)
                    }
                  >
                    <s-option value="score_asc">{strings.sortScoreAsc}</s-option>
                    <s-option value="score_desc">{strings.sortScoreDesc}</s-option>
                    <s-option value="name_asc">{strings.sortNameAsc}</s-option>
                  </s-select>
                </div>
              </div>

              <p className={styles.activeFilterText}>
                {strings.showingProducts(visibleProducts.length, totalProducts)}
                {filter !== "all"
                  ? strings.filterActive(strings.filters[filter])
                  : ""}
                {searchQuery ? strings.searchActive(searchQuery) : ""}
              </p>
            </div>

            {visibleProducts.length === 0 ? (
              <div className={styles.emptyStateInTable}>
                <p className={styles.emptyStateTitle}>{strings.noResults}</p>
                <p className={styles.emptyStateText}>{strings.noResultsDesc}</p>
                <button
                  type="button"
                  className={styles.dashBtnSecondary}
                  onClick={() => {
                    setFilter("all");
                    setSearchQuery("");
                  }}
                >
                  {strings.clearFilters}
                </button>
              </div>
            ) : (
              visibleProducts.map((product) => {
                const isExpanded = expandedProductId === product.id;
                const isAiLoading =
                  aiLoadingProductId === product.id &&
                  aiFetcher.state !== "idle";
                const cacheKey = aiCacheKey(product.id, contentLocale);
                const cachedEntry = aiCache[cacheKey];
                const aiResult =
                  aiFetcher.data?.intent === "ai-suggest" &&
                  aiFetcher.data.productId === product.id &&
                  (aiFetcher.data.contentLocale ?? contentLocale) ===
                    contentLocale &&
                  aiFetcher.data.suggestions
                    ? aiFetcher.data.suggestions
                    : cachedEntry && !cachedEntry.isStale
                      ? cachedEntry.suggestions
                      : null;
                const isApplying =
                  applyLoadingProductId === product.id &&
                  applyFetcher.state !== "idle";
                const showStaleWarning =
                  cachedEntry?.isStale && !isAiLoading && !aiResult;
                const showMissingLanguageHint =
                  isExpanded &&
                  !product.isHealthy &&
                  !isAiLoading &&
                  !aiResult &&
                  !showStaleWarning;

                return (
                  <div
                    key={product.id}
                    className={styles.productRowExpandable}
                  >
                    <div className={styles.productRow}>
                      <div className={styles.productRowTop}>
                        {product.featuredImageUrl ? (
                          <img
                            className={styles.thumbnail}
                            src={product.featuredImageUrl}
                            alt={product.title}
                          />
                        ) : (
                          <div className={styles.thumbnailPlaceholder}>📦</div>
                        )}

                        <button
                          type="button"
                          className={styles.dashBtnSoft}
                          onClick={() => toggleExpand(product.id)}
                        >
                          {product.title}
                        </button>
                      </div>

                      <div className={styles.productRowIssues}>
                        {product.isHealthy ? (
                          <span className={styles.issueTagHealthy}>
                            {strings.healthy}
                          </span>
                        ) : (
                          product.issues.map((issue) => (
                            <span key={issue.type} className={styles.issueTag}>
                              {strings.issueLabels[issue.type]}
                            </span>
                          ))
                        )}
                      </div>

                      <div className={styles.productRowFooter}>
                        <div className={styles.productRowActions}>
                          {!product.isHealthy && (
                            <button
                              type="button"
                              className={styles.dashBtnSoft}
                              onClick={() => toggleExpand(product.id)}
                            >
                              {isExpanded ? strings.hide : strings.suggest}
                            </button>
                          )}
                          {!product.isHealthy && (
                            <button
                              type="button"
                              className={styles.dashBtnPrimary}
                              onClick={() => requestAiSuggestion(product)}
                              disabled={isAiLoading}
                            >
                              {isAiLoading
                                ? strings.generating
                                : cachedEntry && !cachedEntry.isStale
                                  ? strings.aiShow
                                  : strings.aiSuggest}
                            </button>
                          )}
                          <button
                            type="button"
                            className={styles.dashBtnSecondary}
                            onClick={() => {
                              shopify.intents.invoke?.("edit:shopify/Product", {
                                value: product.id,
                              });
                            }}
                          >
                            {strings.edit}
                          </button>
                        </div>

                        <span className={getScoreClass(product.score)}>
                          {product.score}
                        </span>
                      </div>
                    </div>

                    {isExpanded && !product.isHealthy && (
                      <div className={styles.fixPanel}>
                        <ul className={styles.fixList}>
                          {product.issues.map((issue) => (
                            <li key={issue.type} className={styles.fixItem}>
                              <strong>{strings.issueLabels[issue.type]}:</strong>
                              <span>{strings.fixTips[issue.type]}</span>
                            </li>
                          ))}
                        </ul>

                        {isAiLoading && (
                          <div className={styles.aiPanel}>
                            <s-stack direction="inline" gap="small">
                              <s-spinner accessibilityLabel={strings.aiGenerating} />
                              <s-text>{strings.aiGenerating}</s-text>
                            </s-stack>
                          </div>
                        )}

                        {showStaleWarning && (
                          <div className={styles.aiStaleBanner}>
                            <p>{strings.staleWarning}</p>
                            <button
                              type="button"
                              className={styles.dashBtnSecondary}
                              onClick={() =>
                                requestAiSuggestion(product, true)
                              }
                            >
                              {strings.regenerate}
                            </button>
                          </div>
                        )}

                        {showMissingLanguageHint && (
                          <div className={styles.aiLanguageHint}>
                            <p>{strings.noAiForLanguage}</p>
                          </div>
                        )}

                        {aiResult && (
                          <div className={styles.aiPanel}>
                            <div className={styles.aiPanelHeader}>
                              <p className={styles.aiPanelTitle}>
                                {strings.aiSuggestions}
                              </p>
                              <span className={styles.aiCacheMeta}>
                                {activeShopLocale.name}
                                {cachedEntry && !cachedEntry.isStale
                                  ? ` · ${strings.saved} · ${formatAiCacheTime(cachedEntry.createdAt)}`
                                  : ""}
                              </span>
                            </div>
                            <p className={styles.aiPriority}>{aiResult.priority}</p>
                            <p className={styles.aiSummary}>{aiResult.summary}</p>

                            <AiSuggestionField
                              label={strings.suggestedDescription}
                              value={aiResult.suggestedDescription}
                              copyLabel={strings.copy}
                              onCopy={() =>
                                copySuggestion(
                                  strings.suggestedDescription,
                                  aiResult.suggestedDescription,
                                )
                              }
                            />
                            <AiSuggestionField
                              label={strings.seoTitle}
                              value={aiResult.suggestedSeoTitle}
                              copyLabel={strings.copy}
                              onCopy={() =>
                                copySuggestion(
                                  strings.seoTitle,
                                  aiResult.suggestedSeoTitle,
                                )
                              }
                            />
                            <AiSuggestionField
                              label={strings.seoDescription}
                              value={aiResult.suggestedSeoDescription}
                              copyLabel={strings.copy}
                              onCopy={() =>
                                copySuggestion(
                                  strings.seoDescription,
                                  aiResult.suggestedSeoDescription,
                                )
                              }
                            />
                            <AiSuggestionField
                              label={strings.altText}
                              value={aiResult.suggestedAltText}
                              copyLabel={strings.copy}
                              onCopy={() =>
                                copySuggestion(
                                  strings.altText,
                                  aiResult.suggestedAltText,
                                )
                              }
                            />

                            {confirmApplyProductId === product.id ? (
                              <div className={styles.applyConfirmInline}>
                                <div className={styles.applyConfirmBody}>
                                  <p className={styles.applyConfirmLead}>
                                    {uiLocale === "tr" ? (
                                      <>
                                        <strong>{product.title}</strong>
                                        {strings.applyConfirmLeadTrAfter}
                                      </>
                                    ) : (
                                      <>
                                        {strings.applyConfirmLeadEnBefore}
                                        <strong>{product.title}</strong>
                                        {strings.applyConfirmLeadEnAfter}
                                      </>
                                    )}
                                  </p>
                                  <p className={styles.applyConfirmHint}>
                                    {strings.applyConfirmFields}
                                  </p>
                                  <ul className={styles.applyConfirmList}>
                                    <li>{strings.applyFieldDescription}</li>
                                    <li>{strings.applyFieldSeo}</li>
                                    <li>{strings.applyFieldAlt}</li>
                                  </ul>
                                  <p className={styles.applyConfirmNote}>
                                    {strings.applyConfirmNote}
                                  </p>
                                </div>
                                <div className={styles.productRowActions}>
                                  <button
                                    type="button"
                                    className={styles.dashBtnPrimary}
                                    onClick={() =>
                                      aiResult &&
                                      confirmApplyToShopify(product.id, aiResult)
                                    }
                                    disabled={isApplying}
                                  >
                                    {isApplying
                                      ? strings.applying
                                      : strings.confirmApply}
                                  </button>
                                  <button
                                    type="button"
                                    className={styles.dashBtnSecondary}
                                    onClick={closeApplyConfirm}
                                    disabled={isApplying}
                                  >
                                    {strings.cancel}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className={styles.productRowActions}>
                                <button
                                  type="button"
                                  className={styles.dashBtnPrimary}
                                  onClick={() => openApplyConfirm(product)}
                                  disabled={isApplying}
                                >
                                  {isApplying
                                    ? strings.applying
                                    : strings.applyToShopify}
                                </button>
                                <button
                                  type="button"
                                  className={styles.dashBtnSecondary}
                                  onClick={() =>
                                    requestAiSuggestion(product, true)
                                  }
                                  disabled={isAiLoading}
                                >
                                  {isAiLoading
                                    ? strings.generating
                                    : strings.regenerate}
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </s-section>

      <s-section slot="aside" heading={strings.billingCompactTitle}>
        <div className={billingStyles.billingCompactCard}>
          <div className={billingStyles.billingCompactHeader}>
            <p className={billingStyles.billingCompactTitle}>
              {billingSummary.planName}
            </p>
            <Link to="/app/billing" className={billingStyles.billingCompactLink}>
              {strings.billingManagePlans}
            </Link>
          </div>
          <p className={billingStyles.billingCompactMeta}>
            {strings.billingCreditsUsed(
              billingSummary.aiCreditsUsed,
              billingSummary.monthlyAiCredits,
            )}
          </p>
          <div className={billingStyles.usageBarTrack}>
            <div
              className={billingStyles.usageBarFill}
              style={{
                width: `${Math.min(100, (billingSummary.aiCreditsUsed / Math.max(billingSummary.monthlyAiCredits, 1)) * 100)}%`,
              }}
            />
          </div>
          <p className={billingStyles.billingCompactMeta}>
            {strings.billingCostNote(billingSummary.estimatedAiCostUsd)}
          </p>
          {billingSummary.aiCreditsRemaining === 0 && (
            <p className={billingStyles.billingCompactWarning}>
              {strings.billingNoCredits}{" "}
              <Link to="/app/billing">{strings.billingManagePlans}</Link>
            </p>
          )}
          {billingSummary.aiCreditsRemaining > 0 &&
            billingSummary.aiCreditsRemaining <= 10 && (
              <p className={billingStyles.billingCompactWarning}>
                {strings.billingLowCredits(billingSummary.aiCreditsRemaining)}{" "}
                <Link to="/app/billing">{strings.billingManagePlans}</Link>
              </p>
            )}
        </div>
      </s-section>

      <s-section slot="aside" heading={strings.analysisRules}>
        <s-unordered-list>
          <s-list-item>{strings.ruleAltText}</s-list-item>
          <s-list-item>{strings.ruleShortDesc}</s-list-item>
          <s-list-item>{strings.ruleSeo}</s-list-item>
          <s-list-item>{strings.ruleImage}</s-list-item>
          <s-list-item>{strings.ruleAi}</s-list-item>
          <s-list-item>{strings.ruleLanguage}</s-list-item>
        </s-unordered-list>
      </s-section>
    </>
  );
}

function AiSuggestionField({
  label,
  value,
  copyLabel,
  onCopy,
}: {
  label: string;
  value: string;
  copyLabel: string;
  onCopy: () => void;
}) {
  if (!value) return null;

  return (
    <div className={styles.aiField}>
      <div className={styles.aiFieldHeader}>
        <span className={styles.aiFieldLabel}>{label}</span>
        <button type="button" className={styles.dashBtnSoft} onClick={onCopy}>
          {copyLabel}
        </button>
      </div>
      <p className={styles.aiFieldValue}>{value}</p>
    </div>
  );
}

export default function Index() {
  const {
    analysis,
    analyzedAt,
    aiSuggestions,
    shopLocales,
    contentLocale,
    primaryLocale,
    billingSummary,
  } = useLoaderData<typeof loader>();
  const shopify = useAppBridge();
  const fallbackStrings = getTranslations("en");

  return (
    <s-page heading={fallbackStrings.pageTitle}>
      <ClientOnly
        fallback={
          <s-section>
            <s-stack direction="inline" gap="base">
              <s-spinner accessibilityLabel={fallbackStrings.loading} />
              <s-text>{fallbackStrings.loading}</s-text>
            </s-stack>
          </s-section>
        }
      >
        <DashboardContent
          analysis={analysis}
          analyzedAt={analyzedAt}
          shopify={shopify}
          initialAiSuggestions={aiSuggestions}
          shopLocales={shopLocales}
          contentLocale={contentLocale}
          primaryLocale={primaryLocale}
          initialBillingSummary={billingSummary}
        />
      </ClientOnly>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
