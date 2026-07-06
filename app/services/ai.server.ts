import OpenAI from "openai";
import type { AiSuggestInput, AiSuggestions } from "../lib/ai";
import { aiWritingLanguageName } from "../lib/shop-locale";

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is missing. Add it to .env and restart the server.",
    );
  }

  return new OpenAI({ apiKey });
}

function buildSystemPrompt(contentLocale: string): string {
  const languageName = aiWritingLanguageName(contentLocale);

  return [
    "You are an SEO and conversion expert for Shopify ecommerce stores.",
    `Respond in ${languageName}.`,
    "Return valid JSON only with these keys:",
    "priority, summary, suggestedDescription, suggestedSeoTitle, suggestedSeoDescription, suggestedAltText.",
    "priority: one sentence about what to fix first.",
    "summary: 2 short sentences about the product SEO situation.",
    "suggestedDescription: 120-200 words, plain text, no HTML.",
    "suggestedSeoTitle: max 60 characters.",
    "suggestedSeoDescription: max 155 characters.",
    "suggestedAltText: short descriptive alt text for the main product image.",
  ].join(" ");
}

export async function generateProductSuggestions(
  product: AiSuggestInput,
  contentLocale: string,
): Promise<AiSuggestions> {
  const openai = getOpenAIClient();
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const response = await openai.chat.completions.create({
    model,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: buildSystemPrompt(contentLocale),
      },
      {
        role: "user",
        content: JSON.stringify(
          { ...product, contentLocale },
          null,
          2,
        ),
      },
    ],
    temperature: 0.7,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI returned an empty response.");
  }

  const parsed = JSON.parse(content) as Partial<AiSuggestions>;

  return {
    priority: parsed.priority ?? "Fill in the SEO fields first.",
    summary: parsed.summary ?? "",
    suggestedDescription: parsed.suggestedDescription ?? "",
    suggestedSeoTitle: parsed.suggestedSeoTitle ?? "",
    suggestedSeoDescription: parsed.suggestedSeoDescription ?? "",
    suggestedAltText: parsed.suggestedAltText ?? "",
  };
}
