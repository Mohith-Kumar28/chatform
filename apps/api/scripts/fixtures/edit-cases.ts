import { FormDoc } from "@repo/form-schema";

/**
 * Real edit requests, and what a correct answer looks like.
 *
 * Every case here is a failure the codebase already documents — the Android
 * rewire that lost an arm, the UPI ticket that became a text box, the
 * "only college addresses" edit that returned "that already looks the way you
 * described". They are the cases the two paths should be judged on, because
 * they are the ones that have actually cost an author something.
 *
 * `expect` is deliberately shallow: this measures whether the edit LANDED, not
 * whether the wording is good. Anything subtler is a judgement a human makes
 * reading the diff.
 */

export interface EditCase {
  name: string;
  doc: FormDoc;
  prompt: string;
  expect: {
    /** Refs that must exist afterwards and did not before. */
    addedRefs?: string[];
    /** Refs that must have been changed in place. */
    updatedRefs?: string[];
    /** Refs that must be gone. */
    removedRefs?: string[];
    /** At least one route from → to must exist. */
    routes?: { from: string; to: string }[];
    /**
     * Routes that existed BEFORE and must still exist, unchanged. This is
     * the half a shallow judge misses: an edit can do what was asked and
     * quietly delete an arm nobody mentioned.
     */
    preservedRoutes?: { from: string; to: string }[];
    /** An ending with this ref and kind must exist. */
    endings?: { ref?: string; kind: "success" | "screen_out" }[];
    /** A block with this ref must have this type. */
    types?: Record<string, string>;
    /** No new questions at all — the commonest correct answer. */
    addsNothing?: boolean;
  };
}

const doc = (over: Partial<Parameters<typeof FormDoc.parse>[0]> & { blocks: unknown[]; endings: unknown[] }): FormDoc =>
  FormDoc.parse({
    id: "frm_bench000001",
    version: 1,
    title: "A form",
    description: "",
    logic: [],
    ...over,
  });

const welcome = { id: "blk_bench000001", ref: "welcome", type: "welcome", title: "Hi there", required: false };
const thanks = { id: "end_bench000001", ref: "end_thanks", title: "Thanks — we'll be in touch", kind: "success" };

/** The waitlist that keeps appearing in the comments: a platform choice, then an email. */
const platformForm = () =>
  doc({
    title: "Waitlist",
    blocks: [
      welcome,
      {
        id: "blk_bench000002",
        ref: "q_platform",
        type: "single_select",
        title: "Which platform do you use?",
        required: true,
        options: [
          { id: "opt_bench0001", label: "iPhone" },
          { id: "opt_bench0002", label: "Android" },
          { id: "opt_bench0003", label: "Chrome extension" },
        ],
      },
      { id: "blk_bench000003", ref: "q_email", type: "email", title: "What's your email?", required: true },
    ],
    endings: [thanks],
  });

const teamForm = () =>
  doc({
    title: "Hackathon registration",
    blocks: [
      welcome,
      { id: "blk_bench000011", ref: "q_team_name", type: "short_text", title: "Team name", required: true },
      { id: "blk_bench000012", ref: "q_email", type: "email", title: "Team lead's email", required: true },
      { id: "blk_bench000013", ref: "q_size", type: "number", title: "How many on your team?", required: true },
    ],
    endings: [thanks],
  });

const feedbackForm = () =>
  doc({
    title: "Event feedback",
    blocks: [
      welcome,
      { id: "blk_bench000021", ref: "q_rating", type: "rating", title: "How was it?", required: true, scale: 5, shape: "star" },
      { id: "blk_bench000022", ref: "q_comments", type: "long_text", title: "Anything else?", required: false, minLength: 0, maxLength: 2000 },
    ],
    endings: [thanks],
  });

/**
 * A form that ALREADY branches, which is where edits go wrong.
 *
 * iPhone and Android each have their own follow-up; Chrome extension users
 * skip both. An edit that touches one arm must leave the other two exactly as
 * they are — the failure `ai.ts` records is a model restating two of three
 * options and silently deleting the third.
 */
const branchedForm = (): FormDoc =>
  doc({
    title: "Waitlist",
    blocks: [
      welcome,
      {
        id: "blk_bench000031", ref: "q_platform", type: "single_select", title: "Which platform?", required: true,
        options: [
          { id: "opt_bench0031", label: "iPhone" },
          { id: "opt_bench0032", label: "Android" },
          { id: "opt_bench0033", label: "Chrome extension" },
        ],
      },
      { id: "blk_bench000032", ref: "q_ios_build", type: "short_text", title: "Which iOS version?", required: false, minLength: 0, maxLength: 100 },
      { id: "blk_bench000033", ref: "q_play_email", type: "email", title: "Play Store email?", required: false },
      { id: "blk_bench000034", ref: "q_email", type: "email", title: "Your email?", required: true },
    ],
    endings: [thanks],
    logic: [
      { id: "rl_bench0001", action_kind: "goto", from: "q_platform", target: "q_ios_build", targetKind: "block",
        when: { op: "and", conditions: [{ left: { kind: "ref", ref: "q_platform" }, op: "eq", value: "opt_bench0031" }], groups: [] } },
      { id: "rl_bench0002", action_kind: "goto", from: "q_platform", target: "q_play_email", targetKind: "block",
        when: { op: "and", conditions: [{ left: { kind: "ref", ref: "q_platform" }, op: "eq", value: "opt_bench0032" }], groups: [] } },
      { id: "rl_bench0003", action_kind: "goto", from: "q_platform", target: "q_email", targetKind: "block",
        when: { op: "and", conditions: [{ left: { kind: "ref", ref: "q_platform" }, op: "eq", value: "opt_bench0033" }], groups: [] } },
      { id: "rl_bench0004", action_kind: "goto", from: "q_ios_build", target: "q_email", targetKind: "block",
        when: { op: "and", conditions: [], groups: [] } },
      { id: "rl_bench0005", action_kind: "goto", from: "q_play_email", target: "q_email", targetKind: "block",
        when: { op: "and", conditions: [], groups: [] } },
    ],
  });

