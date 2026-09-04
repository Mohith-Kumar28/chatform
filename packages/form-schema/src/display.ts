import type { Block } from "./blocks";
import { formatAmount } from "./payment-link";

/**
 * One answer, as a person reads it.
 *
 * Every surface that shows a stored answer back to somebody goes through here:
 * the respondent's own thread, the review card, the "you already answered
 * this" summary, the results table, and the CSV export. They each had their
 * own version, and each was wrong somewhere — the results table and the export
 * printed `opt_founder001` where the form says "Founder", `itm_speed0001` for
 * a ranking, and raw JSON for a matrix, which is the one place those ids reach
 * a customer of the person who built the form.
 *
 * Ids are resolved against the block, so this needs the block and not just the
 * value. `(skipped)` is deliberate: an empty cell cannot distinguish "declined
 * to answer" from "never asked".
 */
export function displayAnswer(block: Block, value: unknown): string {
  if (value === undefined || value === null || value === "") return "(skipped)";

  const labelIn = (list: readonly { id: string; label: string }[] | undefined, v: unknown): string => {
    const hit = list?.find((o) => o.id === v);
    return hit ? hit.label : String(v);
  };
  const options = "options" in block ? block.options : undefined;

  switch (block.type) {
    case "yes_no":
      return value ? (block.yesLabel ?? "Yes") : (block.noLabel ?? "No");

    case "ranking": {
      if (!Array.isArray(value)) break;
      return value.map((id, i) => `${i + 1}. ${labelIn(block.items, id)}`).join(", ");
    }

    case "matrix": {
      if (typeof value !== "object" || Array.isArray(value)) break;
      return Object.entries(value as Record<string, string | string[]>)
        .map(([rowId, cols]) => {
          const picked = (Array.isArray(cols) ? cols : [cols]).map((c) => labelIn(block.columns, c));
          return `${labelIn(block.rows, rowId)}: ${picked.join(", ")}`;
        })
        .join(" · ");
    }

    case "contact_info":
    case "address": {
      if (typeof value !== "object" || Array.isArray(value)) break;
      return Object.values(value as Record<string, string>).filter(Boolean).join(", ");
    }

    case "signature": {
      const sig = value as { signedName?: string };
      return sig.signedName ? `Signed — ${sig.signedName}` : "Signed";
    }

    case "payment": {
      const p = value as { status?: string; amount?: number; currency?: string; reference?: string };
      // The same formatter the payment control uses, so the amount reads the
      // same in the thread as it did on the button that collected it.
      const amount = typeof p.amount === "number" ? ` ${formatAmount(p.amount, p.currency ?? block.currency)}` : "";
      const ref = p.reference ? ` · ref ${p.reference}` : "";
      return `${p.status === "paid" ? "Paid" : "Payment pending"}${amount}${ref}`;
    }

    case "scheduling": {
      const sched = value as { slotIso?: string };
      return sched.slotIso ? `Booked for ${sched.slotIso}` : "Booked";
    }

    case "legal_consent":
      return "Agreed";

    case "date": {
      if (typeof value !== "string") break;
      // `2026-01-31T14:30` reads better with the two halves separated.
      const [day, time] = value.split("T");
      return time ? `${day} at ${time}` : (day ?? value);
    }

    case "file_upload": {
      if (!Array.isArray(value)) break;
      return value
        .map((f) => (typeof f === "object" && f !== null && "filename" in f ? String((f as { filename: unknown }).filename) : String(f)))
        .join(", ");
    }
  }

  if (typeof value === "string") return labelIn(options, value);
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    return value
      .map((v) =>
        typeof v === "object" && v !== null && "filename" in v
          ? String((v as { filename: unknown }).filename)
          : labelIn(options, v),
      )
      .join(", ");
  }
  return JSON.stringify(value);
}
