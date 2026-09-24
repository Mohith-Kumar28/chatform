/**
 * The document the run builds, composed by hand.
 *
 * Hand-written on purpose. The question this harness exists to answer is
 * whether a developer with the docs and nothing else can author a form over
 * HTTP, so importing `@repo/form-schema` to build it would assume away the
 * thing being tested. Every field here was read off a block's JSON Schema from
 * `GET /v1/blocks/{type}` or a template returned by `GET /v1/templates/{slug}`,
 * which is exactly what a developer has access to.
 *
 * The form is shaped to exercise the parts that break: the `poll` block (the
 * newest), a screen-out ending with requirements, and a branch that reaches it.
 *
 * `requirements` is an array of `{ id, label, when }` objects, not strings.
 * Nothing a developer can read says so: `PUT /v1/forms/{id}/doc` declares its
 * body as `doc: {}` in the spec, no docs page describes an ending, and the
 * linter answers a string with "Requirements: This is missing" without ever
 * naming the type it wanted. It was found by guessing.
 *
 * The branch lives in `endingRules`, not `logic`. A `goto` in `logic` is
 * evaluated against the block it fires from, so a rule reading another
 * question's answer gets quietly rewritten into something that does not mean
 * what it says. `endingRules` is where a cross-question test belongs.
 */

const nano = (seed: string) => `${seed}${Math.random().toString(36).slice(2, 8)}`.slice(0, 20);

export interface TestDoc {
  doc: Record<string, unknown>;
  /** Refs the run answers, in flow order. */
  refs: {
    name: string;
    email: string;
    role: string;
    poll: string;
    rating: string;
    teamSize: string;
    notes: string;
    consent: string;
  };
  endings: { success: string; screenOut: string };
  /** The option that routes to the screen-out: its label, and the id a condition must name. */
  screenOutChoice: string;
  screenOutOptionId: string;
  /** Poll option ids, in the order their labels were given. */
  pollOptionIds: string[];
  pollChoices: string[];
}

export function buildTestDoc(runId: string): TestDoc {
  const refs = {
    name: "q_name",
    email: "q_email",
    role: "q_role",
    poll: "q_priorities",
    rating: "q_rating",
    teamSize: "q_team_size",
    notes: "q_notes",
    consent: "q_consent",
  };
  const endings = { success: "end_thanks", screenOut: "end_not_eligible" };
  const screenOutChoice = "Just browsing";
  const pollChoices = ["Speed", "Accuracy", "Cost"];

  const base = (ref: string, title: string, required = true) => ({
    id: nano("blk"),
    ref,
    title,
    required,
    visibility: null,
    image_key: null,
    agentHints: null,
    media: null,
  });

  const opt = (label: string) => ({ id: nano("opt"), label, image_key: null });

  /**
   * A condition compares an option's **id**, never its label. The linter says
   * so plainly, which is the only reason this is right: nothing in the docs or
   * the spec mentions it, and a rule written against the label is accepted,
   * stored, and silently never fires.
   */
  const roleOptions = [opt("Building something"), opt("Evaluating for a team"), opt(screenOutChoice)];
  const screenOutOptionId = roleOptions[2].id;
  const pollOptions = pollChoices.map(opt);

  const doc = {
    schemaVersion: 9,
    title: `zz-apitest ${runId}`,
    description: "Created by the API verification run. Safe to delete.",
    blocks: [
      { ...base("welcome", "A short form, built entirely over the API.", false), buttonLabel: "Start", type: "welcome" },
      { ...base(refs.name, "What should we call you?"), maxLength: 80, type: "short_text" },
      { ...base(refs.email, "Where can we reach you?"), type: "email" },
      {
        ...base(refs.role, "What brings you here?"),
        options: roleOptions,
        allowOther: false,
        type: "single_select",
      },
      {
        ...base(refs.poll, "What matters most to you?"),
        options: pollOptions,
        showResults: true,
        minResponsesToReveal: 2,
        type: "poll",
      },
      { ...base(refs.rating, "How is this going so far?"), scale: 5, shape: "star", type: "rating" },
      { ...base(refs.teamSize, "How many people are on your team?", false), type: "number" },
      { ...base(refs.notes, "Anything else worth knowing?", false), type: "long_text" },
      {
        ...base(refs.consent, "Before we finish"),
        consentText: "You agree this test record may be deleted without notice.",
        allowDecline: false,
        agreeLabel: "I agree",
        type: "legal_consent",
      },
    ],
    endings: [
      {
        id: nano("end"),
        ref: endings.success,
        title: "That is everything. Thank you.",
        bodyMd: "Nothing here is real. The run deletes this form when it finishes.",
        imageUrl: null,
        redirectDelaySec: 4,
        showSummary: false,
        kind: "success",
        requirements: [],
      },
      {
        id: nano("end"),
        ref: endings.screenOut,
        title: "This one is not for you yet.",
        bodyMd: "Come back when you are building something.",
        imageUrl: null,
        redirectDelaySec: 4,
        showSummary: false,
        kind: "screen_out",
        requirements: [
          { id: nano("req"), label: "Building something, or evaluating for a team", when: null },
        ],
      },
    ],
    /**
     * The screen-out branch, and deliberately without a `from`.
     *
     * Ending rules are evaluated once, after the last question. Pinning one to
     * a question makes it unreachable, and the linter says exactly that rather
     * than letting it ship silently dead.
     */
    endingRules: [
      {
        id: nano("rl"),
        action_kind: "goto",
        when: {
          op: "and",
          conditions: [{ left: { kind: "ref", ref: refs.role }, op: "eq", value: screenOutOptionId }],
          groups: [],
        },
        target: endings.screenOut,
        targetKind: "ending",
      },
    ],
    logic: [],
    layout: {},
    variables: [],
    hiddenFields: [],
    settings: {},
    theme: {},
  };

  return { doc, refs, endings, screenOutChoice, screenOutOptionId, pollChoices, pollOptionIds: pollOptions.map((o) => o.id) };
}
