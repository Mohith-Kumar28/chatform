"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  CreditCard,
  IndianRupee,
  KeyRound,
  MessageSquare,
  Sheet as SheetIcon,
  Webhook,
  Workflow,
} from "lucide-react";
import { toast } from "sonner";
import {
  PAYMENT_PROVIDER_LABELS,
  PAYMENT_PROVIDERS,
  type Block,
  type PaymentProviderName,
  type ThemeDoc,
} from "@repo/form-schema";
import { LockedControl } from "@/components/billing/gate";
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
import { PAYMENT_SHEET_COPY, PaymentAccountPanel } from "./payment-account-sheet";
import { ProviderLogo } from "./provider-logo";
import { usePaymentAccounts, type PaymentAccountsPayload } from "./payment-accounts";
import { SpreadsheetPanel } from "./spreadsheet-panel";
import { WebhooksPanel } from "./webhooks-panel";
import { cn } from "@/lib/utils";

/**
 * Everything that connects one form to something else.
 *
 * It was split across two tabs and complete in neither: Share had a single
 * embed mode, and Integrate had a webhook form plus a hardcoded snippet
 * pointing at a hostname that stopped existing when the domain changed.
 *
 * Integrations belong to a form, so this lives in the builder, where the form
 * is already open. The shape follows DESIGN.md §2.8 — a grid of destinations,
 * each opening a sheet — with one deviation: the embed is not a card, because
 * it is what most people opened this tab for.
 */

type PanelKey = "spreadsheet" | "webhooks" | `payments:${PaymentProviderName}`;

function paymentProviderOf(panel: PanelKey | null): PaymentProviderName | null {
  return panel?.startsWith("payments:") ? (panel.slice("payments:".length) as PaymentProviderName) : null;
}