export const EDIT_CASES: EditCase[] = [
  {
    // `ai.ts:514-524` — the rewire that restated two of three options and
    // silently deleted the Android route.
    name: "rewire one arm without losing the others",
    doc: platformForm(),
    prompt: "Chrome extension users should skip straight to the end — don't ask them for an email.",
    expect: { addsNothing: true, routes: [{ from: "q_platform", to: "end_thanks" }] },
  },
  {
    // The shape the EditDraft doc comment calls "a pure routing change on
    // questions that were already there", which the old schema could not express
    // without inventing a filler question.
    name: "add a question asked only for some answers",
    doc: platformForm(),
    prompt:
      "If they're on Android I need their Play Store email instead of their normal one. That's the only change.",
    expect: { addedRefs: [], routes: [{ from: "q_platform", to: "" }] },
  },
  {
    // §4f(1) — shipped broken: applyBlockConfig never read `domains=`.
    name: "hold an existing email question to a domain",
    doc: teamForm(),
    prompt: "Only accept college email addresses — they must end in @vtu.ac.in.",
    expect: { addsNothing: true, updatedRefs: ["q_email"] },
  },
  {
    // `draft-normalize.ts` — "the team name has to be unique" used to be
    // answerable only by adding a second team-name question.
    name: "make an existing answer unique",
    doc: teamForm(),
    prompt: "Two teams shouldn't be able to register with the same team name.",
    expect: { addsNothing: true, updatedRefs: ["q_team_name"] },
  },
  {
    // `normalizeBlock`'s payment comment — "the ticket is 499 rupees, UPI
    // mohith808@axl" became a short-text box titled "Payment Confirmation".
    name: "take a payment rather than ask about one",
    doc: teamForm(),
    prompt: "Registration is ₹499 per team, paid over UPI to acme@okhdfcbank. Collect it at the end.",
    expect: { types: { __any_payment__: "payment" } },
  },
  {
    // The screen_out doc comment — a team that had declared itself ineligible
    // was shown "Registration Submitted Successfully".
    name: "refuse a submission that does not qualify",
    doc: teamForm(),
    prompt:
      "Teams must have between 2 and 5 members. If they don't, they shouldn't be able to submit — tell them why.",
    expect: { endings: [{ kind: "screen_out" }] },
  },
  {
    // `field_group` — "Member 1 name, Member 2 name" is the mistake.
    name: "collect the same details once per person",
    doc: teamForm(),
    prompt: "I need every team member's full name and email, not just the lead's. Teams are 2 to 5 people.",
    expect: { types: { __any_field_group__: "field_group" } },
  },
  {
    // `scheduling` vs `date` — the type that silently became a date question.
    name: "book against a real calendar",
    doc: feedbackForm(),
    prompt: "Let them book a 15-minute follow-up call at https://cal.com/acme/15min.",
    expect: { types: { __any_scheduling__: "scheduling" } },
  },
  {
    // A request that needs nothing. The old path invented a filler question
    // ("Is there anything else you would like us to know?") to have something
    // to return.
    name: "recognise a request that is already satisfied",
    doc: teamForm(),
    prompt: "Make sure the team lead's email is required.",
    expect: { addsNothing: true },
  },
  {
    name: "remove a question that is no longer wanted",
    doc: feedbackForm(),
    prompt: "Drop the free-text comments question, nobody fills it in.",
    expect: { removedRefs: ["q_comments"], addsNothing: true },
  },
  {
    /**
     * The documented failure, exactly: a model that restates two of three
     * options deletes the third. Every arm must still be routed afterwards —
     * and the one the request never mentioned must go where it always went.
     */
    name: "HARD: change one arm of a three-way branch",
    doc: branchedForm(),
    prompt: "Android users should go straight to the normal email question — we don't need their Play Store email any more.",
    expect: {
      addsNothing: true,
      preservedRoutes: [{ from: "q_platform", to: "q_ios_build" }],
      routes: [{ from: "q_platform", to: "q_email" }],
    },
  },
  {
    /**
     * A new question for one arm only. It has to land BELOW the decider, or
     * the branch pointing at it is dropped as a loop — silently, by
     * `buildFlowRules`.
     */
    name: "HARD: add a question for one arm of an existing branch",
    doc: branchedForm(),
    prompt: "For Chrome extension users only, ask which browser version they're on. Nobody else should see it.",
    expect: {
      preservedRoutes: [
        { from: "q_platform", to: "q_ios_build" },
        { from: "q_platform", to: "q_play_email" },
      ],
    },
  },
];
