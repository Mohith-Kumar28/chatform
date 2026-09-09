"use client";

import Link from "next/link";
import { AlertTriangle, CreditCard, Gauge, Webhook, Zap, type LucideIcon } from "lucide-react";
import { useGetApiAdminActions } from "@/lib/api/admin/admin";
import { Skeleton } from "@/components/ui/skeleton";
import { apiData } from "@/lib/api/payload";
import { money, relativeDay } from "./format";

/**
 * The part of the console that is not a chart.
 *
 * Every screen here ends in this, and that is the whole design brief: a
 * dashboard that reports how things went is a report, and a report gets read
 * once. These are five queries whose rows are each a thing to do today, named
 * with the account it concerns and linked to the place you would do it.
 *
 * A list that is empty says so warmly and takes up almost no room, so a quiet
 * week reads as quiet rather than as broken.
 */

type Row = Record<string, unknown>;
const str = (r: Row, k: string) => (r[k] == null ? "" : String(r[k]));
const num = (r: Row, k: string) => Number(r[k] ?? 0);

function Queue({
  title,
  icon: Icon,
  tone,
  rows,
  empty,
  render,
  className,
}: {
  title: string;
  icon: LucideIcon;
  tone: "warning" | "destructive" | "default";
  rows: Row[];
  empty: string;
  render: (row: Row) => { primary: string; secondary: string; trailing?: string; href?: string };
  className?: string;
}) {
  const toneClass = {
    warning: "text-[var(--warning-soft-foreground)] bg-[var(--warning-soft)]",
    destructive: "text-destructive bg-[var(--destructive-soft)]",
    default: "text-muted-foreground bg-muted",
  }[tone];

  return (
    <div className={`bg-card shadow-xs h-full rounded-xl border p-4 ${className ?? ""}`}>
      <div className="mb-3 flex items-center gap-2">
        <span className={`grid size-6 shrink-0 place-items-center rounded-md ${toneClass}`}>
          <Icon className="size-3.5" strokeWidth={1.75} aria-hidden />
        </span>
        <h3 className="text-sm font-medium">{title}</h3>
        {rows.length > 0 && (
          <span className="text-muted-foreground tabular bg-muted ml-auto rounded-full px-1.5 py-0.5 text-xs">
            {rows.length}
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground text-caption">{empty}</p>
      ) : (
        <ul className="space-y-1">
          {rows.slice(0, 6).map((row, i) => {
            const item = render(row);
            const body = (
              <>
                <span className="min-w-0 flex-1 truncate">{item.primary}</span>
                {item.trailing && <span className="tabular shrink-0 text-xs">{item.trailing}</span>}
              </>
            );
            return (
              <li key={i} className="text-sm">
                {item.href ? (
                  <Link
                    href={item.href}
                    className="hover:bg-muted -mx-2 flex items-baseline gap-2 rounded-md px-2 py-1 transition-colors duration-[var(--duration-micro)]"
                  >
                    {body}
                  </Link>
                ) : (
                  <div className="-mx-2 flex items-baseline gap-2 px-2 py-1">{body}</div>
                )}
                <p className="text-muted-foreground text-micro truncate">{item.secondary}</p>
              </li>
            );
          })}
          {rows.length > 6 && (
            <li className="text-muted-foreground text-micro pt-1">and {rows.length - 6} more</li>
          )}
        </ul>
      )}
    </div>
  );
}

export function ActionQueue() {
  const { data, isPending } = useGetApiAdminActions();

  if (isPending) {
    return (
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className={`h-40 rounded-xl ${i === 4 ? "xl:col-span-2" : ""}`} />
        ))}
      </div>
    );
  }

  const q = apiData<Partial<Record<string, Row[]>>>(data) ?? {};
  const dunning = q.dunning ?? [];
  const failedPayments = q.failedPayments ?? [];
  const failingWebhooks = q.failingWebhooks ?? [];
  const stuck = q.stuckBillingEvents ?? [];
  const atLimit = q.atLimit ?? [];

  return (
    /*
      Five lists in three columns left a hole in the second row. The last one
      spans it — and it is the right one to widen, because its rows carry a raw
      provider error string that was being truncated hardest of the five.
    */
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      <Queue
        title="Payment at risk"
        icon={AlertTriangle}
        tone="warning"
        rows={dunning}
        empty="Every subscription is paying. Nothing to chase."
        render={(r) => ({
          primary: str(r, "name") || str(r, "org_id"),
          secondary: `${str(r, "plan_id")} · ${str(r, "status")}${
            r.grace_until ? ` · grace ends ${relativeDay(num(r, "grace_until"))}` : ""
          }`,
          trailing: money(num(r, "at_risk_cents")),
          href: `/admin/accounts/${str(r, "org_id")}`,
        })}
      />

      <Queue
        title="Failed payments"
        icon={CreditCard}
        tone="destructive"
        rows={failedPayments}
        empty="No failed charges in the last 30 days."
        render={(r) => ({
          primary: str(r, "name") || str(r, "org_id"),
          secondary: relativeDay(num(r, "created_at")),
          trailing: money(num(r, "amount_cents")),
          href: `/admin/accounts/${str(r, "org_id")}`,
        })}
      />

      <Queue
        title="Close to a limit"
        icon={Gauge}
        tone="default"
        rows={atLimit}
        empty="Nobody is near a cap — no upgrade conversations waiting."
        render={(r) => {
          const used = num(r, "used");
          const cap = num(r, "cap");
          return {
            primary: str(r, "name") || str(r, "org_id"),
            secondary: `${str(r, "metric").replaceAll("_", " ")} on ${str(r, "plan")}`,
            trailing: `${Math.round((used / (cap || 1)) * 100)}%`,
            href: `/admin/accounts/${str(r, "org_id")}`,
          };
        }}
      />

      <Queue
        title="Webhooks failing"
        icon={Webhook}
        tone="warning"
        rows={failingWebhooks}
        empty="Every endpoint is accepting deliveries."
        render={(r) => ({
          primary: str(r, "name") || str(r, "org_id"),
          secondary: `${str(r, "url").slice(0, 60)} — ${str(r, "last_error").slice(0, 60) || "no error recorded"}`,
          trailing: `${num(r, "consecutive_failures")} fails`,
          href: `/admin/accounts/${str(r, "org_id")}`,
        })}
      />

      <Queue
        className="md:col-span-2 xl:col-span-2"
        title="Billing events stuck"
        icon={Zap}
        tone="destructive"
        rows={stuck}
        empty="Every Dodo event has been processed."
        render={(r) => ({
          primary: str(r, "type"),
          secondary: `${str(r, "status")} — ${str(r, "error").slice(0, 70) || "no detail"}`,
          trailing: relativeDay(num(r, "created_at")),
        })}
      />
    </div>
  );
}