export function IntegrationsWorkspace({
  formId,
  slug,
  formTitle,
  status,
  appOrigin,
  theme,
  blocks,
}: {
  formId: string;
  slug: string;
  formTitle: string;
  status?: string;
  appOrigin: string;
  /** The form's own theme, so the preview panel is the panel respondents get. */
  theme: ThemeDoc;
  /** The form's own questions, for the same reason. */
  blocks: Block[];
}) {
  const [panel, setPanel] = useState<PanelKey | null>(null);
  const payments = usePaymentAccounts();
  const paymentProvider = paymentProviderOf(panel);

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
    // Room below, so "Collect payments" (the last section) can scroll to the top when linked to.
    <div className="space-y-10 pb-[75vh]">
      <section className="space-y-3">
        <div>
          <h2 className="text-h2">Put it on your site</h2>
          <p className="text-muted-foreground text-body">
            One tag on your page. The preview is what a visitor gets.
          </p>
        </div>
        <EmbedStudio
          slug={slug}
          formTitle={formTitle}
          appOrigin={appOrigin}
          status={status}
          theme={theme}
          blocks={blocks}
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
            href="/settings/api-keys"
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

      <PaymentsOAuthResult
        ready={payments.isFetched}
        canOpenSheet={Boolean(payments.data && (payments.data.enabled || payments.data.accounts.length > 0))}
        onOpen={(provider) => setPanel(`payments:${provider}`)}
      />

      {/* Also shown with the flag off, once an account exists: see `PaymentsGroup`. */}
      {payments.data && (payments.data.enabled || payments.data.accounts.length > 0) && (
        <PaymentsGroup data={payments.data} onOpen={(provider) => setPanel(`payments:${provider}`)} />
      )}

      <Sheet open={panel !== null} onOpenChange={(open) => !open && setPanel(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="font-display">
              {paymentProvider
                ? PAYMENT_SHEET_COPY[paymentProvider].title
                : panel === "spreadsheet"
                  ? "Google Sheets & Excel"
                  : "Webhooks"}
            </SheetTitle>
            <SheetDescription>
              {paymentProvider
                ? PAYMENT_SHEET_COPY[paymentProvider].description
                : panel === "spreadsheet"
                  ? "Download the responses, or keep a sheet pointed at them."
                  : "Signed HTTP callbacks, retried for two hours before they're given up on."}
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-8">
            {panel === "spreadsheet" && <SpreadsheetPanel formId={formId} />}
            {panel === "webhooks" && (
              <WebhooksPanel formId={formId} formTitle={formTitle} blocks={blocks} />
            )}
            {paymentProvider && (
              <PaymentAccountPanel provider={paymentProvider} formId={formId} data={payments.data} />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

/**
 * What came back from a gateway's OAuth round trip: `?payments=connected`, or
 * `?payments=error&reason=…`.
 *
 * Said once as a toast, with the sheet for that gateway opened behind it so the result is on
 * screen, and then taken off the address so a reload does not say it again.
 *
 * Its own component, always mounted, rather than an effect inside `PaymentsGroup`: that group is
 * only rendered once an organization has the flag or an account, and the callback redirects with
 * `reason=disabled` in exactly the case where it has neither — so the author came back from the
 * gateway to a page that said nothing at all, with the parameters still in the address bar. A
 * failed read of the accounts was equally silent, including one right after a successful connect.
 */
function PaymentsOAuthResult({
  ready,
  canOpenSheet,
  onOpen,
}: {
  /** The accounts have been read (or failed to be), so "is there a sheet to open?" has an answer. */
  ready: boolean;
  canOpenSheet: boolean;
  onOpen: (provider: PaymentProviderName) => void;
}) {
  const handled = useRef(false);
  useEffect(() => {
    if (!ready || handled.current) return;
    const url = new URL(window.location.href);
    const outcome = url.searchParams.get("payments");
    if (outcome !== "connected" && outcome !== "error" && outcome !== "open") return;
    handled.current = true;
    const raw = url.searchParams.get("provider");
    const provider = PAYMENT_PROVIDERS.find((p) => p === raw);
    const name = provider ? PAYMENT_PROVIDER_LABELS[provider] : "The payment account";
    // `open`: a link from a payment question's settings, straight to that gateway's accounts.
    if (outcome === "open") {
      // Nothing to announce.
    } else if (outcome === "connected") {
      toast.success(`${name} connected. Pick it on a payment question to start taking verified payments.`);
    } else {
      toast.error(
        `${provider ? `Couldn't connect ${name}` : "Couldn't connect the account"}: ${oauthReason(url.searchParams.get("reason"))}`,
      );
    }
    if (provider && canOpenSheet) onOpen(provider);
    for (const key of ["payments", "provider", "reason"]) url.searchParams.delete(key);
    window.history.replaceState(window.history.state, "", url);
    // `onOpen` is a fresh closure every render; `handled` makes this once whatever re-runs it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, canOpenSheet]);
  return null;
}

/**
 * The Payments group: one card per gateway, each opening its connect sheet.
 *
 * Here, in the form's Integrate tab, and nowhere in the dashboard's navigation:
 * an author connects an account at the moment a form needs one. The account
 * itself belongs to the organization, so the card reads "connected" on every
 * form once it is.
 *
 * Absent entirely while the rollout flag is off for this organization — a card
 * that says "soon" for a feature that is merely switched off would be a promise
 * the product is not making yet. Locked, not hidden, on a plan without
 * `collect_payments`, like every other paid control.
 *
 * Except for an account that is already connected. The API deliberately lets a
 * lapsed plan, or an organization taken off the rollout, list and disconnect
 * its accounts — a live OAuth grant or a Stripe webhook must never be stranded
 * on a merchant's account with no way to remove it. So a gateway with an
 * account keeps its card open whatever the plan or the flag says, and the
 * sheet locks only the ways to connect more.
 *
 * The gateway's OAuth redirect is read by `IntegrationsWorkspace` rather than here, because it
 * has to be read on the visits where this group does not exist too.
 */
function PaymentsGroup({
  data,
  onOpen,
}: {
  data: PaymentAccountsPayload;
  onOpen: (provider: PaymentProviderName) => void;
}) {
  const [flagged, setFlagged] = useState(false);
  useEffect(() => {
    // The inspector's "Connect a payment account" links to `#payments`; the
    // group only exists once the accounts have loaded, which is after the
    // browser tried to scroll to it. Arriving that way, the section also asks
    // for attention once, so it is obvious this is where to go next.
    if (new URL(window.location.href).hash !== "#payments") return;
    // Twice: once now, and once the sections above have finished growing (the
    // embed preview lays out late, and the router may restore the top first).
    const go = () => document.getElementById("payments")?.scrollIntoView({ behavior: "smooth", block: "start" });
    go();
    const again = setTimeout(go, 400);
    const on = setTimeout(() => setFlagged(true), 800);
    const off = setTimeout(() => setFlagged(false), 3000);
    return () => {
      clearTimeout(again);
      clearTimeout(on);
      clearTimeout(off);
    };
    // Once, on arrival.
  }, []);

  return (
    <section
      id="payments"
      className={cn(
        "-mx-3 scroll-mt-20 space-y-3 rounded-2xl px-3 py-3 transition-shadow duration-500",
        flagged && "animate-attention ring-primary/70 ring-2",
      )}
    >
      <div>
        <h2 className="text-h2">Collect payments</h2>
        <p className="text-muted-foreground text-body">
          Checkout opens on your own gateway account and the chat moves on once it confirms. The money
          goes straight to you. Chatform never holds it and takes no cut.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {PAYMENT_PROVIDERS.map((provider) => {
          const accounts = data.accounts.filter((a) => a.provider === provider);
          // Nothing to connect while the flag is off; nothing to manage either.
          if (!data.enabled && accounts.length === 0) return null;
          const attention = accounts.some((a) => a.status === "needs_reconnect" || a.status === "revoked");
          const configured = data.providers[provider]?.configured ?? false;
          const card = (
            <DestinationCard
              key={provider}
              icon={provider === "stripe" ? CreditCard : IndianRupee}
              logo={<ProviderLogo provider={provider} className={cn("size-9 rounded-xl", !configured && accounts.length === 0 && "opacity-60 grayscale")} />}
              accent={configured || accounts.length > 0 ? "var(--primary)" : "var(--muted-foreground)"}
              name={PAYMENT_PROVIDER_LABELS[provider]}
              blurb={PAYMENT_BLURBS[provider]}
              state={
                attention ? "attention" : accounts.length > 0 ? "connected" : configured ? "available" : "soon"
              }
              detail={attention ? "Needs reconnect" : accounts.length > 1 ? `${accounts.length} accounts` : undefined}
              onClick={() => onOpen(provider)}
            />
          );
          return accounts.length > 0 ? (
            card
          ) : (
            <LockedControl key={provider} feature="collect_payments">
              {card}
            </LockedControl>
          );
        })}
      </div>
    </section>
  );
}

const PAYMENT_BLURBS: Record<PaymentProviderName, string> = {
  razorpay: "Verified UPI, card and netbanking payments on your own Razorpay account, in rupees.",
  cashfree: "Verified UPI, card and netbanking payments on your own Cashfree account, in rupees.",
  stripe: "Verified card payments on your own Stripe account, in the currencies it accepts.",
};

/**
 * Why an OAuth round trip came back without an account, in words.
 *
 * The codes are the `reason` values `GET /api/payment-accounts/oauth/:provider/callback`
 * redirects with (`apps/api/src/routes/payment-accounts.ts`), plus whatever `error` the
 * gateway itself put on the redirect, which arrives as-is.
 */
function oauthReason(reason: string | null): string {
  switch (reason) {
    case "access_denied":
      return "the request was cancelled on the gateway's page.";
    case "state_expired":
    case "state_used":
    case "state_unknown":
    case "state_malformed":
    case "state_bad_signature":
    case "provider_mismatch":
      return "the link expired. Try connecting again.";
    case "session_mismatch":
      return "finish connecting in the same browser, signed in as the person who started it.";
    case "not_a_member":
      return "you're no longer a member of this organization.";
    case "disabled":
      return "verified payments aren't switched on for this organization.";
    case "plan_required":
      return "your plan doesn't include taking payments.";
    case "connected_elsewhere":
      return "that account is already connected to another Chatform organization.";
    case "no_merchant_id":
    case "exchange_failed":
    case "save_failed":
      return "the gateway didn't finish the handover. Try again in a minute.";
    default:
      return reason ? `${reason.replaceAll("_", " ")}.` : "something went wrong. Try again.";
  }
}

type CardState = "connected" | "attention" | "available" | "soon" | "link";

function DestinationCard({
  icon: Icon,
  accent,
  name,
  blurb,
  state,
  detail,
  onClick,
  href,
  logo,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  /** The service's own mark, drawn instead of `icon` where there is one. */
  logo?: React.ReactNode;
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
        {logo ?? (
          <span
            className="grid size-9 shrink-0 place-items-center rounded-xl"
            style={{ background: `color-mix(in oklab, ${accent} 14%, transparent)`, color: accent }}
          >
            <Icon className="size-4" strokeWidth={1.75} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-h3 truncate">{name}</p>
            {state === "connected" && (
              <span className="inline-flex items-center gap-1 text-[0.6875rem] font-medium text-[var(--success)]">
                <span className="size-1.5 rounded-full bg-[var(--success)]" />
                {detail ?? "Connected"}
              </span>
            )}
            {state === "attention" && (
              <span className="inline-flex items-center gap-1 text-[0.6875rem] font-medium text-[var(--warning-soft-foreground)]">
                <span className="size-1.5 rounded-full bg-[var(--warning)]" />
                {detail ?? "Needs attention"}
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
