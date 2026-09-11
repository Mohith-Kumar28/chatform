import { z } from "zod";
import { NanoId } from "./ids";
import { RespondentAuthMethod } from "./respondent";

/**
 * The confirmation email's copy when the author has not written their own.
 *
 * Exported because three places need the same words: the schema default, the
 * builder's placeholder, and `doc-entitlements`, which resets a free plan's
 * customised copy back to exactly this rather than switching the mail off.
 */
export const DEFAULT_CONFIRMATION_SUBJECT = "Thanks for your response";

/**
 * Deliberately says nothing the author has not promised. "We'll be in touch"
 * is a commitment on their behalf; "this is your copy" is only true.
 */
export const DEFAULT_CONFIRMATION_BODY =
  "Thanks for taking the time to fill in {{form.title}} — we've got your response. This email is your copy of it.";

export const SettingsDoc = z.object({
  language: z.string().length(2).default("en"),
  rtl: z.boolean().default(false),

  progressBar: z.enum(["percent", "steps", "none"]).default("percent"),
  /**
   * `allowSkip` defaults on, and that is the conversational default rather than
   * the form one.
   *
   * A question the author marked optional is a question they said they could do
   * without; defaulting to "no skipping" made the runtime hold a respondent on
   * it anyway until they typed something, which turns an optional question into
   * a required one with extra steps. Required questions are unaffected — the
   * skip control never appears on those.
   */
  navigation: z
    .object({
      allowBack: z.boolean().default(true),
      allowSkip: z.boolean().default(true),
    })
    .default({ allowBack: true, allowSkip: true }),

  closeRules: z
    .object({
      closeAt: z.string().optional(),
      maxSubmissions: z.number().int().min(1).optional(),
      closedMessageMd: z.string().max(5000).default("This form is no longer accepting responses."),
      /**
       * Show the respondent a live countdown to `closeAt`.
       *
       * On by default, because a deadline nobody can see creates no urgency and
       * turns lateness into an unexplained error screen. It publishes nothing
       * new either way: the close date already goes out on the share card, and
       * this flag governs that projection too, so switching it off withdraws
       * the date from both places at once rather than leaving it visible in the
       * one place the author cannot see.
       */
      showCountdown: z.boolean().default(true),
      /**
       * Show the respondent how many places are left against `maxSubmissions`.
       *
       * Off by default, and deliberately not inferred from the cap being set. A
       * cap is very often an internal guard rather than a scarcity offer — the
       * demo form caps at 2000 to bound spend, and "1,987 spots left" would be
       * absurd there and would publish a budget. It also discloses more than it
       * appears to: a remaining count tells anyone holding the link how many
       * people have answered, which is a scarcity nudge on a workshop signup
       * and a leak on a hiring form. So the author turns it on per form.
       */
      showRemaining: z.boolean().default(false),
    })
    // `prefault({})` rather than a literal default: the object default has to
    // spell out every field, so each new one here silently became a second
    // place to keep the same value in step. This defers to the field defaults
    // above, which are the ones carrying the reasoning.
    .prefault({}),

  /**
   * Make the respondent prove who they are before the first question.
   *
   * This used to be a bare boolean that nothing read. It is an object now
   * because "require auth" is meaningless without saying which method proves
   * it, and because the gate message is shown inside the conversation rather
   * than on an interstitial — the respondent should never leave the chat to
   * sign in.
   */
  requireAuth: z
    .object({
      enabled: z.boolean().default(false),
      /**
       * One method, not a set of them.
       *
       * This was an array, and the builder drew it as a pair of toggles that
       * could both be on. Nothing was gained by that: a respondent meeting a
       * card with two ways in has to choose one, and the two produce different
       * identities — a Google account and a phone number are not the same
       * person to the one-per-person rule, so the same human could answer
       * twice by coming back through the other door. The author is choosing
       * what an identity *is* on this form, and that is a single decision.
       */
      method: RespondentAuthMethod.default("google"),
      /** Said by the agent just above the sign-in card. */
      message: z
        .string()
        .max(300)
        .default("Before we start, could you verify who you are? It only takes a moment."),
      /**
       * How many answers to take before asking who they are.
       *
       * 0 asks before the first question, and that is right whenever the
       * answers are only worth having from a known person — an application, a
       * gated download, anything where an anonymous submission is waste.
       *
       * It is wrong for a form whose job is to be experienced. A sign-in card
       * at interaction zero is the largest single drop-off a form can have,
       * and someone who has not yet been asked anything has no reason to pay
       * it. Letting them answer a few questions first costs nothing: the
       * answers are recorded as they are given, so a respondent who stops at
       * the gate leaves a partial response rather than nothing at all.
       *
       * This is not the ordering `emitAuthRequired` was written to avoid.
       * Asking someone to answer and *then* telling them it did not count is
       * the bad case; here the answers are kept, and the gate is the price of
       * carrying on rather than the price of having started.
       */
      afterBlocks: z.number().int().min(0).max(20).default(0),
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

  /**
   * May the same person answer this form more than once?
   *
   * This used to be a three-way `duplicates.strategy` — `none`, `ip_daily`,
   * `field` — which asked the author to pick a *mechanism* for a question they
   * only ever had one opinion about. Worse, `field` was never implemented:
   * the builder offered "fingerprint by answer field" and nothing anywhere
   * enforced it, so an author could switch it on and get no protection at all.
   *
   * It is a boolean now. Off means one response per respondent, keyed on the
   * device signal the browser computes (`lib/respondent-key.ts` on the API,
   * `lib/respondent-signal.ts` in the page), with the hashed IP only as a
   * fallback when no signal arrives.
   *
   * That key survives a cleared cache and a private window — which the IP it
   * replaced did not need to, because it identified a network rather than a
   * person and handed a whole office one response between them. What it does
   * not survive is a different browser or device, and it is computed in the
   * page, so somebody determined to answer twice still can.
   *
   * ── The only control, and what decides how strong it is ──
   *
   * There used to be a second one. `requireAuth.onePerIdentity` asked the same
   * question — may one person answer twice? — in the opposite polarity, in a
   * different settings section, and differed only in which key it enforced on.
   * Which key to use is not a decision an author has any way to make well, and
   * it is not a decision at all: it follows from whether the form asks people
   * to sign in.
   *
   * So this field is the whole of the rule, and the key follows the form:
   *
   *   sign-in off  → the device key above, and only when it is a real device
   *                  signal (see `lib/respondent-key.ts`)
   *   sign-in on   → the verified identity, on a plan that has
   *                  `one_response_per_identity`; the device key below that
   *
   * The identity is the only one of the two that actually holds. See
   * `openSession` for the device half and `assessIdentity` for the other.
   */
  allowResubmissions: z.boolean().default(true),

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
      /**
       * The receipt the respondent gets, and the only email in this product
       * that defaults to on.
       *
       * Somebody who has just typed their answers into a chat window has no
       * artefact of having done it — no confirmation page they can find again,
       * nothing in their sent folder. Every form product they have used before
       * sends them one, so its absence reads as the submission having failed.
       * That is why it is on by default and why the answers are included: the
       * mail is a copy of what they sent, not a marketing touch.
       *
       * It is transactional in the sense every regime that has an opinion
       * means: it goes only to a person who just completed the form, at an
       * address they typed into it, in direct response to that act. So unlike
       * `followUp` it carries no unsubscribe and no postal address, and unlike
       * `followUp` it is not gated — see `doc-entitlements.ts`, where what the
       * paid feature buys is writing your own copy rather than sending at all.
       */
      autoReplyEmail: z
        .object({
          enabled: z.boolean().default(true),
          subject: z.string().max(300).default(DEFAULT_CONFIRMATION_SUBJECT),
          bodyMd: z.string().max(10000).default(DEFAULT_CONFIRMATION_BODY),
          /**
           * Echo their answers back under the message.
           *
           * Separately switchable because the one form that must not do it is
           * the one collecting something the respondent would not want sitting
           * in their inbox — a health intake, a whistleblowing report. The
           * author of that form needs a switch, not a reason to turn the whole
           * confirmation off.
           */
          includeAnswers: z.boolean().default(true),
        })
        .default({
          enabled: true,
          subject: DEFAULT_CONFIRMATION_SUBJECT,
          bodyMd: DEFAULT_CONFIRMATION_BODY,
          includeAnswers: true,
        }),
    })
    .prefault({}),

  /**
   * Nudge someone who started answering and walked away.
   *
   * Turned off by default and gated at Pro, because it sends mail on the
   * customer's behalf to a person who never finished — which is marketing mail
   * in every regime that has an opinion, not a service message. The gate, the
   * suppression list and the at-capture opt-out are what make that defensible;
   * see `lib/followups.ts` and `docs/follow-ups.mdx`.
   *
   * The default cadence is 4h then 24h, and deliberately not the "send within
   * an hour" advice every vendor blog repeats. Those benchmarks measure
   * conversion of emails sent, against no control group. The two randomised
   * trials that measure incremental lift both found messages inside the first
   * hour performed *worse* than sending nothing — they mostly intercept people
   * who were coming back anyway and book them as recovered.
   */
  followUp: z
    .object({
      enabled: z.boolean().default(false),
      channel: z.literal("email").default("email"),
      /**
       * Which hidden field carries the address, when that is where it comes
       * from. Named rather than matched on a magic `email` key: hidden field
       * names are author-chosen, so a form using `lead_email` or `contact`
       * should work without anybody renaming anything.
       */
      addressField: z.string().max(60).optional(),
      /**
       * At most three. Velocify found more than five *lowers* conversion by
       * 36%, and Klaviyo's own guidance is two to three. The third step is
       * off by default rather than absent — it converts well enough
       * (Barilliance measured 18.2% at 72h) to be one toggle away.
       */
      steps: z
        .array(
          z.object({
            delayHours: z.number().int().min(1).max(720),
            subject: z.string().max(300),
            bodyMd: z.string().max(10000).default(""),
          }),
        )
        .max(3)
        .default([
          {
            delayHours: 4,
            subject: "You're {{remaining}} questions from finishing",
            bodyMd:
              "Everything you answered is saved, and picking up where you left off takes about a minute.",
          },
          {
            delayHours: 24,
            subject: "Your {{form.title}} is still open",
            bodyMd:
              "Just a nudge in case it slipped. Your answers are still here whenever you're ready.",
          },
        ]),
      /**
       * Lead with how far they got. This is the one piece of the usual
       * psychology story that survives scrutiny: the Zeigarnik effect does not
       * replicate, but endowed progress (Nunes & Dreze 2006) roughly doubled
       * completion by reframing a task as already begun.
       */
      showProgress: z.boolean().default(true),
      /**
       * Hold this share of abandoners back and send them nothing, so the
       * recovery number means something. Off by default — it withholds mail
       * the customer asked for — but it is the only way to tell recovery from
       * people who were returning regardless, and no other form product
       * measures it at all.
       */
      holdoutPercent: z.number().int().min(0).max(20).default(0),
      /**
       * Hold a reminder out of the respondent's night.
       *
       * Nothing sends between 9 PM and 9 AM where *they* are — their browser's
       * zone, falling back to the author's. The hours are fixed rather than a
       * range the author picks: when people are asleep is a fact about people,
       * not a preference about a campaign, and every product that made it
       * editable turned one safe default into a support question.
       *
       * On by default, which is only true of documents written from v9 onward
       * — the v8→v9 migration pins every document older than this to `false`,
       * because silently adding a twelve-hour nightly hold to a sequence
       * somebody is already running and already measuring would be a change
       * they did not ask for. See `migrations.ts`.
       */
      quietHours: z.boolean().default(true),
      /**
       * The form's own clock, used only when the respondent's is unknown.
       *
       * Written by the builder from the author's browser at the moment they
       * switch quiet hours on. Their morning is a far better guess at their
       * respondents' morning than UTC is — most forms are answered in one
       * country, and it is usually the author's.
       *
       * Not named `quietHoursTimezone`: the day this grows a "weekdays only"
       * rule, it will be the same field.
       */
      timezone: z.string().max(64).optional(),
      /** Where a reply goes. `noreply@` on a nudge is how you get marked spam. */
      replyTo: z.string().email().optional(),
      /**
       * The author confirmed this form is sales-directed and that the postal
       * address required by CAN-SPAM is set. Stored with who and when, because
       * CASL puts the burden of proof on the sender.
       */
      attestedBy: z.string().max(100).optional(),
      attestedAt: z.string().optional(),
    })
    .prefault({}),

  meta: z
    .object({
      ogTitle: z.string().max(120).optional(),
      ogDescription: z.string().max(300).optional(),
      ogImageKey: z.string().nullable().default(null),
      /**
       * The icon in the browser tab of the hosted form. Separate from the
       * brand logo: a logo is drawn at 200px inside the conversation, a favicon
       * at 16px in a tab, and one image is rarely right at both sizes.
       */
      faviconKey: z.string().nullable().default(null),
      noIndex: z.boolean().default(false),
    })
    .default({ ogImageKey: null, faviconKey: null, noIndex: false }),

  branding: z
    .object({
      hidePoweredBy: z.boolean().default(false),
    })
    .default({ hidePoweredBy: false }),

  /**
   * Where this form may be embedded.
   *
   * Empty means anywhere, which is what a public form usually wants — a
   * marketing page, a partner's site, a customer's intranet. Listing origins
   * turns that off, and the check that matters happens server-side when a
   * session is opened: a browser is not a trust boundary, so the CSP the
   * allowlist also produces is defence in depth rather than the defence.
   *
   * Entries are exact origins, or one leading wildcard label for preview
   * deployments: `https://*.preview.acme.example`.
   */
  embed: z
    .object({
      allowedOrigins: z.array(z.string().max(200)).max(20).default([]),
    })
    .default({ allowedOrigins: [] }),

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

      guardrails: z
        .object({
          /** May it answer questions retrieval from the knowledge base does not cover? */
          answerOffTopic: z.boolean().default(true),
          /**
           * Runtime-injected, never authored. See `sessionTokenBudget`.
           *
           * Optional with no default so a document does not carry a number
           * that means nothing: `clampForRuntime` writes the plan's value on
           * every read, and `stripForPublish` removes whatever a client sent.
           */
          maxTurns: z.number().int().min(5).max(1000).optional(),
          refusalMessage: z
            .string()
            .max(500)
            .default("I'm not sure about that one — but I can pass it on. Back to the form:"),
          forbiddenTopics: z.array(z.string().max(120)).max(20).default([]),
        })
        .prefault({}),

      maxClarificationsPerBlock: z.number().int().min(0).max(5).default(2),
      escalateAfterInvalid: z.number().int().min(1).max(10).default(3),
      /**
       * Both agent ceilings are ours, not the author's, and are not stored.
       *
       * They were authorable, with defaults, and both were traps. "Token
       * budget: 12000" is not a question anyone building a form can answer —
       * it reads as a preference and behaves as a cliff, because spending it
       * turns the interviewer into a plain form mid-conversation. A live
       * registration form carried an authored 12,000 from the day it was made
       * and went quiet on the fifth answer; nobody could have known that was
       * the number that mattered. `maxTurns` is the same trap one step later.
       *
       * The honest value depends on the plan, not on the form, so it lives in
       * one place — `PLANS[...].limits` — and `clampForRuntime` writes it onto
       * the document on every read. They stay declared here because the
       * runtime reads them off the doc, but they are optional with no default:
       * a document that has been through `stripForPublish` carries neither, so
       * there is no stale copy to drift from the plan, and no way for a client
       * or the public API to set one.
       */
      sessionTokenBudget: z.number().int().min(1000).max(5_000_000).optional(),
      responseMaxTokens: z.number().int().min(50).max(2000).default(400),
    })
    .prefault({}),
});

