export const STARTER_PLAN = "Starter";
export const PRO_PLAN = "Pro";

export type PlanId = "free" | "starter" | "pro";

export interface PlanDefinition {
  id: PlanId;
  name: string;
  priceUsd: number;
  monthlyAiCredits: number;
  shopifyPlanKey: typeof STARTER_PLAN | typeof PRO_PLAN | null;
  features: string[];
}

/** Estimated OpenAI cost per billable generation (gpt-4o-mini, ~1 product). */
export const ESTIMATED_AI_COST_USD = 0.001;

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: "free",
    name: "Free",
    priceUsd: 0,
    monthlyAiCredits: 10,
    shopifyPlanKey: null,
    features: [
      "Store health scan (unlimited)",
      "10 AI generations / month",
      "Cached AI reads are free",
      "Apply to Shopify (unlimited)",
    ],
  },
  starter: {
    id: "starter",
    name: "Starter",
    priceUsd: 5,
    monthlyAiCredits: 500,
    shopifyPlanKey: STARTER_PLAN,
    features: [
      "Everything in Free",
      "500 AI generations / month",
      "7-day free trial",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceUsd: 20,
    monthlyAiCredits: 2500,
    shopifyPlanKey: PRO_PLAN,
    features: [
      "Everything in Starter",
      "2,500 AI generations / month",
      "7-day free trial",
    ],
  },
};

export function planIdFromShopifyName(name: string | undefined): PlanId {
  if (name === STARTER_PLAN) return "starter";
  if (name === PRO_PLAN) return "pro";
  return "free";
}

export function shopifyPlanKeyForPlanId(planId: PlanId): string | null {
  return PLANS[planId].shopifyPlanKey;
}

export function isBillingDisabled(): boolean {
  return process.env.BILLING_DISABLED === "true";
}

export function isBillingTestMode(): boolean {
  if (process.env.SHOPIFY_BILLING_TEST === "false") return false;
  if (process.env.SHOPIFY_BILLING_TEST === "true") return true;
  return process.env.NODE_ENV !== "production";
}

/** Dev stores without App Store listing cannot use Shopify Billing API. */
export function canSimulateBilling(): boolean {
  return (
    process.env.BILLING_SIMULATE === "true" ||
    process.env.NODE_ENV !== "production"
  );
}

/** Skip Shopify Billing API and activate plans locally (dev / custom apps). */
export function usesSimulatedBilling(): boolean {
  return !isBillingDisabled() && canSimulateBilling();
}

export function isSimulatedSubscription(
  subscriptionId: string | null | undefined,
): boolean {
  return Boolean(subscriptionId?.startsWith("simulated:"));
}

export interface BillingSummary {
  planId: PlanId;
  planName: string;
  priceUsd: number;
  monthlyAiCredits: number;
  aiCreditsUsed: number;
  aiCreditsRemaining: number;
  estimatedAiCostUsd: number;
  periodStart: string;
  periodEnd: string;
  isPaid: boolean;
  billingDisabled: boolean;
}
