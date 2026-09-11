import { describe, it, expect } from "vitest";
import {
  FormDoc,
  SCHEMA_VERSION,
  migrateFormDoc,
  needsMigration,
  readFormDoc,
  safeReadFormDoc,
  extractionSchema,
  needsExtraction,
  leadFormFixture,
  toPublicConfig,
  lintFormDoc,
  conditionIsAlwaysTrue,
  DEFAULT_CONFIRMATION_BODY,
  DEFAULT_CONFIRMATION_SUBJECT,
  normalizeE164,
  type Block,
} from "../src/index";

const v1Doc = {
  schemaVersion: 1,
  title: "Old form",
  blocks: [
    { id: "blk_aaa1", ref: "welcome", type: "welcome", title: "Hi" },
    { id: "blk_bbb1", ref: "q_email", type: "email", title: "Email?", required: true },
  ],
  endings: [{ id: "end_aaa1", ref: "end_thanks", title: "Thanks" }],
};

describe("migration chain", () => {
  it("stamps a v1 doc up to the current version", () => {
    const out = migrateFormDoc(v1Doc) as { schemaVersion: number };
    expect(out.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("is idempotent", () => {
    const once = migrateFormDoc(v1Doc);
    const twice = migrateFormDoc(once);
    expect(twice).toEqual(once);
  });

  it("does not touch a doc from a future version", () => {
    const future = { ...v1Doc, schemaVersion: 999 };
    expect((migrateFormDoc(future) as { schemaVersion: number }).schemaVersion).toBe(999);
  });

  it("a migrated v1 doc parses and materializes every new default", () => {
    const doc = FormDoc.parse(migrateFormDoc(v1Doc));
    expect(doc.settings.agent.guardrails.answerOffTopic).toBe(true);
    // `maxTurns` deliberately has no default: it is one of the two agent
    // ceilings the runtime writes from the plan, not something a document
    // carries. See `settings.ts`.
    expect(doc.settings.agent.guardrails.maxTurns).toBeUndefined();
    expect(doc.settings.agent.model).toBeUndefined();
    // per-block additions
    expect(doc.blocks[0]!.agentHints).toBeNull();
    expect(doc.blocks[0]!.media).toBeNull();
    expect(doc.settings.agent.rephraseQuestions).toBe(true);
  });

  it("needsMigration is true for v1 and false once migrated", () => {
    expect(needsMigration(v1Doc)).toBe(true);
    expect(needsMigration(migrateFormDoc(v1Doc))).toBe(false);
  });

  it("v2 cover images fold into the media object", () => {
    const v2 = {
      ...v1Doc,
      schemaVersion: 2,
      blocks: [
        { id: "blk_aaa1", ref: "q_a", type: "short_text", title: "A", coverImageKey: "img_abc" },
        { id: "blk_bbb1", ref: "q_b", type: "short_text", title: "B", coverImageKey: null },
      ],
    };
    const doc = FormDoc.parse(migrateFormDoc(v2));
    expect(doc.blocks[0]!.media).toEqual({ kind: "image", key: "img_abc", url: null });
    expect(doc.blocks[1]!.media).toBeNull();
    // The superseded fields are gone, not merely ignored.
    expect("coverImageKey" in doc.blocks[0]!).toBe(false);
  });

  it("leaves an unparseable value alone for FormDoc to reject", () => {
    expect(migrateFormDoc("not a doc")).toBe("not a doc");
  });
});

describe("readFormDoc", () => {
  /**
   * The bug this guards: stored docs were migrated and then CAST with
   * `as FormDoc`, which skips every Zod default. Any field added after a
   * version was published came back undefined — `requireSubmit` was missing
   * from the public config for exactly this reason.
   */
  it("materializes defaults added after the doc was written", () => {
    const doc = readFormDoc(v1Doc);
    expect(doc.settings.onComplete.requireSubmit).toBe(true);
    expect(doc.settings.agent.rephraseQuestions).toBe(true);
    expect(doc.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("throws on a document it cannot read", () => {
    // Serving a form we cannot parse as though it were fine is worse than
    // failing loudly.
    expect(() => readFormDoc({ schemaVersion: 1, title: "" })).toThrow();
  });

  it("safeReadFormDoc returns null instead of throwing", () => {
    expect(safeReadFormDoc({ schemaVersion: 1, title: "" })).toBeNull();
    expect(safeReadFormDoc(v1Doc)?.title).toBe("Old form");
  });

  /**
   * v4 → v5: `settings.duplicates.strategy` collapses to `allowResubmissions`.
   *
   * "field" is the interesting case. The builder offered it and no code path
   * ever enforced it, so a form set that way had been claiming a protection it
   * did not have; it migrates to the boolean that finally provides one.
   */
  describe("the duplicates strategy that became a boolean", () => {
    const at4 = (duplicates: unknown) =>
      readFormDoc({ ...v1Doc, schemaVersion: 4, settings: { duplicates } });

    it("reads 'none' as resubmissions allowed", () => {
      expect(at4({ strategy: "none" }).settings.allowResubmissions).toBe(true);
    });

    it("reads every other strategy as resubmissions refused", () => {
      expect(at4({ strategy: "ip_daily" }).settings.allowResubmissions).toBe(false);
      expect(at4({ strategy: "field", fieldRef: "q_email" }).settings.allowResubmissions).toBe(false);
    });

    it("allows resubmissions on a doc that never set the field", () => {
      expect(at4(undefined).settings.allowResubmissions).toBe(true);
    });

    it("drops the old key rather than carrying both", () => {
      const out = migrateFormDoc({ ...v1Doc, schemaVersion: 4, settings: { duplicates: { strategy: "ip_daily" } } });
      expect((out as { settings: Record<string, unknown> }).settings.duplicates).toBeUndefined();
    });

    it("is idempotent", () => {
      const once = migrateFormDoc({ ...v1Doc, schemaVersion: 4, settings: { duplicates: { strategy: "ip_daily" } } });
      expect(migrateFormDoc(once)).toEqual(once);
    });
  });
});

describe("agent layer", () => {
  it("defaults new forms to ai mode", () => {
    expect(FormDoc.parse(leadFormFixture).settings.agent.mode).toBe("ai");
  });

  it("accepts a full agent config", () => {
    const doc = FormDoc.parse({
      ...v1Doc,
      schemaVersion: SCHEMA_VERSION,
      settings: {
        agent: {
          mode: "ai",
          model: "anthropic/claude-sonnet-5",
          goal: "Qualify the lead and book a demo",
          guardrails: { answerOffTopic: false, forbiddenTopics: ["competitors"] },
        },
      },
    });
    expect(doc.settings.agent.goal).toBe("Qualify the lead and book a demo");
    expect(doc.settings.agent.guardrails.answerOffTopic).toBe(false);
    // unspecified guardrails still default
    expect(doc.settings.agent.guardrails.refusalMessage).toContain("not sure about that one");
  });

  /**
   * Knowledge left the document at v7.
   *
   * It was an array of title/body entries inlined into the system prompt,
   * capped at twenty entries and twenty thousand characters because that is
   * what a prompt sent on every turn can afford. It now lives in
   * `knowledge_sources`, is chunked and embedded, and is retrieved per
   * question — so the document must no longer carry it, and a stored document
   * that still does must come back without it.
   */
  it("drops knowledge from a document that still carries it", () => {
    const migrated = migrateFormDoc({
      ...v1Doc,
      schemaVersion: 6,
      settings: { agent: { knowledge: [{ id: "kb_0001", title: "Pricing", body: "Pro is $29/month." }] } },
    }) as { schemaVersion: number; settings: { agent: Record<string, unknown> } };

    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    expect(migrated.settings.agent.knowledge).toBeUndefined();
  });

  it("leaves an agent block that never had knowledge alone", () => {
    const migrated = migrateFormDoc({
      ...v1Doc,
      schemaVersion: 6,
      settings: { agent: { goal: "Book a demo" } },
    }) as { settings: { agent: Record<string, unknown> } };

    expect(migrated.settings.agent.goal).toBe("Book a demo");
    expect(migrated.settings.agent.knowledge).toBeUndefined();
  });

  /**
   * The confirmation email turns on at v8.
   *
   * The field existed before that, defaulted off, and had no control anywhere in
   * the builder — so a stored `false` records the absence of a decision rather
   * than a decision, and the migration reads it that way. This is the only
   * migration in the chain that changes what a published form *does*, which is
   * why it is asserted rather than assumed.
   */
  describe("v7 → v8: the respondent's confirmation email", () => {
    type Migrated = {
      schemaVersion: number;
      settings: { onComplete: { autoReplyEmail: Record<string, unknown> } };
    };

    it("switches on for a document that predates the setting", () => {
      const migrated = migrateFormDoc({ ...v1Doc, schemaVersion: 7 }) as Migrated;
      const confirmation = migrated.settings.onComplete.autoReplyEmail;
      expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
      expect(confirmation.enabled).toBe(true);
      expect(confirmation.includeAnswers).toBe(true);
      expect(confirmation.subject).toBe(DEFAULT_CONFIRMATION_SUBJECT);
      expect(confirmation.bodyMd).toBe(DEFAULT_CONFIRMATION_BODY);
    });

    it("keeps copy the author wrote through the API", () => {
      const migrated = migrateFormDoc({
        ...v1Doc,
        schemaVersion: 7,
        settings: {
          onComplete: { autoReplyEmail: { enabled: true, subject: "We got it", bodyMd: "Speak soon." } },
        },
      }) as Migrated;

      expect(migrated.settings.onComplete.autoReplyEmail.subject).toBe("We got it");
      expect(migrated.settings.onComplete.autoReplyEmail.bodyMd).toBe("Speak soon.");
    });

    it("leaves the rest of onComplete alone", () => {
      const migrated = migrateFormDoc({
        ...v1Doc,
        schemaVersion: 7,
        settings: { onComplete: { notificationEmails: ["owner@example.com"], delaySec: 9 } },
      }) as Migrated & { settings: { onComplete: Record<string, unknown> } };

      expect(migrated.settings.onComplete.notificationEmails).toEqual(["owner@example.com"]);
      expect(migrated.settings.onComplete.delaySec).toBe(9);
    });

    /**
     * The switch has to stay off once there is a switch to turn. A doc already
     * at v8 skips the chain, so an author's "no" survives every later read.
     */
    it("does not re-enable a form whose author has turned it off", () => {
      const off = {
        ...v1Doc,
        schemaVersion: SCHEMA_VERSION,
        settings: { onComplete: { autoReplyEmail: { enabled: false } } },
      };
      const migrated = migrateFormDoc(off) as Migrated;
      expect(migrated.settings.onComplete.autoReplyEmail.enabled).toBe(false);
      expect(FormDoc.parse(migrated).settings.onComplete.autoReplyEmail.enabled).toBe(false);
    });
  });

  /**
   * v8 → v9: quiet hours, and the line drawn around them.
   *
   * The schema default is `true`, so a document minted today holds its
   * reminders out of the respondent's night. The migration exists to make sure
   * that default never reaches a document written before the feature did —
   * an author already running a sequence did not agree to a twelve-hour
   * nightly hold, and mail cannot be un-sent if we guess wrong.
   */
  describe("v8 → v9: quiet hours", () => {
    type Migrated = {
      schemaVersion: number;
      settings: { followUp: Record<string, unknown> };
    };

    it("pins a document that predates the setting to off", () => {
      const migrated = migrateFormDoc({ ...v1Doc, schemaVersion: 8 }) as Migrated;
      expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
      expect(migrated.settings.followUp.quietHours).toBe(false);
      expect(FormDoc.parse(migrated).settings.followUp.quietHours).toBe(false);
    });

    it("pins a document from the very beginning of the chain too", () => {
      // The whole chain runs, so a v1 doc is as much "written before this
      // existed" as a v8 one is.
      expect(FormDoc.parse(migrateFormDoc(v1Doc)).settings.followUp.quietHours).toBe(false);
    });

    it("gives a freshly minted document the safer default", () => {
      // The shape `defaultDoc`, the seed templates and the AI generator all
      // produce: no stored version, parsed rather than migrated.
      const { schemaVersion: _ignored, ...unversioned } = v1Doc;
      expect(FormDoc.parse({ ...unversioned, settings: {} }).settings.followUp.quietHours).toBe(true);
    });

    it("leaves an explicit choice alone in either direction", () => {
      const on = migrateFormDoc({
        ...v1Doc,
        schemaVersion: 8,
        settings: { followUp: { quietHours: true } },
      }) as Migrated;
      expect(on.settings.followUp.quietHours).toBe(true);
    });

    it("leaves the rest of the follow-up settings alone", () => {
      const migrated = migrateFormDoc({
        ...v1Doc,
        schemaVersion: 8,
        settings: { followUp: { enabled: true, holdoutPercent: 10, replyTo: "a@b.com" } },
      }) as Migrated;
      expect(migrated.settings.followUp.enabled).toBe(true);
      expect(migrated.settings.followUp.holdoutPercent).toBe(10);
      expect(migrated.settings.followUp.replyTo).toBe("a@b.com");
    });
  });

  it("ignores a knowledge key on a parsed document", () => {
    const doc = FormDoc.parse({
      ...v1Doc,
      settings: { agent: { knowledge: [{ id: "kb_0001", title: "Pricing", body: "x" }] } },
    });
    expect((doc.settings.agent as Record<string, unknown>).knowledge).toBeUndefined();
  });
});

describe("per-block agent hints", () => {
  it("round-trips hints and media", () => {
    const doc = FormDoc.parse({
      ...v1Doc,
      blocks: [
        {
          id: "blk_aaa1",
          ref: "q_budget",
          type: "number",
          title: "Budget?",
          agentHints: { askStyle: "casual", whyWeAsk: "To size the proposal", examples: ["50000"] },
          media: { kind: "image", key: "img_1", alt: "Pricing tiers" },
          prefillParam: "utm_budget",
          buttonLabel: "Next",
        },
      ],
    });
    const b = doc.blocks[0]!;
    expect(b.agentHints?.askStyle).toBe("casual");
    expect(b.agentHints?.examples).toEqual(["50000"]);
    expect(b.media?.kind).toBe("image");
    expect(b.media?.alt).toBe("Pricing tiers");
    expect(b.prefillParam).toBe("utm_budget");
  });
});

describe("extraction schemas", () => {
  const block = (b: Record<string, unknown>) =>
    FormDoc.parse({ ...v1Doc, blocks: [{ id: "blk_xxx1", ref: "q_x", ...b }] }).blocks[0]! as Block;

  it("skips deterministic and out-of-band types", () => {
    expect(needsExtraction(block({ type: "yes_no", title: "?" }))).toBe(false);
    expect(
      needsExtraction(
        block({ type: "single_select", title: "?", options: [{ id: "opt_aaa1", label: "A" }] }),
      ),
    ).toBe(false);
    expect(needsExtraction(block({ type: "file_upload", title: "?", accept: ["image/png"] }))).toBe(false);
    expect(needsExtraction(block({ type: "date", title: "?" }))).toBe(true);
  });

  it("date accepts ISO and rejects anything else", () => {
    const s = extractionSchema(block({ type: "date", title: "When?" }))!;
    expect(s.safeParse({ value: "2026-03-04", confident: true, note: null }).success).toBe(true);
    expect(s.safeParse({ value: "next friday", confident: true, note: null }).success).toBe(false);
  });

  it("number honors the block's own bounds", () => {
    const s = extractionSchema(block({ type: "number", title: "Age?", min: 18, max: 99, integerOnly: true }))!;
    expect(s.safeParse({ value: 30, confident: true, note: null }).success).toBe(true);
    expect(s.safeParse({ value: 12, confident: true, note: null }).success).toBe(false);
    expect(s.safeParse({ value: 30.5, confident: true, note: null }).success).toBe(false);
  });

  it("ranking demands every item exactly once", () => {
    const b = block({
      type: "ranking",
      title: "Rank",
      items: [{ id: "it_aaa1", label: "A" }, { id: "it_bbb1", label: "B" }],
    });
    const s = extractionSchema(b)!;
    expect(s.safeParse({ value: ["it_bbb1", "it_aaa1"], confident: true, note: null }).success).toBe(true);
    expect(s.safeParse({ value: ["it_aaa1"], confident: true, note: null }).success).toBe(false);
    expect(s.safeParse({ value: ["it_aaa1", "it_zzz1"], confident: true }).success).toBe(false);
  });

  it("address only allows the fields the block declares", () => {
    const s = extractionSchema(block({ type: "address", title: "Where?", fields: ["city", "country"] }))!;
    const res = s.safeParse({ value: { city: "Berlin", country: "DE" }, confident: true, note: null });
    expect(res.success).toBe(true);
  });

  it("a null value with confident=false is always valid — that is the clarify path", () => {
    const s = extractionSchema(block({ type: "date", title: "When?" }))!;
    expect(s.safeParse({ value: null, confident: false, note: "ambiguous" }).success).toBe(true);
  });
});

describe("respondent auth (v3 → v4, v5 → v6)", () => {
  // The fixture leans on schema defaults and carries no `settings` key at all.
  const base = () => {
    const doc = structuredClone(leadFormFixture) as Record<string, unknown>;
    doc.settings ??= {};
    return doc;
  };

  it("carries a legacy boolean requireAuth: true into the object form", () => {
    const doc = base();
    doc.schemaVersion = 3;
    (doc.settings as Record<string, unknown>).requireAuth = true;
    const out = readFormDoc(doc);
    expect(out.settings.requireAuth.enabled).toBe(true);
    expect(out.settings.requireAuth.method).toBe("google");
    // The gate message has to materialize, or the chat renders an empty prompt.
    expect(out.settings.requireAuth.message.length).toBeGreaterThan(0);
  });

  it("treats a legacy false — and a missing field — as no gate", () => {
    const off = base();
    off.schemaVersion = 3;
    (off.settings as Record<string, unknown>).requireAuth = false;
    expect(readFormDoc(off).settings.requireAuth.enabled).toBe(false);

    const absent = base();
    absent.schemaVersion = 1;
    delete (absent.settings as Record<string, unknown>).requireAuth;
    expect(readFormDoc(absent).settings.requireAuth.enabled).toBe(false);
  });

  it("does not clobber an already-migrated object on a second pass", () => {
    const doc = base();
    (doc.settings as Record<string, unknown>).requireAuth = {
      enabled: true,
      methods: ["phone"],
      message: "Verify your number",
    };
    const once = migrateFormDoc(doc);
    expect(migrateFormDoc(once)).toEqual(once);
    expect(readFormDoc(doc).settings.requireAuth.method).toBe("phone");
  });

  it("collapses a two-method gate onto the first method it listed", () => {
    const doc = base();
    (doc.settings as Record<string, unknown>).requireAuth = {
      enabled: true,
      methods: ["phone", "google"],
    };
    const out = readFormDoc(doc);
    expect(out.settings.requireAuth.method).toBe("phone");
    // The list itself is gone, not carried alongside its replacement.
    expect((out.settings.requireAuth as Record<string, unknown>).methods).toBeUndefined();
  });

  it("projects the gate into the public config, and null when it is off", () => {
    const on = base();
    (on.settings as Record<string, unknown>).requireAuth = { enabled: true, methods: ["google", "phone"] };
    const cfg = toPublicConfig(readFormDoc(on), { slug: "s", brandingHidden: false });
    expect(cfg.requireAuth?.method).toBe("google");

    const offCfg = toPublicConfig(readFormDoc(base()), { slug: "s", brandingHidden: false });
    expect(offCfg.requireAuth).toBeNull();
  });

  it("normalizes phone numbers the same way the phone block validator does", () => {
    expect(normalizeE164("+1 (415) 555-0132")).toBe("+14155550132");
    expect(normalizeE164("004915112345678")).toBe("+4915112345678");
    expect(normalizeE164("9986543210", "91")).toBe("+919986543210");
    // No country code and no hint is ambiguous, so it must not guess.
    expect(normalizeE164("5550132")).toBeNull();
    expect(normalizeE164("not a number")).toBeNull();
  });
});

describe("reachability linting", () => {
  const doc = (blocks: unknown[], logic: unknown[] = [], endings = ["end_thanks"]) =>
    FormDoc.parse({
      title: "t",
      blocks,
      endings: endings.map((ref, i) => ({ id: `end_lint${i}0`, ref, title: ref })),
      logic,
    });

  const q = (ref: string, options?: string[]) => ({
    id: `blk_${ref}`,
    ref,
    type: options ? "single_select" : "short_text",
    title: ref,
    required: true,
    ...(options ? { options: options.map((o) => ({ id: o, label: o })) } : {}),
  });

  const rating = (ref: string) => ({ id: `blk_${ref}`, ref, type: "rating", title: ref, required: true, scale: 5 });

  const goto = (from: string, op: string, value: unknown, target: string) => ({
    id: `rl_${from.slice(0, 8)}_${String(value)}`.slice(0, 24),
    action_kind: "goto",
    from,
    when: {
      op: "and",
      conditions: [{ left: { kind: "ref", ref: from }, op, ...(value === null ? {} : { value }) }],
      groups: [],
    },
    target,
    targetKind: target.startsWith("end_") ? "ending" : "block",
    branch: "true",
  });

  const codes = (d: ReturnType<typeof doc>) => lintFormDoc(d).map((i) => i.code);

  it("flags a question that every branch jumps over", () => {
    // Exactly what the AI generator produced: a rating splits the flow into
    // two follow-ups, and the question meant for everyone sits between the
    // split and the arms, where no path can reach it.
    const d = doc(
      [rating("q_rating"), q("q_channel"), q("q_bad"), q("q_good")],
      [goto("q_rating", "lte", 3, "q_bad"), goto("q_rating", "gte", 4, "q_good")],
    );
    const issue = lintFormDoc(d).find((i) => i.code === "unreachable_blocks");
    expect(issue).toBeDefined();
    expect(issue!.level).toBe("error");
    expect(issue!.message).toContain("q_channel");
  });

  it("does not flag it when the branches leave a gap to fall through", () => {
    // `lte 2` and `gte 4` say nothing about 3, so a 3 still falls through.
    const d = doc(
      [rating("q_rating"), q("q_channel"), q("q_bad"), q("q_good")],
      [goto("q_rating", "lte", 2, "q_bad"), goto("q_rating", "gte", 4, "q_good")],
    );
    expect(codes(d)).not.toContain("unreachable_blocks");
  });

  it("treats every option of a choice question being spoken for as exhaustive", () => {
    const covered = doc(
      [q("q_role", ["opt_alpha", "opt_beta"]), q("q_skipped"), q("q_a"), q("q_b")],
      [goto("q_role", "eq", "opt_alpha", "q_a"), goto("q_role", "eq", "opt_beta", "q_b")],
    );
    expect(codes(covered)).toContain("unreachable_blocks");

    // One option left unrouted, so that answer falls through as normal.
    const partial = doc(
      [q("q_role", ["opt_alpha", "opt_beta", "opt_gamma"]), q("q_next"), q("q_a"), q("q_b")],
      [goto("q_role", "eq", "opt_alpha", "q_a"), goto("q_role", "eq", "opt_beta", "q_b")],
    );
    expect(codes(partial)).not.toContain("unreachable_blocks");
  });

  it("leaves a plain linear form alone", () => {
    expect(codes(doc([q("q_one"), q("q_two"), q("q_three")]))).not.toContain("unreachable_blocks");
  });

  it("does not call a block unreachable just because some other rule targets it", () => {
    // The old check pooled every goto target in the document into every
    // block's successors, which made this pass for the wrong reason — and made
    // the case above impossible to detect. Both must hold at once.
    const d = doc(
      [q("q_one", ["opt_xray", "opt_yank"]), q("q_two"), q("q_three")],
      [goto("q_one", "eq", "opt_xray", "q_three")],
    );
    expect(codes(d)).not.toContain("unreachable_blocks");
  });
});

describe("conditions that cannot fail", () => {
  const required = { ref: "q_email", required: true };
  const optional = { ref: "q_email", required: false };
  const cond = (op: string, ref = "q_email") =>
    ({ left: { kind: "ref" as const, ref }, op }) as Parameters<typeof conditionIsAlwaysTrue>[0];

  it("treats is_not_empty on a required question as always true", () => {
    // The generator writes this to mean "and then", and it can never fail:
    // the respondent cannot move past a required question without answering.
    expect(conditionIsAlwaysTrue(cond("is_not_empty"), required)).toBe(true);
  });

  it("leaves it alone when the question is optional", () => {
    // Here it is a real test — the answer genuinely may be blank.
    expect(conditionIsAlwaysTrue(cond("is_not_empty"), optional)).toBe(false);
  });

  it("only applies to the question the rule hangs off", () => {
    expect(conditionIsAlwaysTrue(cond("is_not_empty", "q_other"), required)).toBe(false);
    expect(conditionIsAlwaysTrue(cond("is_not_empty"), null)).toBe(false);
  });

  it("says nothing about any other operator", () => {
    for (const op of ["eq", "neq", "is_empty", "gt", "contains"]) {
      expect(conditionIsAlwaysTrue(cond(op), required)).toBe(false);
    }
  });
});
