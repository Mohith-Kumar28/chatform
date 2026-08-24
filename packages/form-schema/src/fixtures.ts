import type { FormDocInput } from "./form-doc.js";

export const leadFormFixture: FormDocInput = {
  title: "Product Waitlist",
  description: "Join the waitlist for our new product",
  blocks: [
    { id: "blk_welcome1", ref: "welcome", type: "welcome", title: "Hey there! 👋 Want early access?", required: false },
    {
      id: "blk_email001", ref: "q_email", type: "email", title: "What's your email?", required: true,
    },
    { id: "blk_name001", ref: "q_name", type: "short_text", title: "And your name?", required: true, minLength: 2, maxLength: 80 },
    {
      id: "blk_role001", ref: "q_role", type: "single_select", title: "What best describes you?", required: true,
      options: [
        { id: "opt_founder1", label: "Founder" },
        { id: "opt_dev00001", label: "Developer" },
        { id: "opt_design01", label: "Designer" },
        { id: "opt_other001", label: "Other" },
      ],
    },
    {
      id: "blk_detail01", ref: "q_detail", type: "long_text", title: "Tell us more about what you're building", required: false,
      visibility: { op: "and", conditions: [{ left: { kind: "ref", ref: "q_role" }, op: "neq", value: "opt_design01" }], groups: [] },
    },
    {
      id: "blk_rating1", ref: "q_excitement", type: "rating", title: "How excited are you?", required: true, scale: 5, shape: "star",
    },
    { id: "blk_consent1", ref: "q_consent", type: "legal_consent", title: "One last thing", required: true, consentText: "I agree to receive product updates." },
  ],
  endings: [
    { id: "end_main001", ref: "end_thanks", title: "You're on the list! 🎉", bodyMd: "We'll be in touch soon.", redirectDelaySec: 5, showSummary: true },
  ],
  logic: [
    {
      id: "rl_skipdetail", action_kind: "goto", from: "q_role", when: {
        op: "and", conditions: [{ left: { kind: "ref", ref: "q_role" }, op: "eq", value: "opt_design01" }], groups: [],
      },
      target: "q_excitement", targetKind: "block",
    },
  ],
  endingRules: [],
  variables: [{ name: "excitement", type: "number", initial: 0 }],
  hiddenFields: [{ name: "utm_source" }, { name: "referral" }],
};
