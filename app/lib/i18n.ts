import type { IssueType, ProductFilter } from "./analyzer";

export type AppLocale = "en" | "tr";

export const DEFAULT_LOCALE: AppLocale = "en";
export const LOCALE_STORAGE_KEY = "conversion-copilot-locale";

export type AiLanguage = AppLocale;

export function parseLocale(value: FormDataEntryValue | null): AppLocale {
  return value === "tr" ? "tr" : "en";
}

export function parseAiLanguage(value: FormDataEntryValue | null): AppLocale {
  return value === "tr" ? "tr" : "en";
}

export function parseContentLocale(
  value: FormDataEntryValue | null,
  fallback: string,
): string {
  if (typeof value !== "string" || !value.trim()) return fallback;
  return value.trim();
}

export function readStoredLocale(): AppLocale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  return stored === "tr" ? "tr" : DEFAULT_LOCALE;
}

export function storeLocale(locale: AppLocale) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
}

const en = {
  pageTitle: "Conversion Copilot",
  loading: "Loading analysis...",
  storeHealth: "Store Health",
  storeHealthDesc:
    "Your store's SEO health score — the average across all product scores.",
  lastScan: "Last scan",
  productsWithIssues: "Products with issues",
  healthyProducts: "Healthy products",
  percentAffected: (pct: number) => `${pct}% of products affected`,
  noAnalysisYet: "No analysis yet",
  healthyHint: (healthy: number, total: number) =>
    `${healthy} of ${total} products are healthy`,
  issueBreakdown: "Issue breakdown",
  seoIssues: "SEO Issues",
  noSeoIssues: "Great — no SEO issues",
  noSeoIssuesDesc:
    "All products passed alt text, description, SEO, and image checks.",
  productStatus: "Product Status",
  noProducts: "No products yet",
  noProductsDesc:
    "Add test products in Shopify Admin → Products, then refresh this page.",
  filter: "Filter",
  rescan: "Rescan",
  language: "Language",
  uiLanguage: "App language",
  contentLocale: "Store locale",
  contentLocaleInfoLabel: "How store locale works",
  contentLocaleInfoTooltip: (primaryName: string) =>
    `Chooses which Shopify language is analyzed and where Apply to Shopify writes content.\n\nPrimary (${primaryName}): updates the main product fields in the default product editor — Description, SEO, and image alt text.\n\nOther languages: saves translations. In Shopify Admin, open the product and switch to that language (or use Translate) to view them. The ${primaryName} editor may stay empty.`,
  primaryLocale: "Primary",
  contentLocaleActive: (name: string) =>
    `Analyzing and applying content for ${name}. Translations are saved to this Shopify locale.`,
  searchProducts: "Search products",
  searchPlaceholder: "Type a product name...",
  sort: "Sort",
  sortScoreAsc: "Score: Low → High",
  sortScoreDesc: "Score: High → Low",
  sortNameAsc: "Name: A → Z",
  showingProducts: (visible: number, total: number) =>
    `Showing ${visible} / ${total} products`,
  filterActive: (label: string) => ` · Filter: ${label}`,
  searchActive: (query: string) => ` · Search: "${query}"`,
  noResults: "No results found",
  noResultsDesc: "Try changing your filters or search criteria.",
  clearFilters: "Clear filters",
  healthy: "Healthy",
  suggest: "Tips",
  hide: "Hide",
  aiSuggest: "AI Suggest",
  aiShow: "Show AI",
  generating: "Generating...",
  edit: "Edit",
  aiGenerating: "Generating AI suggestions...",
  staleWarning:
    "Product details changed. Regenerate for an up-to-date suggestion.",
  regenerate: "Regenerate",
  noAiForLanguage:
    "No saved AI suggestion in this language yet. Click AI Suggest to generate one.",
  aiSuggestions: "AI Suggestions",
  saved: "Saved",
  suggestedDescription: "Suggested description",
  seoTitle: "SEO title",
  seoDescription: "SEO description",
  altText: "Alt text",
  copy: "Copy",
  copied: (label: string) => `${label} copied`,
  applyConfirmLeadEnBefore: "Saved AI suggestions for ",
  applyConfirmLeadEnAfter: " will be written to the Shopify product.",
  applyConfirmLeadTrAfter: " için kayıtlı AI önerileri Shopify ürününe yazılacak.",
  applyConfirmFields: "Fields to update:",
  applyFieldDescription: "Product description",
  applyFieldSeo: "SEO title and description",
  applyFieldAlt: "Main image alt text (if available)",
  applyConfirmNote: "Existing content will be replaced with these suggestions.",
  confirmApply: "Yes, apply",
  applying: "Applying...",
  cancel: "Cancel",
  applyToShopify: "Apply to Shopify",
  analysisRules: "Scoring rules",
  ruleAltText: "Missing image alt text → -5 points",
  ruleShortDesc: "Description under 100 characters → -5 points",
  ruleSeo: "Missing SEO title or description → -10 points",
  ruleImage: "No images → -5 points",
  ruleAi:
    "AI Suggest: generates copy with OpenAI; Apply to Shopify writes it to the product",
  ruleLanguage:
    "Store locale: analyze and apply product copy per Shopify Markets language; each locale is cached separately",
  pointsPerProduct: (penalty: number) => `-${penalty} pts / product`,
  toastAiSaved: "AI suggestion saved",
  toastApplied: (fields: string) => `Applied to Shopify: ${fields}`,
  billingTitle: "Plans & usage",
  billingLead:
    "AI generations use OpenAI credits. Store scans and Apply to Shopify are always free. Cached AI suggestions do not count toward your limit.",
  billingDevMode: "billing disabled in dev",
  billingCreditsUsed: (used: number, limit: number) =>
    `${used} / ${limit} AI generations this month`,
  billingCostNote: (usd: number) =>
    `Estimated API cost this month: ~$${usd.toFixed(3)} (about $0.001 per new generation)`,
  billingCacheNote:
    "Re-opening a saved suggestion or unchanged product does not use a credit.",
  billingFree: "Free",
  billingPerMonth: "/ month",
  billingMonthlyCredits: (count: number) => `${count} AI generations / month`,
  billingCurrentPlan: "Current plan",
  billingUpgradeTo: (plan: string) => `Upgrade to ${plan}`,
  billingDowngradeFree: "Cancel paid plan",
  billingPlanCancelled: "Paid plan cancelled.",
  billingPlanUpgraded: (plan: string) => `${plan} plan activated.`,
  billingDevSimulated:
    "Plan activated in dev mode (Shopify Billing API requires App Store distribution).",
  billingCompactTitle: "AI usage",
  billingManagePlans: "Manage plan",
  billingLowCredits: (remaining: number) =>
    `Only ${remaining} AI generations left this month.`,
  billingNoCredits: "Monthly AI limit reached.",
  filters: {
    all: "All",
    issues: "With issues",
    healthy: "Healthy",
    missing_alt_text: "Alt text",
    short_description: "Short description",
    missing_seo: "SEO",
    missing_image: "Images",
  } satisfies Record<ProductFilter, string>,
  issueLabels: {
    missing_alt_text: "Missing alt text",
    short_description: "Short description",
    missing_seo: "Missing SEO",
    missing_image: "Missing image",
  } satisfies Record<IssueType, string>,
  issueSummaries: {
    missing_alt_text: "products missing alt text",
    short_description: "products with a short description",
    missing_seo: "products missing SEO metadata",
    missing_image: "products without images",
  } satisfies Record<IssueType, string>,
  fixTips: {
    missing_alt_text:
      "Add descriptive alt text to product images: Products → open product → click image → Alt text.",
    short_description:
      "Expand the product description to at least 100 characters. Include features and benefits.",
    missing_seo:
      "Fill in the SEO title and meta description in the Search engine listing section.",
    missing_image:
      "Add at least one quality product image. Shoppers rarely buy without visuals.",
  } satisfies Record<IssueType, string>,
  errors: {
    missingProductId: "Product ID is missing",
    createAiFirst: "Generate an AI suggestion first.",
    applyFailed: "Failed to apply changes to Shopify",
    invalidRequest: "Invalid request",
    missingProductData: "Product data is missing",
    aiFailed: "Could not fetch AI suggestion",
    billingLimitExceeded:
      "Monthly AI limit reached. Upgrade your plan on the Billing page.",
  },
} as const;

