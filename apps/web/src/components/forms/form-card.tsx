"use client";

import Link from "next/link";
import {
  BarChart3,
  Copy,
  ExternalLink,
  Link2,
  MessageSquare,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface FormRow {
  id: string;
  title: string;
  slug: string;
  status: string;
  responses: number;
  updatedAt: number;
  questionCount?: number;
  preview?: string[];
}

/**
 * A form, as a card.
 *
 * The old card had a title, a badge and a large translucent first letter over
 * a gradient, because a title and a badge was all the list endpoint returned.
 * It looked the same for every form, which meant a grid of them was a grid of
 * one thing repeated — nothing to scan, nothing to recognise.
 *
 * Now the thumbnail is the form's own opening line in a chat bubble and the
 * subtitle is the questions it actually asks (DESIGN.md §2.1). Two forms are
 * told apart at a glance, which is the entire job of a card in a grid.
 */
export function FormCard({
  form,
  layout,
  onDelete,
}: {
  form: FormRow;
  layout: "grid" | "list";
  onDelete: () => void;
}) {
  const published = form.status === "published";
  const publicUrl = typeof window !== "undefined" ? `${window.location.origin}/f/${form.slug}` : "";
  const preview = form.preview ?? [];
  // The greeting opens the card; the questions describe it. A form with no
  // greeting leads with its first question instead, which is what a
  // respondent would see anyway.
  const opener = preview[0] ?? form.title;
  const asks = preview.slice(1);
  const description = asks.length > 0 ? asks.join(" · ") : "No questions yet — open it to start building.";

  const copyLink = async () => {
    await navigator.clipboard.writeText(publicUrl);
    toast.success("Link copied");
  };

  const status = (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          published ? "bg-[var(--success)]" : "bg-muted-foreground/40",
        )}
      />
      <span className={cn("text-xs", published ? "text-[var(--success)]" : "text-muted-foreground")}>
        {published ? "Live" : "Draft"}
      </span>
    </span>
  );

  const meta = (
    <>
      {status}
      {form.questionCount !== undefined && (
        <span className="text-muted-foreground tabular text-xs">
          {form.questionCount} question{form.questionCount === 1 ? "" : "s"}
        </span>
      )}
      <span className="text-muted-foreground tabular text-xs">
        {form.responses} response{form.responses === 1 ? "" : "s"}
      </span>
      <span className="text-muted-foreground text-xs">{relativeTime(form.updatedAt)}</span>
    </>
  );

  const actions = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Actions for ${form.title}`}
          onClick={(e) => e.preventDefault()}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem asChild>
          <Link href={`/forms/${form.id}/results`}>Results</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/forms/${form.id}/share`}>Share</Link>
        </DropdownMenuItem>
        {published && (
          <>
            <DropdownMenuItem onSelect={copyLink}>
              <Copy className="size-3.5" />
              Copy link
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={`/f/${form.slug}`} target="_blank" rel="noreferrer">
                <ExternalLink className="size-3.5" />
                Open live form
              </a>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2 className="size-3.5" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (layout === "list") {
    return (
      <div className="bg-card border-border hover:bg-muted/40 flex items-center gap-4 rounded-xl border px-4 py-3 transition-colors duration-[var(--duration-micro)]">
        <Link href={`/forms/${form.id}/build`} className="min-w-0 flex-1">
          <p className="truncate font-medium">{form.title}</p>
          <p className="text-muted-foreground mt-0.5 truncate text-xs">{description}</p>
        </Link>
        <div className="hidden items-center gap-3 sm:flex">{meta}</div>
        {actions}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "bg-card border-border group relative flex h-full flex-col overflow-hidden rounded-2xl border",
        "shadow-xs transition-[box-shadow,transform] duration-[var(--duration-standard)] ease-[var(--ease-out)]",
        // Cards lift; buttons don't (DESIGN.md §4.4).
        "hover:-translate-y-0.5 hover:shadow-md motion-reduce:hover:translate-y-0",
        "focus-within:ring-ring/40 focus-within:ring-2",
      )}
    >
      <Link href={`/forms/${form.id}/build`} className="flex min-w-0 flex-1 flex-col">
        <ChatThumb opener={opener} answer={asks[0]} />

        <div className="flex flex-1 flex-col p-4">
          <h3 className="font-display truncate font-semibold">{form.title}</h3>
          <p className="text-muted-foreground mt-1 line-clamp-2 text-sm leading-relaxed">
            {description}
          </p>
          <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-3">{meta}</div>
        </div>
      </Link>

      {/* Quick actions sit above the card link. Revealed on hover, but always
          present for keyboard focus and on touch, where there is no hover. */}
      <div
        className={cn(
          "absolute top-2 right-2 flex items-center gap-0.5 rounded-full",
          "bg-card/80 p-0.5 backdrop-blur-sm",
          "opacity-0 transition-opacity duration-[var(--duration-micro)]",
          "group-hover:opacity-100 focus-within:opacity-100 max-sm:opacity-100",
        )}
      >
        {published && (
          <Button variant="ghost" size="icon-sm" aria-label="Copy public link" onClick={copyLink}>
            <Link2 className="size-3.5" />
          </Button>
        )}
        <Button variant="ghost" size="icon-sm" aria-label="Results" asChild>
          <Link href={`/forms/${form.id}/results`}>
            <BarChart3 className="size-3.5" />
          </Link>
        </Button>
        {actions}
      </div>
    </div>
  );
}

/**
 * The form's own opening, drawn as two chat bubbles.
 *
 * Static and derived — no screenshot to capture, nothing to keep in sync. The
 * "answer" is the next question rather than a real reply, so the shape reads
 * as a conversation without inventing respondent data that does not exist.
 */
function ChatThumb({ opener, answer }: { opener: string; answer?: string }) {
  return (
    <div className="from-primary-soft/70 to-accent/30 relative h-28 shrink-0 overflow-hidden bg-gradient-to-br p-3">
      <div className="flex items-start gap-1.5">
        <span className="bg-card/80 text-primary mt-0.5 grid size-5 shrink-0 place-items-center rounded-full">
          <MessageSquare className="size-2.5" strokeWidth={2} />
        </span>
        <p className="bg-card/90 text-foreground line-clamp-2 max-w-[85%] rounded-xl rounded-bl-sm px-2.5 py-1.5 text-[0.6875rem] leading-snug shadow-xs">
          {opener}
        </p>
      </div>
      {answer && (
        <p className="bg-primary/85 text-[var(--on-primary)] ml-auto mt-2 line-clamp-1 w-fit max-w-[75%] rounded-xl rounded-br-sm px-2.5 py-1.5 text-[0.6875rem] leading-snug">
          {answer}
        </p>
      )}
    </div>
  );
}

export function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
