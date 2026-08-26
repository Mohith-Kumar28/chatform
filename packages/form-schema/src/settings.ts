import { z } from "zod";
import { NanoId } from "./ids";
import { RespondentAuthMethod } from "./respondent";

export const SettingsDoc = z.object({
  language: z.string().length(2).default("en"),
  rtl: z.boolean().default(false),

  progressBar: z.enum(["percent", "steps", "none"]).default("percent"),
  navigation: z
    .object({
      allowBack: z.boolean().default(true),
      allowSkip: z.boolean().default(false),
    })
    .default({ allowBack: true, allowSkip: false }),

  closeRules: z
    .object({
      closeAt: z.string().optional(),
      maxSubmissions: z.number().int().min(1).optional(),
      closedMessageMd: z.string().max(5000).default("This form is no longer accepting responses."),
    })
    .default({ closedMessageMd: "This form is no longer accepting responses." }),

  /**
   * Make the respondent prove who they are before the first question.
   *
   * This used to be a bare boolean that nothing read. It is an object now
   * because "require auth" is meaningless without saying which methods are
   * acceptable, and because the gate message is shown inside the conversation
   * rather than on an interstitial — the respondent should never leave the
   * chat to sign in.
   */
  requireAuth: z
    .object({
      enabled: z.boolean().default(false),
      methods: z.array(RespondentAuthMethod).min(1).default(["google"]),
      /** Said by the agent just above the sign-in card. */
      message: z
        .string()
        .max(300)
        .default("Before we start, could you verify who you are? It only takes a moment."),
      /**
       * Only one response per verified identity. Distinct from
       * `duplicates.strategy`, which keys on IP or an answer and is trivially
       * evaded; a verified identity is not.
       */
      onePerIdentity: z.boolean().default(false),
    })
    .prefault({}),
  password: z
    .object({
      enabled: z.boolean().default(false),
      /**
       * Stored as `pbkdf2$<iterations>$<salt>$<hash>` (see api `lib/crypto.ts`).
       * Legacy docs may still hold plaintext here; the verifier accepts both and
       * the API upgrades the value on the next save. Never returned to a client.
       */
      value: z.string().max(300).default(""),
    })
    .default({ enabled: false, value: "" }),
  captcha: z
    .object({
      enabled: z.boolean().default(true),
      provider: z.literal("turnstile").default("turnstile"),
      mode: z.enum(["on_create", "adaptive"]).default("adaptive"),
    })
    .default({ enabled: true, provider: "turnstile", mode: "adaptive" }),

  duplicates: z
    .object({
      strategy: z.enum(["none", "ip_daily", "field"]).default("none"),
      fieldRef: z.string().optional(),
    })
    .default({ strategy: "none" }),

  onComplete: z
    .object({
      /**
       * Ask for an explicit submit once every question is answered.
       *
       * Answers persist as they are given either way — this is about the
       * respondent's sense of having finished, and a last chance to fix
       * something before it counts as a completed response.
       */
      requireSubmit: z.boolean().default(true),
      redirectUrl: z.string().url().optional(),
      delaySec: z.number().int().min(0).max(120).default(5),
      notificationEmails: z.array(z.string().email()).max(10).default([]),
      autoReplyEmail: z
        .object({
          enabled: z.boolean().default(false),
          subject: z.string().max(300).default("Thanks for your response"),
          bodyMd: z.string().max(10000).default(""),
        })
        .default({ enabled: false, subject: "Thanks for your response", bodyMd: "" }),
    })
    .prefault({}),

  meta: z
    .object({
      ogTitle: z.string().max(120).optional(),
      ogDescription: z.string().max(300).optional(),
      ogImageKey: z.string().nullable().default(null),
      noIndex: z.boolean().default(false),
    })
    .default({ ogImageKey: null, noIndex: false }),

  branding: z
    .object({
      hidePoweredBy: z.boolean().default(false),
    })
    .default({ hidePoweredBy: false }),

  /**
   * The agent layer — what makes this a conversation rather than a form.
   *
   * Blocks remain the source of truth for WHAT must be collected (so results
   * stay a typed table and logic stays deterministic). This config governs HOW
   * the agent collects it: who it is, what it is trying to achieve, what it may
   * answer from, and what it must not do.
   */
  agent: z
    .object({
      mode: z.enum(["template", "hybrid", "ai"]).default("ai"),
      tone: z.enum(["friendly", "professional", "playful"]).default("friendly"),
      personaPrompt: z.string().max(2000).optional(),
      /** Display name for the interviewer, shown in the chat header. */
      displayName: z.string().max(60).optional(),
      language: z.string().length(2).default("en"),

      /** OpenRouter model slug. Undefined = the plan's default tier. */
      model: z.string().max(80).optional(),

      /**
       * Whether the agent may reword each question.
       *
       * On (the default) it asks in its own words, using the block's title as
       * the objective. Off, the question is delivered verbatim — which matters
       * for compliance, research instruments, and anywhere the exact wording
       * has been signed off. The agent still greets, acknowledges answers and
       * responds to the respondent's own questions either way.
       */
      rephraseQuestions: z.boolean().default(true),

      /** What a good conversation achieves, beyond "every field is filled". */
      goal: z.string().max(1000).optional(),
      successCriteria: z.string().max(1000).optional(),

      /**
       * Inline knowledge the agent answers respondent questions from. Kept small
       * and inlined into a stable system-prompt prefix so it stays cacheable —
       * no embeddings, no vector store.
       */
      knowledge: z
        .array(
          z.object({
            id: NanoId,
            title: z.string().min(1).max(200),
            body: z.string().max(20000),
          }),
        )
        .max(20)
        .default([]),

      guardrails: z
        .object({
          /** May it answer questions the knowledge base does not cover? */
          answerOffTopic: z.boolean().default(true),
          maxTurns: z.number().int().min(5).max(200).default(60),
          refusalMessage: z
            .string()
            .max(500)
            .default("I'm not sure about that one — but I can pass it on. Back to the form:"),
          forbiddenTopics: z.array(z.string().max(120)).max(20).default([]),
        })
        .prefault({}),

      maxClarificationsPerBlock: z.number().int().min(0).max(5).default(2),
      escalateAfterInvalid: z.number().int().min(1).max(10).default(3),
      sessionTokenBudget: z.number().int().min(1000).max(200000).default(12000),
      responseMaxTokens: z.number().int().min(50).max(2000).default(400),
    })
    .prefault({}),
});

