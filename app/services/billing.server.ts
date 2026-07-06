import prisma from "../db.server";
import { deleteAllShopData } from "./shop-data.server";
import {
  ESTIMATED_AI_COST_USD,
  PLANS,
  PRO_PLAN,
  STARTER_PLAN,
  type BillingSummary,
  type PlanId,
  canSimulateBilling,
  isBillingDisabled,
  isBillingTestMode,
  isSimulatedSubscription,
  planIdFromShopifyName,
  shopifyPlanKeyForPlanId,
} from "../lib/billing";

export class BillingLimitError extends Error {
  constructor(
    message: string,
    public readonly summary: BillingSummary,
  ) {
    super(message);
    this.name = "BillingLimitError";
  }
}

type ShopifyBilling = {
  check: (options?: {
    plans?: string[];
  }) => Promise<{
    hasActivePayment: boolean;
    appSubscriptions: Array<{ id: string; name: string }>;
  }>;
};

function startOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function endOfUtcMonth(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1),
  );
}

function shouldResetPeriod(periodStart: Date, now = new Date()): boolean {
  return startOfUtcMonth(periodStart).getTime() < startOfUtcMonth(now).getTime();
}

async function resolveEffectivePlan(
  shop: string,
  billing?: ShopifyBilling,
): Promise<{ planId: PlanId; subscriptionId: string | null }> {
  const row = await getOrCreateShopSubscription(shop);

  if (isSimulatedSubscription(row.shopifySubscriptionId)) {
    return {
      planId: row.planId as PlanId,
      subscriptionId: row.shopifySubscriptionId,
    };
  }

  if (!billing) {
    return { planId: "free", subscriptionId: null };
  }

  return resolvePaidPlanId(billing);
}

export async function simulateShopPlanUpgrade(shop: string, planId: PlanId) {
  const plan = PLANS[planId];
  await prisma.shopSubscription.upsert({
    where: { shop },
    create: {
      shop,
      planId,
      aiCreditsLimit: plan.monthlyAiCredits,
      shopifySubscriptionId: `simulated:${planId}`,
    },
    update: {
      planId,
      aiCreditsLimit: plan.monthlyAiCredits,
      shopifySubscriptionId: `simulated:${planId}`,
    },
  });
}

export async function downgradeShopToFree(shop: string) {
  await prisma.shopSubscription.upsert({
    where: { shop },
    create: {
      shop,
      planId: "free",
      aiCreditsLimit: PLANS.free.monthlyAiCredits,
      shopifySubscriptionId: null,
    },
    update: {
      planId: "free",
      aiCreditsLimit: PLANS.free.monthlyAiCredits,
      shopifySubscriptionId: null,
    },
  });
}

