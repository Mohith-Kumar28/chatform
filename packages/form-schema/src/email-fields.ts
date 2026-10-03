import type { FormDoc } from "./form-doc";

/**
 * The questions in a form whose answer is an email address.
 *
 * An `email` block, or a `contact_info` block that asks for one. The builder
 * lists these wherever an author picks "the address they gave", and the mail
 * job reads the same list, so a question offered in the menu is one the send
 * can use.
 */
export function emailQuestions(doc: Pick<FormDoc, "blocks">): { ref: string; title: string }[] {
  return doc.blocks
    .filter((b) => b.type === "email" || (b.type === "contact_info" && b.fields.includes("email")))
    .map((b) => ({ ref: b.ref, title: b.title }));
}

/** The address one of those questions was given, or null when it was skipped or is not one of them. */
export function emailAnswer(doc: Pick<FormDoc, "blocks">, byRef: Map<string, unknown>, ref: string): string | null {
  const block = doc.blocks.find((b) => b.ref === ref);
  if (!block) return null;
  const raw = byRef.get(ref);
  const value =
    block.type === "email"
      ? raw
      : block.type === "contact_info" && raw && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Record<string, unknown>).email
        : null;
  return typeof value === "string" && value.includes("@") && value.trim().length > 3 ? value.trim() : null;
}

export type ReplyToChoice = { kind: "default" } | { kind: "field"; ref: string } | { kind: "custom"; email: string };

/**
 * Reads a stored Reply-To setting: empty is the default, an address is itself,
 * anything else is the ref of an email question. A ref whose question has been
 * deleted or retyped reads as the default, so the mail still goes out.
 */
export function replyToChoice(value: string | undefined, doc: Pick<FormDoc, "blocks">): ReplyToChoice {
  const v = (value ?? "").trim();
  if (!v) return { kind: "default" };
  if (v.includes("@")) return { kind: "custom", email: v };
  return emailQuestions(doc).some((q) => q.ref === v) ? { kind: "field", ref: v } : { kind: "default" };
}
