import type { MetaFunction } from "react-router";
import styles from "../styles/privacy.module.css";

export const meta: MetaFunction = () => [
  { title: "Privacy Policy — Conversion Copilot" },
  {
    name: "description",
    content:
      "Privacy policy for the Conversion Copilot Shopify app.",
  },
];

export default function PrivacyPolicyPage() {
  return (
    <main className={styles.page}>
      <article className={styles.content}>
        <h1>Privacy Policy</h1>
        <p className={styles.updated}>Last updated: July 6, 2026</p>

        <p>
          Conversion Copilot (&quot;the App&quot;) is a Shopify application that
          helps merchants analyze product content and generate AI-powered SEO
          suggestions. This policy explains what data we collect, how we use it,
          and your rights.
        </p>

        <h2>Data we collect</h2>
        <ul>
          <li>
            <strong>Shop and session data:</strong> store domain, access tokens,
            and app installation metadata required to operate the App inside
            Shopify Admin.
          </li>
          <li>
            <strong>Product data:</strong> product titles, descriptions, SEO
            fields, images, and translations accessed via Shopify APIs to
            analyze catalog health and apply suggestions.
          </li>
          <li>
            <strong>AI cache and usage:</strong> generated suggestions, usage
            counters, and billing plan limits tied to your shop.
          </li>
        </ul>

        <h2>Data we do not collect</h2>
        <p>
          The App does not collect or store Shopify customer personal
          information (names, emails, addresses, order history, etc.).
        </p>

        <h2>How we use data</h2>
        <ul>
          <li>Provide store health analysis and AI content suggestions</li>
          <li>Apply approved changes to your Shopify products</li>
          <li>Enforce subscription plans and monthly AI usage limits</li>
          <li>Maintain app security and reliability</li>
        </ul>

        <h2>Third-party services</h2>
        <p>
          AI suggestions are generated using OpenAI. Product data sent for
          generation is limited to what is needed for the requested suggestion.
          OpenAI&apos;s policies apply to their processing of that data.
        </p>

        <h2>Data retention and deletion</h2>
        <ul>
          <li>
            When you uninstall the App, shop-specific data is deleted from our
            systems.
          </li>
          <li>
            Shopify may also send a <code>shop/redact</code> compliance webhook
            after uninstall; we delete any remaining shop data when received.
          </li>
        </ul>

        <h2>Your rights</h2>
        <p>
          Depending on your location, you may have rights to access, correct, or
          delete personal data. Because we do not store customer personal data,
          customer data requests are typically not applicable to this App.
          Merchants can contact us regarding shop data.
        </p>

        <h2>Contact</h2>
        <p>
          For privacy questions or data requests, contact:{" "}
          <a href="mailto:support@conversioncopilot.app">
            support@conversioncopilot.app
          </a>
          . Replace this address with your support email before App Store
          submission.
        </p>
      </article>
    </main>
  );
}
