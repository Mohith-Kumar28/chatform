import { BookOpen, ShieldCheck, Target } from "lucide-react";

/**
 * The Agent tab, in miniature — persona, goal, the knowledge-base character
 * meter and guardrails. Every control shown here exists in
 * `components/builder/tabs/agent-tab.tsx`, including the 20k character budget.
 */
export function AgentPanelPreview() {
  return (
    <div className="border-border/70 bg-background flex flex-col gap-3 rounded-xl border p-3.5">
      <Row icon={Target} label="Goal">
        Qualify the lead and book a demo if they&apos;re a fit.
      </Row>

      <div className="border-border/60 rounded-lg border p-2.5">
        <div className="flex items-center gap-2">
          <BookOpen className="text-primary size-3.5 shrink-0" strokeWidth={1.75} />
          <p className="text-micro flex-1 font-medium">Knowledge base</p>
          <p className="text-micro text-muted-foreground tabular">7,240 / 20,000</p>
        </div>
        <div className="bg-muted mt-2 h-1.5 overflow-hidden rounded-full">
          <div className="bg-primary h-full rounded-full" style={{ width: "36%" }} />
        </div>
        <p className="text-micro text-muted-foreground mt-2 leading-snug">
          Pricing · Onboarding timeline · Security &amp; data handling
        </p>
      </div>

      <Row icon={ShieldCheck} label="Guardrails">
        Won&apos;t discuss competitors or give legal advice. Declines politely, then
        continues.
      </Row>
    </div>
  );
}

function Row({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-border/60 rounded-lg border p-2.5">
      <div className="flex items-center gap-2">
        <Icon className="text-primary size-3.5 shrink-0" strokeWidth={1.75} />
        <p className="text-micro font-medium">{label}</p>
      </div>
      <p className="text-micro text-muted-foreground mt-1.5 leading-snug">{children}</p>
    </div>
  );
}
