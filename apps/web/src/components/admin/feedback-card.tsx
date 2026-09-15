"use client";

import { Angry, Frown, Laugh, Meh, Smile, type LucideIcon } from "lucide-react";
import { useGetApiAdminFeedback } from "@/lib/api/admin/admin";
import { ChartCard, Empty } from "@/components/charts/chart-kit";
import { Skeleton } from "@/components/ui/skeleton";
import { apiData } from "@/lib/api/payload";
import { relativeTime } from "@/components/forms/form-card";
import type { Range } from "./range-picker";

/**
 * What the people filling in the forms think of the thing running them.
 *
 * Every other panel on this console counts something the product did. This one
 * carries sentences a stranger typed — the only qualitative signal here, and
 * the only one that arrives unprompted. It is also the one place the console
 * reads respondent-written text, which is allowed precisely because of who it
 * was written to: this comes from the "Report a bug" link beside our own
 * footer, so the audience was always us.
 *
 * The distribution and the notes are deliberately side by side. The faces say
 * whether something is wrong this week and take a glance; the notes say what,
 * and take a read. Split across two cards they would be looked at on different
 * days.
 */

interface Note {
  id: string;
  rating: number;
  message: string | null;
  createdAt: number;
  formId: string | null;
  formTitle: string | null;
  respondentId: string | null;
  userAgent: string | null;
}

interface Feedback {
  total: number;
  average: number | null;
  distribution: { rating: number; count: number }[];
  notes: Note[];
}

/**
 * The same five faces the respondent picked from, drawn the same way.
 *
 * Reusing the sentiment scale rather than printing "4/5": the person reading
 * this console and the person who tapped the face should be looking at the same
 * object, and a number needs its own legend before it means anything.
 */
const FACES: Record<number, { label: string; Icon: LucideIcon; color: string }> = {
  1: { label: "Terrible", Icon: Angry, color: "var(--destructive)" },
  2: { label: "Bad", Icon: Frown, color: "var(--destructive)" },
  3: { label: "Okay", Icon: Meh, color: "var(--warning)" },
  4: { label: "Good", Icon: Smile, color: "var(--success)" },
  5: { label: "Great", Icon: Laugh, color: "var(--success)" },
};

export function FeedbackCard({ range }: { range: Range }) {
  const { data, isPending } = useGetApiAdminFeedback({ range });
  const fb = apiData<Feedback>(data);

  const distribution = fb?.distribution ?? [];
  const notes = fb?.notes ?? [];
  const total = fb?.total ?? 0;
  // The tallest bar sets the scale, not the total: on a handful of reports every
  // bar against the total is a stub, and the shape is the whole point of a
  // distribution.
  const peak = Math.max(1, ...distribution.map((d) => d.count));

  return (
    <ChartCard
      title="What respondents say"
      subtitle="Sent from the “Report a bug” link under the chat footer — about chatform, not about the form."
      hint="Only forms still showing our footer carry the link, so this is the free and starter surface. The rating is the face they picked; a note is optional, so a report with no words is still counted in the bars."
      aside={
        isPending || total === 0 ? null : (
          <span className="text-caption text-muted-foreground">
            {fb?.average?.toFixed(1)} avg · {total.toLocaleString()} {total === 1 ? "report" : "reports"}
          </span>
        )
      }
    >
      {isPending ? (
        <Skeleton className="h-56 w-full rounded-lg" />
      ) : total === 0 ? (
        <Empty>Nothing reported in this period.</Empty>
      ) : (
        <div className="grid gap-5 lg:grid-cols-5">
          {/* The shape of the week, highest rating first — good news reads top-down. */}
          <ul className="space-y-2 lg:col-span-2">
            {[...distribution].reverse().map((d) => {
              const face = FACES[d.rating]!;
              return (
                <li key={d.rating} className="flex items-center gap-2.5">
                  <face.Icon className="size-4 shrink-0" style={{ color: face.color }} aria-hidden />
                  <span className="text-caption w-14 shrink-0">{face.label}</span>
                  <span className="bg-muted h-2 min-w-0 flex-1 overflow-hidden rounded-full">
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${(d.count / peak) * 100}%`, background: face.color }}
                    />
                  </span>
                  <span className="tabular text-muted-foreground w-6 shrink-0 text-right text-xs">
                    {d.count}
                  </span>
                </li>
              );
            })}
          </ul>

          {/*
            The notes, scrolled rather than paged.

            Thirty at most come back, and the ones worth acting on are almost
            always at the top — a list you scroll is read, a list you page
            through is abandoned on page one.
          */}
          <ul className="max-h-80 space-y-2 overflow-y-auto lg:col-span-3">
            {notes.map((n) => {
              const face = FACES[n.rating] ?? FACES[3]!;
              return (
                <li key={n.id} className="border-border rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <face.Icon className="size-4 shrink-0" style={{ color: face.color }} aria-label={face.label} />
                    <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
                      {/* Where it happened, for reproducing it. A deleted form leaves the id behind and nothing else. */}
                      {n.formTitle ?? n.formId ?? "form since deleted"}
                    </span>
                    {/* The browser string is the line nobody includes and everybody needs; it rides on the hover. */}
                    <span className="text-muted-foreground shrink-0 text-xs" title={n.userAgent ?? undefined}>
                      {relativeTime(n.createdAt)}
                    </span>
                  </div>
                  {n.message ? (
                    <p className="mt-1.5 text-sm whitespace-pre-wrap">{n.message}</p>
                  ) : (
                    <p className="text-muted-foreground mt-1.5 text-sm italic">Rating only, no note.</p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </ChartCard>
  );
}