export function formatBillingError(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "errorData" in error &&
    Array.isArray((error as { errorData: unknown }).errorData)
  ) {
    const messages = (
      error as { errorData: Array<{ message?: string }> }
    ).errorData
      .map((entry) => entry.message)
      .filter(Boolean);
    if (messages.length > 0) {
      return messages.join(" ");
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Billing request failed.";
}

export function shouldSimulateBillingError(error: unknown): boolean {
  const message = formatBillingError(error).toLowerCase();
  return (
    message.includes("public distribution") ||
    message.includes("billing api") ||
    message.includes("cannot use the billing")
  );
}

async function resolvePaidPlanId(
  billing: ShopifyBilling,
): Promise<{ planId: PlanId; subscriptionId: string | null }> {
  const { hasActivePayment, appSubscriptions } = await billing.check({
    plans: [STARTER_PLAN, PRO_PLAN],
  });

  if (!hasActivePayment || appSubscriptions.length === 0) {
    return { planId: "free", subscriptionId: null };
  }

  const subscription = appSubscriptions[0];
  return {
    planId: planIdFromShopifyName(subscription.name),
    subscriptionId: subscription.id,
  };
}

async function getOrCreateShopSubscription(shop: string) {
  return prisma.shopSubscription.upsert({
    where: { shop },
    create: {
      shop,
      planId: "free",
      aiCreditsLimit: PLANS.free.monthlyAiCredits,
    },
    update: {},
  });
}

export async function requestShopPlanUpgrade(
  request: Request,
  shop: string,
  planId: PlanId,
  billing: {
    request: (options: {
      plan: string;
      isTest: boolean;
      returnUrl: string;
    }) => Promise<unknown>;
  },
) {
  const shopifyPlan = shopifyPlanKeyForPlanId(planId);
  if (!shopifyPlan) {
    return { error: "Invalid plan" };
  }

  if (process.env.BILLING_SIMULATE === "true") {
    await simulateShopPlanUpgrade(shop, planId);
    return { success: true, simulated: true, planId };
  }

  try {
    return await billing.request({
      plan: shopifyPlan,
      isTest: isBillingTestMode(),
      returnUrl: new URL("/app/billing", request.url).toString(),
    });
  } catch (error) {
    if (canSimulateBilling() && shouldSimulateBillingError(error)) {
      await simulateShopPlanUpgrade(shop, planId);
      return { success: true, simulated: true, planId };
    }
    return { error: formatBillingError(error) };
  }
}

export async function cancelShopPlan(
  shop: string,
  billing: ShopifyBilling & {
    cancel: (options: {
      subscriptionId: string;
      isTest: boolean;
      prorate: boolean;
    }) => Promise<unknown>;
  },
) {
  const row = await getOrCreateShopSubscription(shop);

  if (isSimulatedSubscription(row.shopifySubscriptionId)) {
    await downgradeShopToFree(shop);
    return { success: true, cancelled: true };
  }

  try {
    const { appSubscriptions } = await billing.check({
      plans: [STARTER_PLAN, PRO_PLAN],
    });
    const subscription = appSubscriptions[0];
    if (subscription) {
      await billing.cancel({
        subscriptionId: subscription.id,
        isTest: isBillingTestMode(),
        prorate: true,
      });
    }
  } catch (error) {
    return { error: formatBillingError(error) };
  }

  await syncShopBilling(shop, billing);
  return { success: true, cancelled: true };
}

export async function syncShopBilling(
  shop: string,
  billing?: ShopifyBilling,
): Promise<BillingSummary> {
  if (isBillingDisabled()) {
    const now = new Date();
    return {
      planId: "pro",
      planName: PLANS.pro.name,
      priceUsd: PLANS.pro.priceUsd,
      monthlyAiCredits: PLANS.pro.monthlyAiCredits,
      aiCreditsUsed: 0,
      aiCreditsRemaining: PLANS.pro.monthlyAiCredits,
      estimatedAiCostUsd: 0,
      periodStart: startOfUtcMonth(now).toISOString(),
      periodEnd: endOfUtcMonth(now).toISOString(),
      isPaid: true,
      billingDisabled: true,
    };
  }

  const paidPlan = await resolveEffectivePlan(shop, billing);

  const plan = PLANS[paidPlan.planId];
  let row = await getOrCreateShopSubscription(shop);
  const now = new Date();

  if (shouldResetPeriod(row.periodStart, now)) {
    row = await prisma.shopSubscription.update({
      where: { shop },
      data: {
        periodStart: startOfUtcMonth(now),
        aiCreditsUsed: 0,
        estimatedAiCostUsd: 0,
      },
    });
  }

  if (
    row.planId !== paidPlan.planId ||
    row.aiCreditsLimit !== plan.monthlyAiCredits ||
    row.shopifySubscriptionId !== paidPlan.subscriptionId
  ) {
    row = await prisma.shopSubscription.update({
      where: { shop },
      data: {
        planId: paidPlan.planId,
        aiCreditsLimit: plan.monthlyAiCredits,
        shopifySubscriptionId: paidPlan.subscriptionId,
      },
    });
  }

  const remaining = Math.max(0, row.aiCreditsLimit - row.aiCreditsUsed);

  return {
    planId: paidPlan.planId,
    planName: plan.name,
    priceUsd: plan.priceUsd,
    monthlyAiCredits: row.aiCreditsLimit,
    aiCreditsUsed: row.aiCreditsUsed,
    aiCreditsRemaining: remaining,
    estimatedAiCostUsd: row.estimatedAiCostUsd,
    periodStart: row.periodStart.toISOString(),
    periodEnd: endOfUtcMonth(now).toISOString(),
    isPaid: paidPlan.planId !== "free",
    billingDisabled: false,
  };
}

export async function assertCanConsumeAiCredit(
  shop: string,
  billing?: ShopifyBilling,
): Promise<BillingSummary> {
  const summary = await syncShopBilling(shop, billing);

  if (summary.billingDisabled) {
    return summary;
  }

  if (summary.aiCreditsRemaining <= 0) {
    throw new BillingLimitError(
      `Monthly AI limit reached (${summary.aiCreditsUsed}/${summary.monthlyAiCredits}). Upgrade your plan for more generations.`,
      summary,
    );
  }

  return summary;
}

export async function recordAiGeneration(
  shop: string,
  options: { productId: string; contentLocale: string },
): Promise<BillingSummary> {
  if (isBillingDisabled()) {
    return syncShopBilling(shop);
  }

  const row = await prisma.shopSubscription.update({
    where: { shop },
    data: {
      aiCreditsUsed: { increment: 1 },
      estimatedAiCostUsd: { increment: ESTIMATED_AI_COST_USD },
    },
  });

  await prisma.aiUsageEvent.create({
    data: {
      shop,
      productId: options.productId,
      contentLocale: options.contentLocale,
      estimatedCostUsd: ESTIMATED_AI_COST_USD,
    },
  });

  const plan = PLANS[row.planId as PlanId] ?? PLANS.free;
  const now = new Date();

  return {
    planId: row.planId as PlanId,
    planName: plan.name,
    priceUsd: plan.priceUsd,
    monthlyAiCredits: row.aiCreditsLimit,
    aiCreditsUsed: row.aiCreditsUsed,
    aiCreditsRemaining: Math.max(0, row.aiCreditsLimit - row.aiCreditsUsed),
    estimatedAiCostUsd: row.estimatedAiCostUsd,
    periodStart: row.periodStart.toISOString(),
    periodEnd: endOfUtcMonth(now).toISOString(),
    isPaid: row.planId !== "free",
    billingDisabled: false,
  };
}

export async function willBillAiGeneration(
  shop: string,
  productId: string,
  contentLocale: string,
  inputHash: string,
  forceRegenerate: boolean,
): Promise<boolean> {
  if (forceRegenerate) return true;

  const existing = await prisma.aiSuggestionCache.findUnique({
    where: {
      shop_productId_contentLocale: {
        shop,
        productId,
        contentLocale,
      },
    },
  });

  return !existing || existing.inputHash !== inputHash;
}

export async function deleteShopBillingData(shop: string) {
  await deleteAllShopData(shop);
}
