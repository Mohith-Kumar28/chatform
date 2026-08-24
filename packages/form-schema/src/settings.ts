import { z } from "zod";

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

  requireAuth: z.boolean().default(false),
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
    .default({
      delaySec: 5,
      notificationEmails: [],
      autoReplyEmail: { enabled: false, subject: "Thanks for your response", bodyMd: "" },
    }),

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

  agent: z
    .object({
      mode: z.enum(["template", "hybrid", "ai"]).default("hybrid"),
      tone: z.enum(["friendly", "professional", "playful"]).default("friendly"),
      personaPrompt: z.string().max(2000).optional(),
      language: z.string().length(2).default("en"),
      maxClarificationsPerBlock: z.number().int().min(0).max(5).default(2),
      escalateAfterInvalid: z.number().int().min(1).max(10).default(3),
      sessionTokenBudget: z.number().int().min(1000).max(200000).default(12000),
      responseMaxTokens: z.number().int().min(50).max(2000).default(400),
    })
    .default({
      mode: "hybrid",
      tone: "friendly",
      language: "en",
      maxClarificationsPerBlock: 2,
      escalateAfterInvalid: 3,
      sessionTokenBudget: 12000,
      responseMaxTokens: 400,
    }),
});

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
});

export type ThemeDoc = z.output<typeof ThemeDoc>;
export type ThemeInput = z.input<typeof ThemeDoc>;
