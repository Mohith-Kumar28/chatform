"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  KeyRound,
  MessageSquare,
  Sheet as SheetIcon,
  Webhook,
  Workflow,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { customFetch } from "@/lib/api/mutator";
import { EmbedStudio } from "./embed-studio";
import { SpreadsheetPanel } from "./spreadsheet-panel";
import { WebhooksPanel } from "./webhooks-panel";
import { cn } from "@/lib/utils";

/**
 * Everything that connects a form to something else, on one screen.
 *
 * It was in three places before and complete in none of them: the Share tab had
 * one embed mode, the Integrate tab had a webhook form and a hardcoded snippet
 * pointing at a dead hostname, and there was no org-level home for any of it.
 *
 * The shape follows DESIGN.md §2.8 — a grid of destinations, each opening a
 * sheet — with one deviation. The embed is not a card: it is the thing most
 * people came for, so it is the page.
 */

type PanelKey = "spreadsheet" | "webhooks";

export function IntegrationsWorkspace({
  formId,
  slug,
  formTitle,
  status,
  appOrigin,
}: {
  formId: string;
  slug: string;
  formTitle: string;
  status?: string;
  appOrigin: string;
}) {
  const [panel, setPanel] = useState<PanelKey | null>(null);

  const { data: integrations } = useQuery({
    queryKey: ["integrations", formId],
    queryFn: () => customFetch<{ provider: string }[]>(`/api/forms/${formId}/integrations`),
  });
  const { data: webhooks } = useQuery({
    queryKey: ["webhooks", formId],
    queryFn: () => customFetch<{ formId?: string | null }[]>("/api/webhooks"),
  });

  const feedConnected = (Array.isArray(integrations) ? integrations : []).some(
    (row) => row.provider === "spreadsheet_feed",
  );
  const webhookCount = (Array.isArray(webhooks) ? webhooks : []).filter(
    (h) => !h.formId || h.formId === formId,
  ).length;

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <h2 className="text-h2">Put it on your site</h2>
          <p className="text-muted-foreground text-body">
            One tag. No API key, no package, no backend — a published form is public.
          </p>
        </div>
        <EmbedStudio
          slug={slug}
          formTitle={formTitle}
          appOrigin={appOrigin}
          status={status}
        />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-h2">Send the responses somewhere</h2>
          <p className="text-muted-foreground text-body">
            Where each answer goes once it&apos;s in.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <DestinationCard
            icon={SheetIcon}
            accent="var(--family-choice, var(--primary))"
            name="Google Sheets & Excel"
            blurb="A live feed URL your spreadsheet refreshes itself, plus .xlsx and .csv downloads."
            state={feedConnected ? "connected" : "available"}
            onClick={() => setPanel("spreadsheet")}
          />
          <DestinationCard
            icon={Webhook}
            accent="var(--primary)"
            name="Webhooks"
            blurb="Signed HTTP callbacks to your own server, with retries and a delivery log."
            state={webhookCount > 0 ? "connected" : "available"}
            detail={webhookCount > 0 ? `${webhookCount} endpoint${webhookCount === 1 ? "" : "s"}` : undefined}
            onClick={() => setPanel("webhooks")}
          />
          <DestinationCard
            icon={KeyRound}
            accent="var(--primary)"
            name="API"
            blurb="Read responses and drive conversations from your own code."
            state="link"
            href="/api-keys"
          />
          {/*
            Named, not hidden, and honestly labelled. A destination grid that
            shows only what is built tells nobody what is coming; one that lists
            unbuilt work as available is a lie. These say "soon" and do nothing.
          */}
          <DestinationCard
            icon={Workflow}
            accent="var(--muted-foreground)"
            name="Zapier & Make"
            blurb="Trigger a Zap or a scenario on every response."
            state="soon"
          />
          <DestinationCard
            icon={MessageSquare}
            accent="var(--muted-foreground)"
            name="Slack"
            blurb="Post each response into a channel."
            state="soon"
          />
        </div>
      </section>

      <Sheet open={panel !== null} onOpenChange={(open) => !open && setPanel(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="font-display">
              {panel === "spreadsheet" ? "Google Sheets & Excel" : "Webhooks"}
            </SheetTitle>
            <SheetDescription>
              {panel === "spreadsheet"
                ? "Download the responses, or keep a sheet pointed at them."
                : "Signed HTTP callbacks, retried for two hours before they're given up on."}
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-8">
            {panel === "spreadsheet" && <SpreadsheetPanel formId={formId} />}
            {panel === "webhooks" && <WebhooksPanel formId={formId} />}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

type CardState = "connected" | "available" | "soon" | "link";

function DestinationCard({
  icon: Icon,
  accent,
  name,
  blurb,
  state,
  detail,
  onClick,
  href,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  accent: string;
  name: string;
  blurb: string;
  state: CardState;
  detail?: string;
  onClick?: () => void;
  href?: string;
}) {
  const disabled = state === "soon";

  const body = (
    <div className="flex items-start gap-3">
        <span
          className="grid size-9 shrink-0 place-items-center rounded-xl"
          style={{ background: `color-mix(in oklab, ${accent} 14%, transparent)`, color: accent }}
        >
          <Icon className="size-4" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-h3 truncate">{name}</p>
            {state === "connected" && (
              <span className="inline-flex items-center gap-1 text-[0.6875rem] font-medium text-[var(--success)]">
                <span className="size-1.5 rounded-full bg-[var(--success)]" />
                {detail ?? "Connected"}
              </span>
            )}
            {state === "soon" && (
              <Badge variant="secondary" className="text-[0.6875rem]">
                Soon
              </Badge>
            )}
            {state === "link" && (
              <ArrowUpRight className="text-muted-foreground ml-auto size-3.5 shrink-0" />
            )}
          </div>
        <p className="text-muted-foreground text-caption mt-1">{blurb}</p>
      </div>
    </div>
  );

  const className = cn(
    "bg-card rounded-2xl p-4 text-left",
    "transition-colors duration-[var(--duration-micro)]",
    disabled ? "opacity-60" : "hover:bg-muted/40 cursor-pointer",
  );

  if (state === "link" && href) {
    return (
      <Link href={href} className={className}>
        {body}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} disabled={disabled} className={className}>
      {body}
    </button>
  );
}

/** A "pick a form first" stand-in, so the org-level page is never a blank grid. */
export function IntegrationsPlaceholder({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-muted/30 grid place-items-center rounded-2xl px-8 py-20 text-center">
      {children}
    </div>
  );
}
