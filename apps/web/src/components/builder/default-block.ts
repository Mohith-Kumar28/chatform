import { Block as BlockSchema, type Block } from "@repo/form-schema";

const uid = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;

/**
 * A sensible starting block for each type.
 *
 * refs are the stable identity of an answer — they key results columns and
 * every logic rule, and are never renamed after publish — so they are derived
 * from the type plus entropy rather than from the (editable) title.
 */
export function defaultBlock(type: Block["type"], existingRefs: Set<string>): Block {
  const id = uid("blk");
  const stem = type.replace(/_/g, "");
  let ref = `q_${stem}`;
  let n = 2;
  while (existingRefs.has(ref)) ref = `q_${stem}${n++}`;

  const base = { id, ref, required: false };
  const opt = (label: string) => ({ id: uid("opt"), label });

  switch (type) {
    case "statement":
      return BlockSchema.parse({ ...base, type, title: "A quick note", buttonLabel: "Continue" });
    case "short_text":
      return BlockSchema.parse({ ...base, type, title: "What should we call you?", maxLength: 200 });
    case "long_text":
      return BlockSchema.parse({ ...base, type, title: "Tell us a bit more", maxLength: 1000 });
    case "email":
      return BlockSchema.parse({ ...base, type, title: "What's your email?", required: true });
    case "phone":
      return BlockSchema.parse({ ...base, type, title: "What's the best number to reach you?" });
    case "url":
      return BlockSchema.parse({ ...base, type, title: "What's your website?" });
    case "contact_info":
      return BlockSchema.parse({ ...base, type, title: "How can we reach you?", fields: ["first_name", "last_name", "email"] });
    case "address":
      return BlockSchema.parse({ ...base, type, title: "Where are you based?", fields: ["street", "city", "postal", "country"] });
    case "number":
      return BlockSchema.parse({ ...base, type, title: "How many?" });
    case "date":
      return BlockSchema.parse({ ...base, type, title: "Which date works?" });
    case "yes_no":
      return BlockSchema.parse({ ...base, type, title: "Are you interested?" });
    case "single_select":
      return BlockSchema.parse({ ...base, type, title: "Which one fits best?", options: [opt("Option one"), opt("Option two"), opt("Option three")] });
    case "multi_select":
      return BlockSchema.parse({ ...base, type, title: "Select all that apply", options: [opt("Option one"), opt("Option two"), opt("Option three")] });
    case "dropdown":
      return BlockSchema.parse({ ...base, type, title: "Pick from the list", options: [opt("Option one"), opt("Option two")] });
    case "picture_choice":
      return BlockSchema.parse({ ...base, type, title: "Which do you prefer?", options: [opt("First"), opt("Second")] });
    case "ranking":
      return BlockSchema.parse({ ...base, type, title: "Rank these, best first", items: [{ id: uid("itm"), label: "First item" }, { id: uid("itm"), label: "Second item" }, { id: uid("itm"), label: "Third item" }] });
    case "matrix":
      return BlockSchema.parse({
        ...base, type, title: "How would you rate each?",
        rows: [{ id: uid("row"), label: "Speed" }, { id: uid("row"), label: "Support" }],
        columns: [{ id: uid("col"), label: "Poor" }, { id: uid("col"), label: "Good" }, { id: uid("col"), label: "Great" }],
      });
    case "rating":
      return BlockSchema.parse({ ...base, type, title: "How would you rate us?", scale: 5, shape: "star" });
    case "nps":
      return BlockSchema.parse({ ...base, type, title: "How likely are you to recommend us to a friend?" });
    case "opinion_scale":
      return BlockSchema.parse({ ...base, type, title: "How much do you agree?", steps: 5, startAt: 1, labelLow: "Disagree", labelHigh: "Agree" });
    case "file_upload":
      return BlockSchema.parse({ ...base, type, title: "Upload a file", accept: ["image/png", "image/jpeg", "application/pdf"], maxFiles: 1, maxSizeMB: 10 });
    case "signature":
      return BlockSchema.parse({ ...base, type, title: "Please sign here" });
    case "payment":
      return BlockSchema.parse({ ...base, type, title: "Complete your payment", method: "link", amountMode: "fixed", amount: 0, currency: "USD" });
    case "scheduling":
      return BlockSchema.parse({ ...base, type, title: "Book a time", provider: "external", url: "https://cal.com/your-handle" });
    case "legal_consent":
      return BlockSchema.parse({ ...base, type, title: "Do you accept the terms?", required: true, consentText: "I agree to the terms and privacy policy." });
    case "welcome":
      return BlockSchema.parse({ ...base, type, title: "Hey! Let's get started.", buttonLabel: "Start" });
    default:
      return BlockSchema.parse({ ...base, type: "short_text", title: "New question" });
  }
}
