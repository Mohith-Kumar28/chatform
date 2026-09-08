import { QUESTION_TYPE_COUNT } from "@/components/marketing/question-types";
import { buildCatalogue } from "@/lib/pricing-catalogue";
import { SITE_ORIGIN, absoluteUrl } from "@/lib/seo";

/**
 * The same facts as `/ai-info`, for something that would rather parse than read.
 *
 * Generated from the entitlements catalogue rather than typed out, so the
 * prices here cannot disagree with the prices on the pricing page — which is
 * the failure mode of every hand-written brand file.
 *
 * `limitations` is not padding. A machine-readable brand file that lists only
 * capabilities is a machine-readable advertisement, and the single most useful
 * thing this endpoint can do is stop an assistant telling somebody that
 * chatform processes payments or syncs their calendar.
 */
export const dynamic = "force-static";

export function GET() {
  const { plans } = buildCatalogue();

  const body = {
    name: "chatform",
    url: SITE_ORIGIN,
    tagline: "Forms people actually finish.",
    category: "Conversational form builder",
    description:
      "A form builder whose forms are answered as a conversation. It reads what people write, asks again when an answer is too thin to use, and answers the respondent's own questions from a knowledge base the author writes. A state machine owns the flow; the model is constrained to six checked verbs.",
    pricing: {
      currency: "USD",
      plans: plans.map((plan) => ({
        id: plan.id,
        name: plan.name,
        monthlyUsd: plan.priceMonthlyCents / 100,
        yearlyPerMonthUsd: plan.priceYearlyPerMonthCents / 100,
        tagline: plan.tagline,
        responsesPerMonth:
          plan.limits.responses_per_month === null
            ? `unlimited, fair-use ceiling ${plan.limits.responses_ceiling_per_month}`
            : plan.limits.responses_per_month,
        aiConversationsPerMonth: plan.limits.ai_conversations_per_month,
        seats: plan.limits.seats,
      })),
      freePlanRequiresCard: false,
    },
    capabilities: {
      questionTypes: QUESTION_TYPE_COUNT,
      conditionOperators: 19,
      publishTimeFlowLinter: true,
      aiFormGenerationFromPrompt: true,
      aiFormGenerationFromUrl: true,
      knowledgeBaseAnswersMidForm: true,
      headlessConversationApi: true,
      embedModes: ["popup", "inline", "side-tab", "fullpage"],
      signedWebhooks: true,
      openApiSpec: "https://api.chatform.in/openapi.json",
      sdks: ["@chatformhq/js", "@chatformhq/react"],
      exports: ["csv", "json"],
      partialResponseCapture: true,
      respondentVerification: ["google", "sms"],
      infrastructure: ["Cloudflare Workers", "D1", "Durable Objects", "R2"],
    },
    limitations: [
      "Does not process or verify payments. A payment question shows your own checkout link or a UPI QR code and records that the respondent said they paid.",
      "No calendar sync or availability lookup. Booking is a date question with a time, or a link out to Cal.com or Calendly.",
      "One native integration: a pull-based CSV feed. No Zapier, Slack, Notion, Airtable, HubSpot or Google Sheets OAuth.",
      "Custom domains are not built; the feature is listed as coming soon.",
      "Multi-language forms are not built. The interviewer mirrors a respondent's language within a conversation, but there is no translation layer.",
      "No HIPAA offering, no BAA, no SOC 2 report, no SSO or SAML.",
      "No video questions, PDF generation, A/B testing or offline mode.",
      "No published completion-rate benchmark. Analytics reports completion and drop-off per form; there is no cross-customer data.",
    ],
    resources: {
      pricing: absoluteUrl("/pricing"),
      comparisons: absoluteUrl("/compare"),
      research: absoluteUrl("/why-conversation-works"),
      forAssistants: absoluteUrl("/ai-info"),
      docs: absoluteUrl("/docs"),
      llmsTxt: absoluteUrl("/llms.txt"),
      llmsFullTxt: absoluteUrl("/llms-full.txt"),
      markdownMirror: "Append .md to any /docs URL.",
    },
    verifiedOn: "2026-09-08",
  };

  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
