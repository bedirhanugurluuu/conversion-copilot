import type { ShopLocale } from "../lib/shop-locale";

type AdminGraphQLClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

interface ShopLocalesResponse {
  data?: {
    shopLocales?: ShopLocale[];
  };
}

export async function fetchShopLocales(
  admin: AdminGraphQLClient,
): Promise<ShopLocale[]> {
  const response = await admin.graphql(`#graphql
    query ShopLocales {
      shopLocales {
        locale
        name
        primary
        published
      }
    }
  `);

  const json = (await response.json()) as ShopLocalesResponse;
  const locales = json.data?.shopLocales ?? [];

  return locales
    .filter((entry) => entry.primary || entry.published)
    .sort((a, b) => {
      if (a.primary !== b.primary) return a.primary ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

export function getPrimaryLocale(locales: ShopLocale[]): ShopLocale {
  return (
    locales.find((locale) => locale.primary) ?? {
      locale: "en",
      name: "English",
      primary: true,
      published: true,
    }
  );
}

export function resolveContentLocale(
  locales: ShopLocale[],
  requested: string | null,
): string {
  const primary = getPrimaryLocale(locales);
  if (!requested || requested === primary.locale) {
    return primary.locale;
  }

  const match = locales.find((locale) => locale.locale === requested);
  return match ? match.locale : primary.locale;
}
