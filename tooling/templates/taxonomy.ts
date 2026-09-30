/**
 * How the template gallery is organised: by form type, then a category inside
 * that type, and across both by the goal someone has and the role they work in.
 *
 * Three axes rather than one, because people arrive at a template gallery from
 * three different questions. "I need a survey" is a type. "I'm trying to get
 * more leads" is a goal. "I run HR" is a role. Each axis gets its own indexable
 * hub page (`/form-templates/c/<type>/<category>`, `/goals/<goal>`,
 * `/roles/<role>`), and a template sits in exactly one type and category but in
 * as many goals and roles as honestly fit it.
 *
 * Slugs are URL segments, so they are permanent once published.
 */

export const TEMPLATE_TYPES = ["form", "survey", "quiz"] as const;
export type TemplateType = (typeof TEMPLATE_TYPES)[number];

export const TYPE_META: Record<TemplateType, { label: string; plural: string; path: string }> = {
  form: { label: "Form", plural: "Forms", path: "forms" },
  survey: { label: "Survey", plural: "Surveys", path: "surveys" },
  quiz: { label: "Quiz", plural: "Quizzes", path: "quizzes" },
};

/** Categories per type. The label is singular-agnostic ("Lead generation"); the page adds "forms". */
export const CATEGORIES_BY_TYPE = {
  form: {
    marketing: "Marketing",
    registration: "Registration",
    "lead-generation": "Lead generation",
    event: "Event",
    "event-registration": "Event registration",
    business: "Business",
    quote: "Quote",
    request: "Request",
    application: "Application",
    feedback: "Feedback",
    "customer-success": "Customer success",
    signup: "Signup",
    evaluation: "Evaluation",
    contact: "Contact",
    membership: "Membership",
    report: "Report",
    other: "Other",
    order: "Order",
    "job-application": "Job application",
    "file-upload": "File upload",
  },
  survey: {
    "customer-success": "Customer success",
    "customer-satisfaction": "Customer satisfaction",
    marketing: "Marketing",
    feedback: "Feedback",
    other: "Other",
    "market-research": "Market research",
    event: "Event",
    business: "Business",
    product: "Product",
    school: "School",
    "employee-satisfaction": "Employee satisfaction",
    evaluation: "Evaluation",
    healthcare: "Healthcare",
  },
  quiz: {
    popular: "Popular",
    marketing: "Marketing",
    "lead-generation": "Lead generation",
    "product-recommendation": "Product recommendation",
  },
} as const satisfies Record<TemplateType, Record<string, string>>;

export type CategoryOf<T extends TemplateType> = keyof (typeof CATEGORIES_BY_TYPE)[T] & string;
export type TemplateCategory = CategoryOf<"form"> | CategoryOf<"survey"> | CategoryOf<"quiz">;

export const GOALS = {
  "collect-feedback": "Collect feedback",
  "generate-leads": "Generate leads",
  "run-events": "Run events",
  "onboard-clients": "Onboard clients",
  "conduct-research": "Conduct research",
  "engage-with-quizzes": "Engage with quizzes",
} as const;
export type Goal = keyof typeof GOALS;

export const ROLES = {
  marketing: "Marketing",
  sales: "Sales",
  "customer-success": "Customer success",
  "freelancers-agencies": "Freelancers & agencies",
  "product-research": "Product & research",
  "hr-people": "HR & people",
  education: "Education",
  operations: "Operations",
} as const;
export type Role = keyof typeof ROLES;

/**
 * Accent per category, over the seven `--family-*` hues.
 *
 * Keyed by `<type>/<category>` because "marketing" is a form category, a
 * survey category and a quiz category, and three cards side by side in a
 * marketing hub should not all be the same colour for three different reasons.
 */
const ACCENTS = ["content", "contact", "text", "number", "choice", "scale", "advanced"] as const;
export function accentFor(type: TemplateType, category: string): string {
  const keys = Object.keys(CATEGORIES_BY_TYPE[type]);
  const offset = { form: 0, survey: 2, quiz: 4 }[type];
  const at = keys.indexOf(category);
  return ACCENTS[(Math.max(0, at) + offset) % ACCENTS.length]!;
}

export function categoryLabel(type: TemplateType, category: string): string {
  return (CATEGORIES_BY_TYPE[type] as Record<string, string>)[category] ?? category;
}

/**
 * Icons a template may name. Every one must exist in the web app's registry in
 * `apps/web/src/lib/category-accent.ts`; the catalogue test checks both lists
 * agree, so an unknown name fails generation instead of rendering a blank tile.
 */
export const TEMPLATE_ICONS = [
  "Award", "BadgeCheck", "Bike", "Book", "BookOpen", "Brain", "Briefcase", "Bug", "Building2", "Cake",
  "Calculator", "CalendarCheck", "CalendarClock", "CalendarDays", "Camera", "Car", "ChefHat", "ClipboardCheck",
  "ClipboardList", "Code", "Coffee", "Compass", "CreditCard", "Crown", "Dices", "DoorOpen", "Download",
  "Dumbbell", "FileSearch", "FileStack", "FileText", "FileUp", "FlaskConical", "Flag", "Gauge", "Gem", "Gift",
  "Globe", "GraduationCap", "HandHeart", "Handshake", "HardHat", "HeartHandshake", "HeartPulse", "Home",
  "Hotel", "Image", "Inbox", "Languages", "Laptop", "Leaf", "Lightbulb", "LifeBuoy", "ListChecks",
  "ListOrdered", "LogOut", "Mail", "Map", "Megaphone", "MessageCircle", "MessagesSquare", "Mic", "MonitorPlay",
  "Music", "Newspaper", "Package", "Paintbrush", "Palette", "PartyPopper", "PenTool", "Phone", "PieChart",
  "Plane", "Plug", "Puzzle", "Quote", "ReceiptText", "Rocket", "Scale", "School", "Scissors", "Search",
  "Send", "Shield", "ShieldCheck", "ShoppingBag", "ShoppingCart", "Smartphone", "SmilePlus", "Sparkles",
  "Star", "Stethoscope", "Store", "Target", "ThumbsUp", "Ticket", "Timer", "TrendingUp", "Trophy", "Truck",
  "UserCheck", "UserPlus", "Users", "Utensils", "Video", "Wrench", "Zap",
] as const;
export type TemplateIcon = (typeof TEMPLATE_ICONS)[number];
