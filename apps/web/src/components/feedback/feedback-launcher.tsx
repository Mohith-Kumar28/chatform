"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { BookOpen, Bug, CircleHelp, Lightbulb, MessageSquareHeart } from "lucide-react";
import type { BuilderFeedbackKind } from "@repo/form-schema";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { API_ORIGIN, ApiError, apiHeaders, throwApiError } from "@/lib/api/mutator";
import { cn } from "@/lib/utils";
import { areaFromPath, collectContext, formIdFromPath, installErrorCapture } from "./feedback-context";
import { FeedbackPanel, emptyDraft, type FeedbackDraft } from "./feedback-panel";
import { captureScreen } from "./screenshot";

/**
 * The "?" in the bottom-right corner of the dashboard and the builder.
 *
 * The one way a paying customer can reach the people who build chatform without
 * leaving what they were doing. It opens a short menu (bug, feature, feedback,
 * docs), and each of the three opens the same panel on a different kind.
 *
 * Mounted by `DashboardShell` and `BuilderShell`, never by the respondent's form,
 * the marketing site or the admin console. Pages keep their last row clear of it
 * through `.fab-clear` in `globals.css`.
 *
 * Also opened from the command palette, through `openFeedback`.
 */

const OPEN_EVENT = "chatform:open-feedback";

/** Open the panel from anywhere, e.g. the command palette. */
export function openFeedback(kind: BuilderFeedbackKind): void {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: kind }));
}

/** Two frames: the menu that was just picked from has to be gone before the picture is taken. */
const afterPaint = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

export function FeedbackLauncher() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [draft, setDraft] = useState<FeedbackDraft>(() => emptyDraft("bug", areaFromPath(pathname)));

  useEffect(() => installErrorCapture(), []);

  const update = useCallback((next: Partial<FeedbackDraft>) => setDraft((d) => ({ ...d, ...next })), []);

  const start = useCallback(
    async (kind: BuilderFeedbackKind) => {
      // A fresh report follows the page it is opened on; a half-written one keeps its area.
      setDraft((d) => {
        const untouched = !d.message.trim() && !d.steps && !d.why && d.rating === null;
        return { ...d, kind, ...(untouched ? { area: areaFromPath(pathname) } : {}) };
      });
      setCapturing(true);
      setOpen(true);
      await afterPaint();
      const shot = await captureScreen();
      setCapturing(false);
      if (!shot) return;
      // A new picture of the page replaces the old one; images they added stay.
      setDraft((d) => {
        for (const a of d.attachments) if (a.auto) URL.revokeObjectURL(a.url);
        return {
          ...d,
          attachments: [
            { id: crypto.randomUUID(), file: shot, url: URL.createObjectURL(shot), auto: true },
            ...d.attachments.filter((a) => !a.auto),
          ].slice(0, 5),
        };
      });
    },
    [pathname],
  );

  useEffect(() => {
    const onOpen = (e: Event) => void start((e as CustomEvent<BuilderFeedbackKind>).detail ?? "bug");
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, [start]);

  const submit = useCallback(async (): Promise<{ ok: true } | { ok: false; error: string }> => {
    const d = draft;
    const payload = {
      kind: d.kind,
      area: d.area,
      message: d.message,
      ...(d.kind === "bug" ? { steps: d.steps, expected: d.expected, severity: d.severity ?? undefined } : {}),
      ...(d.kind === "feature" ? { why: d.why, severity: d.importance ?? undefined } : {}),
      ...(d.kind === "feedback" ? { rating: d.rating ?? undefined } : {}),
      url: window.location.href,
      formId: formIdFromPath(pathname),
      autoScreenshot: d.attachments.findIndex((a) => a.auto) === -1 ? undefined : d.attachments.findIndex((a) => a.auto),
      context: collectContext(),
    };
    const body = new FormData();
    body.set("payload", JSON.stringify(payload));
    for (const a of d.attachments) body.append("images", a.file, a.file.name);

    const url = `${API_ORIGIN}/api/feedback`;
    try {
      // No content-type: the browser sets it, with the multipart boundary.
      const res = await fetch(url, { method: "POST", body, headers: apiHeaders(), credentials: "include" });
      if (!res.ok) await throwApiError(res, url);
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof ApiError ? err.message : "That didn't send. Check your connection and try again.",
      };
    }
  }, [draft, pathname]);

  const sent = useCallback(() => {
    setOpen(false);
    setDraft((d) => {
      for (const a of d.attachments) URL.revokeObjectURL(a.url);
      return emptyDraft("bug", areaFromPath(pathname));
    });
  }, [pathname]);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            data-feedback-ignore=""
            aria-label="Help and feedback"
            className={cn(
              "bg-card text-muted-foreground hover:text-foreground border-border fixed right-4 bottom-4 z-[var(--z-fab)]",
              "grid size-10 place-items-center rounded-full border shadow-md",
              "transition-[color,transform,box-shadow] duration-[var(--duration-micro)] hover:shadow-lg",
              "active:scale-[0.96] motion-reduce:active:scale-100",
              // Out of the way of the sheet it opened on a phone.
              open && "max-sm:hidden",
            )}
          >
            <CircleHelp className="size-5" strokeWidth={1.75} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end" sideOffset={8} className="w-56" data-feedback-ignore="">
          <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">Tell the chatform team</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => void start("bug")}>
            <Bug />
            Report a bug
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void start("feature")}>
            <Lightbulb />
            Request a feature
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void start("feedback")}>
            <MessageSquareHeart />
            Share feedback
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <a href="/docs" target="_blank" rel="noreferrer">
              <BookOpen />
              Help and docs
            </a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {open && (
        <FeedbackPanel
          draft={draft}
          onChange={update}
          capturing={capturing}
          onClose={() => setOpen(false)}
          onSubmit={submit}
          onSent={sent}
        />
      )}
    </>
  );
}
