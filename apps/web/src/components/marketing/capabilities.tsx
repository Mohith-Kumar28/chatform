import { Check, KeyRound, Sheet, Webhook } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { McpMark } from "@/components/integrations/provider-logo";
import { Band } from "./band";
import { DotField } from "./annotate";
import { ProPill, SectionTitle } from "./kit";

/**
 * "Easy on the surface, a lot underneath": two picture cards (branching, and
 * where the answers go), then the three things a conversation does that a
 * page of boxes cannot, then a row of everything else.
 *
 * The integrations card lists only what is built. Zapier, Make and Slack are
 * marked "soon" in the product, so they are not drawn here.
 */

function LogicArt() {
  const branch = "rounded-xl border px-3.5 py-2.5 text-sm font-semibold shadow-xs";
  return (
    <div aria-hidden className="relative flex h-full flex-col items-center justify-center px-6">
      <span className="bg-card border-border rounded-xl border px-4 py-2.5 text-sm font-semibold shadow-xs">Bringing a guest?</span>
      <svg viewBox="0 0 240 48" className="text-border h-12 w-60" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M120 0v14q0 10-10 10H60q-10 0-10 10v14M120 14q0 10 10 10h50q10 0 10 10v14" />
      </svg>
      <div className="flex gap-6">
        <span className={`${branch} border-[color-mix(in_oklch,var(--family-choice)_35%,transparent)] bg-[var(--family-choice-soft)] text-[var(--family-choice-ink)]`}>
          Yes: ask their name
        </span>
        <span className={`${branch} border-[color-mix(in_oklch,var(--primary)_30%,transparent)] bg-primary-soft text-primary-soft-foreground`}>
          No: skip ahead
        </span>
      </div>
    </div>
  );
}

function IntegrationsArt() {
  const apps = [
    { icon: Sheet, name: "Google Sheets & Excel" },
    { icon: Webhook, name: "Webhooks" },
    { icon: McpMark, name: "Claude & ChatGPT" },
    { icon: KeyRound, name: "REST API" },
  ];
  return (
    <div aria-hidden className="relative flex h-full items-center justify-center gap-6 px-6">
      <DotField className="text-foreground" opacity={0.12} size={14} />
      <span className="bg-card relative grid size-16 place-items-center rounded-2xl border shadow-sm">
        <LogoMark className="size-9" />
      </span>
      <span className="relative flex items-center">
        <span className="bg-border h-0.5 w-10" />
        <span className="bg-primary size-2 rounded-full" />
      </span>
      <ul className="relative space-y-2">
        {apps.map(({ icon: Icon, name }) => (
          <li key={name} className="bg-card flex items-center gap-2.5 rounded-lg border px-3 py-1.5 text-xs font-semibold shadow-xs">
            <Icon className="size-4" />
            {name}
          </li>
        ))}
      </ul>
    </div>
  );
}

const CARDS = [
  {
    art: <LogicArt />,
    title: "Ask only what matters.",
    body: "Branch on any answer, so people skip what does not apply to them and every path ends somewhere sensible. The builder will not let you publish a dead end.",
  },
  {
    art: <IntegrationsArt />,
    title: "Answers go where you work.",
    body: "A live feed for Google Sheets and Excel, signed webhooks to your own server, an API, and a connector for your AI assistant.",
  },
];

const MORE = [
  {
    title: "Reads what people type",
    body: "“Next Tuesday”, “about 5k”, “nah”: it turns loose answers into a date, a number and a no.",
  },
  {
    title: "Answers their questions",
    body: "Give it your docs and it answers “how much does this cost?” mid-form, then picks up where it was.",
  },
  {
    title: "Follows up with people who leave",
    body: "A short email sequence reminds the ones who stopped halfway, and brings them back to finish.",
    pro: true,
  },
];

const CHIPS = ["File uploads", "Signatures", "Payments", "Scheduling links", "Quizzes and scores", "Custom endings", "Email alerts"];

export function Capabilities() {
  return (
    <Band id="capabilities" hairline>
      <div className="mx-auto max-w-3xl text-center">
        <SectionTitle eyebrow="Easy on the surface, a lot underneath" accent="can do a whole lot.">
          A simple form
        </SectionTitle>
      </div>

      <div className="mt-14 grid gap-5 md:grid-cols-2">
        {CARDS.map((c) => (
          <article key={c.title} className="bg-card/60 border-border overflow-hidden rounded-[18px] border">
            <div className="bg-muted/40 relative h-60 overflow-hidden">{c.art}</div>
            <div className="p-7 sm:p-8">
              <h3 className="font-display text-xl font-semibold tracking-tight">{c.title}</h3>
              <p className="text-muted-foreground mt-2 leading-relaxed">{c.body}</p>
            </div>
          </article>
        ))}
      </div>

      <dl className="border-border/70 mt-12 grid gap-8 border-y py-10 sm:grid-cols-3">
        {MORE.map((m) => (
          <div key={m.title}>
            <dt className="font-display text-lg font-semibold">
              {m.title}
              {m.pro && <ProPill />}
            </dt>
            <dd className="text-muted-foreground mt-2 leading-relaxed">{m.body}</dd>
          </div>
        ))}
      </dl>

      <ul className="mt-8 flex flex-wrap justify-center gap-2.5">
        {CHIPS.map((c) => (
          <li key={c} className="bg-card border-border flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium">
            <Check className="text-primary size-3.5" strokeWidth={3} />
            {c}
          </li>
        ))}
      </ul>
    </Band>
  );
}
