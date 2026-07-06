import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { deleteAllShopData } from "../services/shop-data.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { topic, shop } = await authenticate.webhook(request);

    console.log(`Received compliance webhook ${topic} for ${shop}`);

    switch (topic) {
      case "CUSTOMERS_DATA_REQUEST":
        // We do not store customer personal data.
        break;

      case "CUSTOMERS_REDACT":
        // We do not store customer personal data.
        break;

      case "SHOP_REDACT":
        await deleteAllShopData(shop);
        break;

      default:
        return new Response("Unhandled webhook topic", { status: 404 });
    }

    return new Response();
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("Compliance webhook error", error);
    return new Response("Internal Server Error", { status: 500 });
  }
};
