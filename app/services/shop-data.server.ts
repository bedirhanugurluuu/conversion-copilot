import prisma from "../db.server";

/** Remove all persisted data for a shop (uninstall, shop/redact, compliance). */
export async function deleteAllShopData(shop: string) {
  await prisma.aiSuggestionCache.deleteMany({ where: { shop } });
  await prisma.aiUsageEvent.deleteMany({ where: { shop } });
  await prisma.shopSubscription.deleteMany({ where: { shop } });
  await prisma.session.deleteMany({ where: { shop } });
}
