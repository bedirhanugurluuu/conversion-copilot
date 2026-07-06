import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { deleteAllShopData } from "../services/shop-data.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  await deleteAllShopData(shop);

  return new Response();
};
