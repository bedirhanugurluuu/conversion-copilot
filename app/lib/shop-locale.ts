export interface ShopLocale {
  locale: string;
  name: string;
  primary: boolean;
  published: boolean;
}

export function localeToLanguageCode(locale: string): string {
  return locale.replace(/-/g, "_").toUpperCase();
}

export function aiWritingLanguageName(locale: string): string {
  const base = locale.split("-")[0]?.toLowerCase() ?? locale;
  const names: Record<string, string> = {
    en: "English",
    tr: "Turkish",
    fr: "French",
    de: "German",
    es: "Spanish",
    it: "Italian",
    pt: "Portuguese",
    nl: "Dutch",
    pl: "Polish",
    ja: "Japanese",
    ko: "Korean",
    zh: "Chinese",
    ar: "Arabic",
    sv: "Swedish",
    da: "Danish",
    fi: "Finnish",
    nb: "Norwegian",
    cs: "Czech",
    hu: "Hungarian",
    ro: "Romanian",
    ru: "Russian",
  };
  return names[base] ?? `the language used for locale "${locale}"`;
}

export function aiCacheKey(productId: string, contentLocale: string): string {
  return `${productId}:${contentLocale}`;
}

export function readStoredContentLocale(fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return (
    window.localStorage.getItem("conversion-copilot-content-locale") ?? fallback
  );
}

export function storeContentLocale(locale: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("conversion-copilot-content-locale", locale);
}
