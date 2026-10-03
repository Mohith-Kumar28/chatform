import { Check, KeyRound, Sheet, Webhook } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { McpMark } from "@/components/integrations/provider-logo";
import { Band } from "./band";
import { DotField } from "./annotate";
import { SectionTitle, TextLink } from "./kit";
import { FlowPreview } from "./flow-preview";
import { InView } from "./in-view";

/**
 * "Easy on the surface, a lot underneath": two picture cards (branching, and
 * where the answers go), then the three things a conversation does that a
 * page of boxes cannot, then a row of everything else.
 *
 * The integrations card lists only what is built. Zapier, Make and Slack are
 * marked "soon" in the product, so they are not drawn here.
 */

const READS = [
  { typed: "we're about a dozen people right now", field: "Team size", value: "12" },
  { typed: "somewhere between five and ten grand a month", field: "Budget", value: "$5\u201310k" },
  { typed: "yeah we tried HubSpot, dropped it last year", field: "Current CRM", value: "None" },
  { typed: "right after the holidays", field: "Timeline", value: "January" },
] as const;

/** Four loose answers and what got recorded from each: the clearest proof this is not a text box. */
function ReadsArt() {
  return (
    <InView className="flex h-full flex-col justify-center px-6 py-5">
      <div className="text-muted-foreground flex justify-between text-[0.6875rem] font-bold tracking-[0.09em] uppercase">
        <span>They typed</span>
        <span>Recorded as</span>
      </div>
      <ul className="mt-2">
        {READS.map((r, i) => (
          <li key={r.field} className="border-border/70 grid grid-cols-[1fr_auto] items-center gap-x-4 border-t py-2 first:border-t-0">
            <p className="cf-a-slide-l min-w-0 truncate font-mono text-xs opacity-80" style={{ animationDelay: `${120 + i * 260}ms` }}>
              &ldquo;{r.typed}&rdquo;
            </p>
            <div className="cf-a-slide-r text-right" style={{ animationDelay: `${300 + i * 260}ms` }}>
              <p className="text-muted-foreground text-[0.625rem] tracking-[0.08em] uppercase">{r.field}</p>
              <p className="font-display text-sm leading-tight font-bold">{r.value}</p>
            </div>
          </li>
        ))}
      </ul>
    </InView>
  );
}

function DeadEndArt() {
  return (
    <InView className="flex h-full items-center px-4 py-2">
      <div className="bg-background w-full rounded-xl border p-2">
        <FlowPreview />
      </div>
    </InView>
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
    art: <DeadEndArt />,
    title: "It can\u2019t publish a dead end.",
    body: "Branch on any answer with nineteen operators, nested groups and scoring. Every path is checked before you publish.",
  },
  {
    art: <ReadsArt />,
    title: "It understands what people type.",
    body: "Choices stay instant and exact. Free text is read for what it means, and when it isn\u2019t sure, it asks instead of guessing.",
  },
  {
    art: <IntegrationsArt />,
    title: "Answers go where you work.",
    body: "A live feed for Google Sheets and Excel, signed webhooks to your own server, an API, and a connector for your AI assistant.",
    wide: true,
  },
];

/** The ordinary things, done properly: one line each. */
const ORDINARY = [
  { label: "Know who answered", detail: "Sign-in or a texted code, one response each" },
  { label: "Leave and come back", detail: "Answers are kept; any earlier one can be changed" },
  { label: "Tell your other tools", detail: "New answers can be pushed anywhere you like" },
  { label: "See where people stop", detail: "Drop-off along the path each person actually took" },
  { label: "Download it all", detail: "A spreadsheet, one column per question" },
  { label: "Your brand, not ours", detail: "Fonts, logo, colours; drop the badge on Pro" },
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
          <article
            key={c.title}
            className={`bg-card/60 border-border overflow-hidden rounded-[18px] border ${"wide" in c ? "md:col-span-2 md:grid md:grid-cols-[1.2fr_1fr] md:items-center" : ""}`}
          >
            <div className={`bg-muted/40 relative overflow-hidden ${"wide" in c ? "h-60 md:h-full md:min-h-60" : "md:min-h-80 py-4"}`}>{c.art}</div>
            <div className="p-7 sm:p-8">
              <h3 className="font-display text-xl font-semibold tracking-tight">{c.title}</h3>
              <p className="text-muted-foreground mt-2 leading-relaxed">{c.body}</p>
            </div>
          </article>
        ))}
      </div>

      <div className="border-border/70 mt-12 border-y py-10">
        <h3 className="font-display text-xl font-semibold tracking-tight">And the ordinary things, done properly.</h3>
        <dl className="mt-6 grid gap-x-10 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {ORDINARY.map((o) => (
            <div key={o.label}>
              <dt className="font-semibold">{o.label}</dt>
              <dd className="text-muted-foreground mt-0.5 text-[0.9375rem] leading-snug">{o.detail}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-6">
          <TextLink href="/pricing">Every limit, per plan</TextLink>
        </div>
      </div>

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
