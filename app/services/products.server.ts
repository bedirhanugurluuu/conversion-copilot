export interface ProductImage {
  altText: string | null;
  url: string;
  mediaId?: string | null;
}

export interface ProductSeo {
  title: string | null;
  description: string | null;
}

export interface Product {
  id: string;
  title: string;
  descriptionHtml: string;
  seo: ProductSeo;
  featuredImage: ProductImage | null;
  images: ProductImage[];
}

interface ProductsQueryResponse {
  data?: {
    products: {
      pageInfo: {
        hasNextPage: boolean;
        endCursor: string | null;
      };
      edges: Array<{
        node: ProductNode;
      }>;
    };
  };
}

interface TranslationEntry {
  key: string;
  value: string;
}

interface ProductNode {
  id: string;
  title: string;
  descriptionHtml: string;
  seo: ProductSeo;
  featuredImage: ProductImage | null;
  translations?: TranslationEntry[];
  media: {
    edges: Array<{
      node: {
        id?: string;
        alt?: string | null;
        image?: { url: string } | null;
        translations?: TranslationEntry[];
      } | null;
    }>;
  };
}

const PRODUCT_FIELDS = `
  id
  title
  descriptionHtml
  seo {
    title
    description
  }
  featuredImage {
    altText
    url
  }
  media(first: 10) {
    edges {
      node {
        ... on MediaImage {
          id
          alt
          image {
            url
          }
        }
      }
    }
  }
`;

const PRODUCT_FIELDS_WITH_TRANSLATIONS = `
  id
  title
  descriptionHtml
  seo {
    title
    description
  }
  featuredImage {
    altText
    url
  }
  translations(locale: $locale) {
    key
    value
  }
  media(first: 10) {
    edges {
      node {
        ... on MediaImage {
          id
          alt
          image {
            url
          }
          translations(locale: $locale) {
            key
            value
          }
        }
      }
    }
  }
`;

function buildProductsQuery(useTranslations: boolean) {
  const fields = useTranslations ? PRODUCT_FIELDS_WITH_TRANSLATIONS : PRODUCT_FIELDS;

  return `#graphql
    query GetProducts($first: Int!, $after: String${useTranslations ? ", $locale: String!" : ""}) {
      products(first: $first, after: $after) {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            ${fields}
          }
        }
      }
    }
  `;
}

function translationsMap(entries: TranslationEntry[] | undefined): Map<string, string> {
  return new Map((entries ?? []).map((entry) => [entry.key, entry.value]));
}

function applyLocaleContent(node: ProductNode): ProductNode {
  const productTranslations = translationsMap(node.translations);

  const mediaEdges = node.media.edges.map((edge) => {
    const media = edge.node;
    if (!media) return edge;

    const mediaTranslations = translationsMap(media.translations);
    const translatedAlt = mediaTranslations.get("alt");

    return {
      node: {
        ...media,
        alt: translatedAlt ?? media.alt ?? null,
      },
    };
  });

  return {
    ...node,
    title: productTranslations.get("title") ?? node.title,
    descriptionHtml: productTranslations.get("body_html") ?? node.descriptionHtml ?? "",
    seo: {
      title: productTranslations.get("meta_title") ?? node.seo?.title ?? null,
      description:
        productTranslations.get("meta_description") ?? node.seo?.description ?? null,
    },
    media: { edges: mediaEdges },
  };
}

type AdminGraphQLClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

function mapProductNode(node: ProductNode): Product {
  const mediaImages = node.media.edges
    .map((edge) => edge.node)
    .filter((media): media is NonNullable<typeof media> => Boolean(media?.id));

  const images: ProductImage[] = mediaImages.map((media) => ({
    altText: media.alt ?? null,
    url: media.image?.url ?? "",
    mediaId: media.id ?? null,
  }));

  const featuredFromMedia = images[0] ?? null;

  return {
    id: node.id,
    title: node.title,
    descriptionHtml: node.descriptionHtml ?? "",
    seo: node.seo ?? { title: null, description: null },
    featuredImage: node.featuredImage ?? featuredFromMedia,
    images: images.length > 0 ? images : node.featuredImage ? [node.featuredImage] : [],
  };
}

export async function fetchProducts(
  admin: AdminGraphQLClient,
  options: { limit?: number; contentLocale?: string | null; primaryLocale?: string } = {},
): Promise<Product[]> {
  const limit = options.limit ?? 250;
  const primaryLocale = options.primaryLocale ?? "en";
  const contentLocale = options.contentLocale ?? primaryLocale;
  const useTranslations = contentLocale !== primaryLocale;
  const query = buildProductsQuery(useTranslations);
  const products: Product[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage && products.length < limit) {
    const batchSize = Math.min(50, limit - products.length);
    const response = await admin.graphql(query, {
      variables: {
        first: batchSize,
        after: cursor,
        ...(useTranslations ? { locale: contentLocale } : {}),
      },
    });

    const json = (await response.json()) as ProductsQueryResponse;
    const data = json.data?.products;

    if (!data) {
      throw new Error("Failed to fetch products from Shopify");
    }

    for (const edge of data.edges) {
      const node = useTranslations ? applyLocaleContent(edge.node) : edge.node;
      products.push(mapProductNode(node));
    }

    hasNextPage = data.pageInfo.hasNextPage;
    cursor = data.pageInfo.endCursor;
  }

  return products;
}
