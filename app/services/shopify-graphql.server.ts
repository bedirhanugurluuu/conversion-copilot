import { logApply } from "../lib/apply-debug.server";

export interface ShopifyUserError {
  field?: string[] | null;
  message: string;
}

interface GraphqlPayload {
  userErrors?: ShopifyUserError[];
}

export async function readShopifyGraphqlResponse(response: Response) {
  const json = (await response.json()) as {
    data?: Record<string, unknown>;
    errors?: Array<{ message: string }>;
    extensions?: unknown;
  };

  logApply("GraphQL raw response", json);
  return json;
}

export async function assertShopifyMutation<T extends GraphqlPayload>(
  response: Response,
  mutationName: string,
  context: string,
): Promise<T> {
  const json = await readShopifyGraphqlResponse(response);

  if (json.errors?.length) {
    throw new Error(
      `${context}: ${json.errors.map((error) => error.message).join(", ")}`,
    );
  }

  const payload = json.data?.[mutationName] as T | null | undefined;
  if (!payload) {
    throw new Error(`${context}: Shopify returned no data for ${mutationName}`);
  }

  if (payload.userErrors?.length) {
    throw new Error(
      `${context}: ${payload.userErrors.map((error) => error.message).join(", ")}`,
    );
  }

  return payload;
}