export type SettingsDoc = z.output<typeof SettingsDoc>;
export type SettingsInput = z.input<typeof SettingsDoc>;

/**
 * The default palette is the brand's, and it is the brand's two hues rather
 * than one.
 *
 * These used to be `#f97316` — Tailwind's orange-500, which is not the mark's
 * orange and never was. A new form therefore opened in an orange close enough
 * to the product's to look like a mistake rather than a choice. `#FD6F29` is
 * the logo, exactly.
 *
 * The respondent's bubble is the violet plate, so a default form carries both
 * halves of the mark in the one place a respondent actually looks. Every value
 * is still a `.default()`, so this changes new forms only; a saved theme has
 * its own hexes and does not move.
 *
 * That violet used to be a mid-tone `#9D6EE4`. Mid-tone is the one lightness a
 * fill behind body copy cannot be: no ink clears 7:1 on it, dark or light, so
 * the bubble read as a smudge with the answer buried in it. A respondent's
 * bubble is a passage of text, not a button — it wants to behave like tinted
 * paper. `#C9AEEE` is the same violet lifted until dark ink sits at 9.3:1 on
 * it while it still stands 1.8:1 clear of the page.
 *
 * The action keeps its saturation. Lightening a bubble helps reading;
 * lightening the one thing you press only makes it easier to miss.
 */