const tr = {
  pageTitle: "Conversion Copilot",
  loading: "Analiz yükleniyor...",
  storeHealth: "Store Health",
  storeHealthDesc:
    "Mağazanızın SEO sağlık skoru. Tüm ürün skorlarının ortalamasıdır.",
  lastScan: "Son tarama",
  productsWithIssues: "Sorunlu ürün",
  healthyProducts: "Sağlıklı ürün",
  percentAffected: (pct: number) => `%${pct} ürün etkilendi`,
  noAnalysisYet: "Henüz analiz yok",
  healthyHint: (healthy: number, total: number) =>
    `${total} ürünün ${healthy} tanesi sorunsuz`,
  issueBreakdown: "Sorun Dağılımı",
  seoIssues: "SEO Sorunları",
  noSeoIssues: "Harika! SEO sorunu yok",
  noSeoIssuesDesc:
    "Tüm ürünleriniz alt text, açıklama, SEO ve görsel kontrollerini geçti.",
  productStatus: "Ürün Durumu",
  noProducts: "Henüz ürün yok",
  noProductsDesc:
    "Shopify Admin → Products bölümünden test ürünleri ekleyin, ardından sayfayı yenileyin.",
  filter: "Filtre",
  rescan: "Yeniden Tara",
  language: "Dil",
  uiLanguage: "Uygulama dili",
  contentLocale: "Mağaza dili",
  contentLocaleInfoLabel: "Mağaza dili nasıl çalışır",
  contentLocaleInfoTooltip: (primaryName: string) =>
    `Hangi Shopify dilinin analiz edileceğini ve Shopify'a Uygula ile içeriğin nereye yazılacağını seçer.\n\nBirincil dil (${primaryName}): ürün düzenleyicideki ana alanları günceller — Açıklama, SEO ve görsel alt metni.\n\nDiğer diller: çeviri olarak kaydedilir. Shopify Admin'de ürünü açıp o dili seçin (veya Çevir kullanın). ${primaryName} editörü boş kalabilir.`,
  primaryLocale: "Birincil",
  contentLocaleActive: (name: string) =>
    `${name} için analiz ve uygulama yapılıyor. Çeviriler bu Shopify diline kaydedilir.`,
  searchProducts: "Ürün ara",
  searchPlaceholder: "Ürün adı yazın...",
  sort: "Sıralama",
  sortScoreAsc: "Skor: Düşük → Yüksek",
  sortScoreDesc: "Skor: Yüksek → Düşük",
  sortNameAsc: "İsim: A → Z",
  showingProducts: (visible: number, total: number) =>
    `${visible} / ${total} ürün gösteriliyor`,
  filterActive: (label: string) => ` · Filtre: ${label}`,
  searchActive: (query: string) => ` · Arama: "${query}"`,
  noResults: "Sonuç bulunamadı",
  noResultsDesc: "Filtre veya arama kriterlerinizi değiştirmeyi deneyin.",
  clearFilters: "Filtreleri temizle",
  healthy: "Sorunsuz",
  suggest: "Öneri",
  hide: "Gizle",
  aiSuggest: "AI Öneri",
  aiShow: "AI Göster",
  generating: "Üretiliyor...",
  edit: "Düzenle",
  aiGenerating: "AI önerisi hazırlanıyor...",
  staleWarning:
    "Ürün bilgileri değişti. Güncel öneri için yeniden üretin.",
  regenerate: "Yeniden Üret",
  noAiForLanguage:
    "Bu dil için kayıtlı AI önerisi yok. AI Öneri ile oluşturun.",
  aiSuggestions: "AI Önerileri",
  saved: "Kayıtlı",
  suggestedDescription: "Önerilen açıklama",
  seoTitle: "SEO title",
  seoDescription: "SEO description",
  altText: "Alt text",
  copy: "Kopyala",
  copied: (label: string) => `${label} kopyalandı`,
  applyConfirmLeadEnBefore: "Saved AI suggestions for ",
  applyConfirmLeadEnAfter: " will be written to the Shopify product.",
  applyConfirmLeadTrAfter: " için kayıtlı AI önerileri Shopify ürününe yazılacak.",
  applyConfirmFields: "Güncellenecek alanlar:",
  applyFieldDescription: "Ürün açıklaması",
  applyFieldSeo: "SEO başlığı ve açıklaması",
  applyFieldAlt: "Ana görsel alt metni (varsa)",
  applyConfirmNote: "Mevcut içerik bu önerilerle değiştirilir.",
  confirmApply: "Evet, uygula",
  applying: "Uygulanıyor...",
  cancel: "İptal",
  applyToShopify: "Shopify'a Uygula",
  analysisRules: "Analiz Kuralları",
  ruleAltText: "Alt text eksik görsel → -5 puan",
  ruleShortDesc: "Açıklama 100 karakterden kısa → -5 puan",
  ruleSeo: "SEO title veya description boş → -10 puan",
  ruleImage: "Hiç görsel yok → -5 puan",
  ruleAi:
    "AI Öneri: OpenAI ile metin üretir; Shopify'a Uygula ile doğrudan ürüne yazar",
  ruleLanguage:
    "Mağaza dili: Shopify Markets diline göre analiz ve uygulama; her dil ayrı cache'lenir",
  pointsPerProduct: (penalty: number) => `-${penalty} puan / ürün`,
  toastAiSaved: "AI önerisi kaydedildi",
  toastApplied: (fields: string) => `Shopify'a uygulandı: ${fields}`,
  billingTitle: "Planlar ve kullanım",
  billingLead:
    "AI üretimleri OpenAI kredisi kullanır. Mağaza taraması ve Shopify'a Uygula her zaman ücretsizdir. Kayıtlı AI önerilerini tekrar açmak kredi harcamaz.",
  billingDevMode: "geliştirmede billing kapalı",
  billingCreditsUsed: (used: number, limit: number) =>
    `Bu ay ${used} / ${limit} AI üretimi`,
  billingCostNote: (usd: number) =>
    `Bu ay tahmini API maliyeti: ~$${usd.toFixed(3)} (yeni üretim başına ~$0.001)`,
  billingCacheNote:
    "Kayıtlı öneriyi tekrar görmek veya değişmeyen ürün kredi harcamaz.",
  billingFree: "Ücretsiz",
  billingPerMonth: "/ ay",
  billingMonthlyCredits: (count: number) => `Ayda ${count} AI üretimi`,
  billingCurrentPlan: "Mevcut plan",
  billingUpgradeTo: (plan: string) => `${plan} planına yükselt`,
  billingDowngradeFree: "Ücretli planı iptal et",
  billingPlanCancelled: "Ücretli plan iptal edildi.",
  billingPlanUpgraded: (plan: string) => `${plan} planı etkinleştirildi.`,
  billingDevSimulated:
    "Plan geliştirme modunda etkinleştirildi (Shopify Billing API, App Store dağıtımı gerektirir).",
  billingCompactTitle: "AI kullanımı",
  billingManagePlans: "Planı yönet",
  billingLowCredits: (remaining: number) =>
    `Bu ay yalnızca ${remaining} AI üretimi kaldı.`,
  billingNoCredits: "Aylık AI limitine ulaşıldı.",
  filters: {
    all: "Tümü",
    issues: "Sorunlu",
    healthy: "Sağlıklı",
    missing_alt_text: "Alt text",
    short_description: "Kısa açıklama",
    missing_seo: "SEO",
    missing_image: "Görsel",
  },
  issueLabels: {
    missing_alt_text: "Alt text eksik",
    short_description: "Kısa açıklama",
    missing_seo: "SEO eksik",
    missing_image: "Görsel eksik",
  },
  issueSummaries: {
    missing_alt_text: "ürünün alt text'i eksik",
    short_description: "ürünün açıklaması çok kısa",
    missing_seo: "ürünün SEO bilgisi eksik",
    missing_image: "üründe görsel yok",
  },
  fixTips: {
    missing_alt_text:
      "Ürün görsellerine açıklayıcı alt text ekleyin: Products → ürünü aç → görsele tıkla → Alt text.",
    short_description:
      "Ürün açıklamasını en az 100 karakter olacak şekilde genişletin. Özellikler ve faydaları ekleyin.",
    missing_seo:
      "Search engine listing bölümünden SEO title ve meta description doldurun.",
    missing_image:
      "Ürüne en az bir kaliteli görsel ekleyin. Müşteriler görsel olmadan satın alma eğiliminde değildir.",
  },
  errors: {
    missingProductId: "Ürün ID eksik",
    createAiFirst: "Önce AI önerisi oluşturun.",
    applyFailed: "Shopify'a uygulanırken hata oluştu",
    invalidRequest: "Geçersiz istek",
    missingProductData: "Ürün verisi eksik",
    aiFailed: "AI önerisi alınamadı",
    billingLimitExceeded:
      "Aylık AI limitine ulaşıldı. Billing sayfasından plan yükseltin.",
  },
} as const;

const translations = { en, tr };

export type Translations = typeof en;

export function getTranslations(locale: AppLocale): Translations {
  return translations[locale] as Translations;
}

export function localeTag(locale: AppLocale): string {
  return locale === "tr" ? "tr-TR" : "en-US";
}
