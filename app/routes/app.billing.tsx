import type {

  ActionFunctionArgs,

  HeadersFunction,

  LoaderFunctionArgs,

} from "react-router";

import { Form, useFetcher, useLoaderData, useRevalidator } from "react-router";

import { useEffect, useMemo, useRef, useState } from "react";

import { useAppBridge } from "@shopify/app-bridge-react";

import { authenticate } from "../shopify.server";

import {

  getTranslations,

  readStoredLocale,

  type AppLocale,

} from "../lib/i18n";

import { PLANS, type PlanId, usesSimulatedBilling } from "../lib/billing";

import {

  cancelShopPlan,

  requestShopPlanUpgrade,

  syncShopBilling,

} from "../services/billing.server";

import styles from "../styles/billing.module.css";

import { ClientOnly } from "../components/ClientOnly";

import { boundary } from "@shopify/shopify-app-react-router/server";



export const loader = async ({ request }: LoaderFunctionArgs) => {

  const { billing, session } = await authenticate.admin(request);

  const summary = await syncShopBilling(session.shop, billing);



  return { summary, usesSimulatedBilling: usesSimulatedBilling() };

};



export const action = async ({ request }: ActionFunctionArgs) => {

  const { billing, session } = await authenticate.admin(request);

  const formData = await request.formData();

  const intent = formData.get("intent");

  const planId = formData.get("planId") as PlanId | null;



  if (intent === "upgrade" && planId && planId !== "free") {

    return requestShopPlanUpgrade(request, session.shop, planId, billing);

  }



  if (intent === "cancel") {

    return cancelShopPlan(session.shop, billing);

  }



  return { error: "Invalid request" };

};



function BillingContent() {

  const { summary, usesSimulatedBilling: isSimulated } =

    useLoaderData<typeof loader>();

  const fetcher = useFetcher<typeof action>();

  const revalidator = useRevalidator();

  const shopify = useAppBridge();

  const handledResponseRef = useRef<string | null>(null);

  const [uiLocale] = useState<AppLocale>(() => readStoredLocale());

  const strings = useMemo(() => getTranslations(uiLocale), [uiLocale]);

  const planOrder: PlanId[] = ["free", "starter", "pro"];

  const isSubmitting = fetcher.state !== "idle";



  useEffect(() => {

    if (!fetcher.data || fetcher.state !== "idle") return;



    const responseKey = JSON.stringify(fetcher.data);

    if (handledResponseRef.current === responseKey) return;

    handledResponseRef.current = responseKey;



    if ("error" in fetcher.data && fetcher.data.error) {

      shopify.toast.show(fetcher.data.error, { isError: true });

      return;

    }



    if ("success" in fetcher.data && fetcher.data.success) {

      if ("simulated" in fetcher.data && fetcher.data.simulated) {

        const planName =

          PLANS[fetcher.data.planId as PlanId]?.name ?? fetcher.data.planId;

        shopify.toast.show(strings.billingPlanUpgraded(planName));

      } else if ("cancelled" in fetcher.data && fetcher.data.cancelled) {

        shopify.toast.show(strings.billingPlanCancelled);

      }

      revalidator.revalidate();

    }

  }, [

    fetcher.data,

    fetcher.state,

    revalidator,

    shopify,

    strings.billingPlanCancelled,

    strings.billingPlanUpgraded,

  ]);



  return (

    <s-page heading={strings.billingTitle}>

      <s-section>

        <div className={styles.billingPage}>

          <p className={styles.billingLead}>{strings.billingLead}</p>

          <div className={styles.currentUsageCard}>

            <div className={styles.currentUsageHeader}>

              <span className={styles.currentPlanBadge}>

                {summary.planName}

                {summary.billingDisabled ? ` (${strings.billingDevMode})` : ""}

              </span>

              <span className={styles.currentUsageMeta}>

                {strings.billingCreditsUsed(

                  summary.aiCreditsUsed,

                  summary.monthlyAiCredits,

                )}

              </span>

            </div>

            <div className={styles.usageBarTrack}>

              <div

                className={styles.usageBarFill}

                style={{

                  width: `${Math.min(100, (summary.aiCreditsUsed / Math.max(summary.monthlyAiCredits, 1)) * 100)}%`,

                }}

              />

            </div>

            <p className={styles.usageFootnote}>

              {strings.billingCostNote(summary.estimatedAiCostUsd)}

            </p>

            <p className={styles.usageFootnote}>{strings.billingCacheNote}</p>

          </div>



          <div className={styles.planGrid}>

            {planOrder.map((planId) => {

              const plan = PLANS[planId];

              const isCurrent = summary.planId === planId;

              const isUpgrade =

                planOrder.indexOf(planId) > planOrder.indexOf(summary.planId);

              const UpgradeForm = isSimulated ? fetcher.Form : Form;



              return (

                <div

                  key={planId}

                  className={`${styles.planCard} ${isCurrent ? styles.planCardCurrent : ""}`}

                >

                  <div className={styles.planCardHeader}>

                    <h2>{plan.name}</h2>

                    <p className={styles.planPrice}>

                      {plan.priceUsd === 0

                        ? strings.billingFree

                        : `$${plan.priceUsd.toFixed(2)}`}

                      {plan.priceUsd > 0 && (

                        <span className={styles.planPriceInterval}>

                          {strings.billingPerMonth}

                        </span>

                      )}

                    </p>

                  </div>

                  <p className={styles.planCredits}>

                    {strings.billingMonthlyCredits(plan.monthlyAiCredits)}

                  </p>

                  <ul className={styles.planFeatures}>

                    {plan.features.map((feature) => (

                      <li key={feature}>{feature}</li>

                    ))}

                  </ul>

                  {isCurrent ? (

                    <span className={styles.planCurrentLabel}>

                      {strings.billingCurrentPlan}

                    </span>

                  ) : planId === "free" ? (

                    summary.isPaid ? (

                      <fetcher.Form method="post">

                        <input type="hidden" name="intent" value="cancel" />

                        <button

                          type="submit"

                          className={styles.planBtnSecondary}

                          disabled={isSubmitting}

                        >

                          {strings.billingDowngradeFree}

                        </button>

                      </fetcher.Form>

                    ) : null

                  ) : isUpgrade ? (

                    <UpgradeForm method="post">

                      <input type="hidden" name="intent" value="upgrade" />

                      <input type="hidden" name="planId" value={planId} />

                      <button

                        type="submit"

                        className={styles.planBtnPrimary}

                        disabled={isSimulated && isSubmitting}

                      >

                        {strings.billingUpgradeTo(plan.name)}

                      </button>

                    </UpgradeForm>

                  ) : null}

                </div>

              );

            })}

          </div>

        </div>

      </s-section>

    </s-page>

  );

}



export default function BillingPage() {

  return (

    <ClientOnly fallback={<s-page heading="Billing" />}>

      <BillingContent />

    </ClientOnly>

  );

}



export const headers: HeadersFunction = (headersArgs) => {

  return boundary.headers(headersArgs);

};



export const ErrorBoundary = boundary.error;


