import {
  AlignLeft, AtSign, Baseline, Calendar, CheckSquare, ChevronDownSquare, CircleDot,
  CreditCard, FileUp, Gauge, Hash, Heart, Image, Link2, ListOrdered, MapPin,
  MessageSquare, PenTool, Phone, ScrollText, Sparkles, Star, Table2, ToggleLeft,
  User, CalendarClock,
} from "lucide-react";
import type { Block } from "@repo/form-schema";

/**
 * The one block library.
 *
 * There were two divergent lists — the Build palette offered 16 of the 26
 * schema types, the Workflow palette a different subset — so nine block types
 * were unreachable from the builder entirely: url, dropdown, picture_choice,
 * ranking, matrix, signature, scheduling, contact_info and address.
 *
 * `welcome` is deliberately absent: every form has exactly one and it is
 * seeded, not added.
 */

export interface BlockMeta {
  type: Block["type"];
  label: string;
  group: BlockGroup;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  /** Colour family — tints the block list, the picker and the results columns. */
  tone: BlockTone;
  description: string;
}

export type BlockTone = "content" | "text" | "contact" | "number" | "choice" | "scale" | "advanced";

export type BlockGroup = "Content" | "Text" | "Contact" | "Numbers & dates" | "Choice" | "Scale" | "Advanced";

export const BLOCK_GROUPS: BlockGroup[] = [
  "Content",
  "Text",
  "Contact",
  "Numbers & dates",
  "Choice",
  "Scale",
  "Advanced",
];

export const BLOCK_LIBRARY: BlockMeta[] = [
  { type: "statement", label: "Message", group: "Content", icon: MessageSquare, tone: "content", description: "Say something without asking for an answer." },

  { type: "short_text", label: "Short text", group: "Text", icon: Baseline, tone: "text", description: "A name, a title, one line." },
  { type: "long_text", label: "Long text", group: "Text", icon: AlignLeft, tone: "text", description: "Open feedback, a few sentences." },

  { type: "email", label: "Email", group: "Contact", icon: AtSign, tone: "contact", description: "Validated email address." },
  { type: "phone", label: "Phone", group: "Contact", icon: Phone, tone: "contact", description: "Normalised to E.164." },
  { type: "url", label: "Website", group: "Contact", icon: Link2, tone: "contact", description: "A link, scheme optional." },
  { type: "contact_info", label: "Contact info", group: "Contact", icon: User, tone: "contact", description: "Name, email and phone together." },
  { type: "address", label: "Address", group: "Contact", icon: MapPin, tone: "contact", description: "Street, city, postal code, country." },

  { type: "number", label: "Number", group: "Numbers & dates", icon: Hash, tone: "number", description: "Quantities, budgets, ages." },
  { type: "date", label: "Date", group: "Numbers & dates", icon: Calendar, tone: "number", description: "A single calendar date." },

  { type: "yes_no", label: "Yes / No", group: "Choice", icon: ToggleLeft, tone: "choice", description: "A binary answer." },
  { type: "single_select", label: "Single select", group: "Choice", icon: CircleDot, tone: "choice", description: "Pick exactly one option." },
  { type: "multi_select", label: "Multi select", group: "Choice", icon: CheckSquare, tone: "choice", description: "Pick any number of options." },
  { type: "dropdown", label: "Dropdown", group: "Choice", icon: ChevronDownSquare, tone: "choice", description: "Long option lists." },
  { type: "picture_choice", label: "Picture choice", group: "Choice", icon: Image, tone: "choice", description: "Choose by image." },
  { type: "ranking", label: "Ranking", group: "Choice", icon: ListOrdered, tone: "choice", description: "Order items by preference." },

  { type: "rating", label: "Rating", group: "Scale", icon: Star, tone: "scale", description: "Stars, hearts or numbers." },
  { type: "nps", label: "NPS", group: "Scale", icon: Gauge, tone: "scale", description: "The standard 0–10 question." },
  { type: "opinion_scale", label: "Opinion scale", group: "Scale", icon: Heart, tone: "scale", description: "Agree/disagree ranges." },
  { type: "matrix", label: "Matrix", group: "Scale", icon: Table2, tone: "scale", description: "Rate several rows at once." },

  { type: "file_upload", label: "File upload", group: "Advanced", icon: FileUp, tone: "advanced", description: "Documents, images, audio." },
  { type: "signature", label: "Signature", group: "Advanced", icon: PenTool, tone: "advanced", description: "Draw or type a signature." },
  { type: "payment", label: "Payment", group: "Advanced", icon: CreditCard, tone: "advanced", description: "Send them to your payment link, or a UPI QR." },
  { type: "scheduling", label: "Scheduling", group: "Advanced", icon: CalendarClock, tone: "advanced", description: "Hand off to your booking or meeting link." },
  { type: "legal_consent", label: "Consent", group: "Advanced", icon: ScrollText, tone: "advanced", description: "Terms acceptance with an audit trail." },
];

const BY_TYPE = new Map(BLOCK_LIBRARY.map((b) => [b.type, b]));

/** Metadata for any block type, including `welcome` which is not addable. */
export function blockMeta(type: Block["type"]): BlockMeta {
  return (
    BY_TYPE.get(type) ?? {
      type,
      label: "Welcome",
      group: "Content",
      icon: Sparkles,
      tone: "content",
      description: "The greeting that opens the conversation.",
    }
  );
}

/** Soft fill + readable ink, for icon chips and tinted rows. */
export const TONE_CLASSES: Record<BlockTone, string> = {
  content: "bg-[var(--family-content-soft)] text-[var(--family-content-ink)]",
  text: "bg-[var(--family-text-soft)] text-[var(--family-text-ink)]",
  contact: "bg-[var(--family-contact-soft)] text-[var(--family-contact-ink)]",
  number: "bg-[var(--family-number-soft)] text-[var(--family-number-ink)]",
  choice: "bg-[var(--family-choice-soft)] text-[var(--family-choice-ink)]",
  scale: "bg-[var(--family-scale-soft)] text-[var(--family-scale-ink)]",
  advanced: "bg-[var(--family-advanced-soft)] text-[var(--family-advanced-ink)]",
};

/** Saturated family colour, for spines, dots and active indicators. */
export const TONE_ACCENT: Record<BlockTone, string> = {
  content: "var(--family-content)",
  text: "var(--family-text)",
  contact: "var(--family-contact)",
  number: "var(--family-number)",
  choice: "var(--family-choice)",
  scale: "var(--family-scale)",
  advanced: "var(--family-advanced)",
};