/** Total characters across all knowledge entries — the budget the UI meters. */
export const KNOWLEDGE_CHAR_BUDGET = 20000;

export function knowledgeSize(entries: { title: string; body: string }[]): number {
  return entries.reduce((n, e) => n + e.title.length + e.body.length, 0);
}

export type SettingsDoc = z.output<typeof SettingsDoc>;
export type SettingsInput = z.input<typeof SettingsDoc>;

export const ThemeDoc = z.object({
  colorScheme: z.enum(["light", "dark", "auto"]).default("light"),
  background: z.string().max(40).default("#faf7f2"),
  surface: z.string().max(40).default("#ffffff"),
  text: z.string().max(40).default("#1c1917"),
  accent: z.string().max(40).default("#f97316"),
  accentText: z.string().max(40).default("#ffffff"),
  botBubble: z.string().max(40).default("#ffffff"),
  userBubble: z.string().max(40).default("#f97316"),
  userBubbleText: z.string().max(40).default("#ffffff"),
  radius: z.enum(["none", "sm", "md", "lg", "full"]).default("lg"),
  fontHeading: z.string().max(100).default("Bricolage Grotesque"),
  fontBody: z.string().max(100).default("Inter"),
  avatarKey: z.string().nullable().default(null),
  backgroundImageKey: z.string().nullable().default(null),
  backgroundBrightness: z.number().min(0).max(1).default(1),

  /**
   * Optional branding. Both are opt-in: a form with neither still looks
   * finished, using the form's initial and title.
   *
   * `logoUrl` is a public asset URL (see `POST /api/assets`); `logoKey` keeps
   * the R2 key so the object can be replaced or cleaned up later.
   */
  brandName: z.string().max(60).optional(),
  logoUrl: z.string().max(1000).nullable().default(null),
  logoKey: z.string().max(500).nullable().default(null),
});

export type ThemeDoc = z.output<typeof ThemeDoc>;
export type ThemeInput = z.input<typeof ThemeDoc>;
