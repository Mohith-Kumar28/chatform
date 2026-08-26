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
  /** Colour family, used to tint the block list the way Youform does. */
  tone: "slate" | "blue" | "green" | "amber" | "rose" | "violet";
  description: string;
}

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
  { type: "statement", label: "Message", group: "Content", icon: MessageSquare, tone: "slate", description: "Say something without asking for an answer." },

  { type: "short_text", label: "Short text", group: "Text", icon: Baseline, tone: "blue", description: "A name, a title, one line." },
  { type: "long_text", label: "Long text", group: "Text", icon: AlignLeft, tone: "blue", description: "Open feedback, a few sentences." },

  { type: "email", label: "Email", group: "Contact", icon: AtSign, tone: "blue", description: "Validated email address." },
  { type: "phone", label: "Phone", group: "Contact", icon: Phone, tone: "blue", description: "Normalised to E.164." },
  { type: "url", label: "Website", group: "Contact", icon: Link2, tone: "blue", description: "A link, scheme optional." },
  { type: "contact_info", label: "Contact info", group: "Contact", icon: User, tone: "blue", description: "Name, email and phone together." },
  { type: "address", label: "Address", group: "Contact", icon: MapPin, tone: "blue", description: "Street, city, postal code, country." },

  { type: "number", label: "Number", group: "Numbers & dates", icon: Hash, tone: "amber", description: "Quantities, budgets, ages." },
  { type: "date", label: "Date", group: "Numbers & dates", icon: Calendar, tone: "amber", description: "A single calendar date." },

  { type: "yes_no", label: "Yes / No", group: "Choice", icon: ToggleLeft, tone: "green", description: "A binary answer." },
  { type: "single_select", label: "Single select", group: "Choice", icon: CircleDot, tone: "green", description: "Pick exactly one option." },
  { type: "multi_select", label: "Multi select", group: "Choice", icon: CheckSquare, tone: "green", description: "Pick any number of options." },
  { type: "dropdown", label: "Dropdown", group: "Choice", icon: ChevronDownSquare, tone: "green", description: "Long option lists." },
  { type: "picture_choice", label: "Picture choice", group: "Choice", icon: Image, tone: "green", description: "Choose by image." },
  { type: "ranking", label: "Ranking", group: "Choice", icon: ListOrdered, tone: "green", description: "Order items by preference." },

  { type: "rating", label: "Rating", group: "Scale", icon: Star, tone: "violet", description: "Stars, hearts or numbers." },
  { type: "nps", label: "NPS", group: "Scale", icon: Gauge, tone: "violet", description: "The standard 0–10 question." },
  { type: "opinion_scale", label: "Opinion scale", group: "Scale", icon: Heart, tone: "violet", description: "Agree/disagree ranges." },
  { type: "matrix", label: "Matrix", group: "Scale", icon: Table2, tone: "violet", description: "Rate several rows at once." },

  { type: "file_upload", label: "File upload", group: "Advanced", icon: FileUp, tone: "rose", description: "Documents, images, audio." },
  { type: "signature", label: "Signature", group: "Advanced", icon: PenTool, tone: "rose", description: "Draw or type a signature." },
  { type: "payment", label: "Payment", group: "Advanced", icon: CreditCard, tone: "rose", description: "Collect a payment inline." },
  { type: "scheduling", label: "Scheduling", group: "Advanced", icon: CalendarClock, tone: "rose", description: "Book a slot on your calendar." },
  { type: "legal_consent", label: "Consent", group: "Advanced", icon: ScrollText, tone: "rose", description: "Terms acceptance with an audit trail." },
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
      tone: "slate",
      description: "The greeting that opens the conversation.",
    }
  );
}

export const TONE_CLASSES: Record<BlockMeta["tone"], string> = {
  slate: "bg-muted text-muted-foreground",
  blue: "bg-[var(--info-soft)] text-[var(--info)]",
  green: "bg-[var(--success-soft)] text-[var(--success)]",
  amber: "bg-[var(--warning-soft)] text-[var(--warning-foreground)]",
  rose: "bg-[var(--destructive-soft)] text-destructive",
  violet: "bg-primary-soft text-primary",
};
