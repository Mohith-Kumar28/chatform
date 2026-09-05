import {
  BadgeCheck,
  BookOpen,
  Briefcase,
  Bug,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  DoorOpen,
  Download,
  FileStack,
  FileText,
  FlaskConical,
  Gauge,
  GraduationCap,
  HandHeart,
  Handshake,
  HeartHandshake,
  HeartPulse,
  Lightbulb,
  LifeBuoy,
  ListChecks,
  ListOrdered,
  LogOut,
  Mail,
  Megaphone,
  MessageCircle,
  MessagesSquare,
  Mic,
  MonitorPlay,
  PartyPopper,
  Quote,
  ReceiptText,
  SmilePlus,
  Target,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
  Video,
} from "lucide-react";

/**
 * Colour and iconography for template categories.
 *
 * The seven `--family-*` hues already exist in globals.css for the block
 * palette, they are already theme-aware, and their three tiers already carry
 * a documented contrast contract (`-soft` is a ground, `-ink` is the only
 * tier type is ever set in). Reusing them here is what stops a gallery of
 * thirty-odd templates from reading as one grey wall, without inventing a
 * second palette to keep in sync with the first.
 *
 * Ten categories over seven hues means some sharing. The duplicates are put
 * as far apart as the list allows, so two cards next to each other in a
 * category-sorted grid do not land on the same colour.
 */

export type AccentKey =
  | "content"
  | "text"
  | "contact"
  | "number"
  | "choice"
  | "scale"
  | "advanced";

export const ACCENT_KEYS: readonly AccentKey[] = [
  "content",
  "text",
  "contact",
  "number",
  "choice",
  "scale",
  "advanced",
];

/**
 * Written out in full rather than composed as `bg-family-${key}-soft`.
 * Tailwind reads source files as text — an interpolated class name is not
 * there to be found, and the utility is silently never generated.
 */
const ACCENT_CLASSES: Record<AccentKey, { tile: string; dot: string; wash: string }> = {
  content: {
    tile: "bg-family-content-soft text-family-content-ink",
    dot: "bg-family-content",
    wash: "from-family-content-soft",
  },
  text: {
    tile: "bg-family-text-soft text-family-text-ink",
    dot: "bg-family-text",
    wash: "from-family-text-soft",
  },
  contact: {
    tile: "bg-family-contact-soft text-family-contact-ink",
    dot: "bg-family-contact",
    wash: "from-family-contact-soft",
  },
  number: {
    tile: "bg-family-number-soft text-family-number-ink",
    dot: "bg-family-number",
    wash: "from-family-number-soft",
  },
  choice: {
    tile: "bg-family-choice-soft text-family-choice-ink",
    dot: "bg-family-choice",
    wash: "from-family-choice-soft",
  },
  scale: {
    tile: "bg-family-scale-soft text-family-scale-ink",
    dot: "bg-family-scale",
    wash: "from-family-scale-soft",
  },
  advanced: {
    tile: "bg-family-advanced-soft text-family-advanced-ink",
    dot: "bg-family-advanced",
    wash: "from-family-advanced-soft",
  },
};

const CATEGORY_ACCENT: Record<string, AccentKey> = {
  Sales: "choice",
  Product: "scale",
  Marketing: "content",
  Events: "number",
  HR: "contact",
  Support: "advanced",
  Education: "text",
  Services: "text",
  Community: "content",
  // The four original templates shipped under these two category names; a
  // stale row or a cached response should still resolve to a colour.
  Business: "choice",
  Other: "text",
};

type Icon = typeof FileStack;

const CATEGORY_ICON: Record<string, Icon> = {
  Sales: TrendingUp,
  Product: Gauge,
  Marketing: Megaphone,
  Events: CalendarDays,
  HR: Users,
  Support: LifeBuoy,
  Education: GraduationCap,
  Services: Briefcase,
  Community: HeartHandshake,
  Business: TrendingUp,
  Other: FileStack,
};

/**
 * Per-template icons, keyed by the name stored on the template row.
 *
 * A registry rather than lucide's dynamic-import map: the set is small,
 * closed, and authored alongside the templates themselves, and this way an
 * icon name that does not exist falls back visibly instead of shipping a
 * loader for an icon that will never arrive.
 */
const TEMPLATE_ICON: Record<string, Icon> = {
  BadgeCheck,
  BookOpen,
  Briefcase,
  Bug,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  DoorOpen,
  Download,
  FileStack,
  FileText,
  FlaskConical,
  Gauge,
  GraduationCap,
  HandHeart,
  Handshake,
  HeartHandshake,
  HeartPulse,
  Lightbulb,
  LifeBuoy,
  ListChecks,
  ListOrdered,
  LogOut,
  Mail,
  Megaphone,
  MessageCircle,
  MessagesSquare,
  Mic,
  MonitorPlay,
  PartyPopper,
  Quote,
  ReceiptText,
  SmilePlus,
  Target,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
  Video,
};

export interface Accent {
  key: AccentKey;
  /** Icon tile: soft ground, ink glyph. */
  tile: string;
  /** A mark — status dots, rules. Never type. */
  dot: string;
  /** Gradient start for a card header wash. */
  wash: string;
  icon: Icon;
}

/**
 * Resolve the accent for a template. `accentKey` and `iconName` come from the
 * template row when it has them; the category is the fallback for both, so a
 * template authored without either still gets a coherent look.
 */
export function templateAccent(
  category: string | null | undefined,
  accentKey?: string | null,
  iconName?: string | null,
): Accent {
  const cat = category ?? "Other";
  const key =
    (accentKey && (ACCENT_KEYS as readonly string[]).includes(accentKey)
      ? (accentKey as AccentKey)
      : undefined) ??
    CATEGORY_ACCENT[cat] ??
    "text";
  const icon = (iconName && TEMPLATE_ICON[iconName]) || CATEGORY_ICON[cat] || FileStack;
  return { key, ...ACCENT_CLASSES[key], icon };
}

/** The icon for a category chip, with no template in hand. */
export function categoryIcon(category: string): Icon {
  return CATEGORY_ICON[category] ?? FileStack;
}