const BRAND_ORANGE = "#FD6F29";
/** The lifted violet plate — a tint to read on, not the logo's `#9769DC` fill. */
const BRAND_VIOLET = "#C9AEEE";

/**
 * The ink `accentText` and `userBubbleText` default to.
 *
 * It is a sentinel as much as a colour. The runtime derives readable ink from
 * whatever fill it lands on (`readableInk` in `apps/web/src/lib/chat-theme.ts`),
 * and treats a stored value still equal to this one as "nobody chose this" —
 * so every form built before the derivation existed gets the fix without a
 * migration, and a hand-picked ink that reads fine is still honoured.
 */
export const THEME_DEFAULT_INK = "#201a16";
const BRAND_INK = THEME_DEFAULT_INK;

export const ThemeDoc = z.object({
  colorScheme: z.enum(["light", "dark", "auto"]).default("light"),
  background: z.string().max(40).default("#faf7f2"),
  surface: z.string().max(40).default("#ffffff"),
  text: z.string().max(40).default("#1c1917"),
  accent: z.string().max(40).default(BRAND_ORANGE),
  accentText: z.string().max(40).default(BRAND_INK),
  botBubble: z.string().max(40).default("#ffffff"),
  userBubble: z.string().max(40).default(BRAND_VIOLET),
  userBubbleText: z.string().max(40).default(BRAND_INK),
  radius: z.enum(["none", "sm", "md", "lg", "full"]).default("lg"),
  fontHeading: z.string().max(100).default("Bricolage Grotesque"),
  fontBody: z.string().max(100).default("Inter"),
  avatarKey: z.string().nullable().default(null),
  backgroundImageKey: z.string().nullable().default(null),
  backgroundBrightness: z.number().min(0).max(1).default(1),

  /**
   * Which tile the form paints behind its conversation.
   *
   * Three kinds of value: `auto` hashes the slug, `none` is flat paper, and
   * anything else is a tile id from `apps/web/src/lib/background-patterns.ts`.
   *
   * A plain string rather than an enum, because the tiles are drawn in the web
   * app and the schema has no business importing SVG path data to list their
   * names. The resolver (`resolvePattern`) is what validates: an id it does
   * not recognise falls back to `auto`, so a retired tile leaves the form
   * looking designed instead of blank, and a bad value out of the public API
   * cannot render nothing.
   *
   * It defaults to `auto` and not to `none` because a flat fill is the one
   * background that reads as nobody having chosen it — and because every form
   * built before this field existed already showed its hashed tile.
   */
  backgroundPattern: z.string().max(40).default("auto"),

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
