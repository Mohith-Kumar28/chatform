"use client";

import { ArrowUpRight, CalendarDays, Video } from "lucide-react";
import { detectSchedulingProvider, isMeetingRoom, schedulingLabel, type SchedulingProvider } from "@repo/form-schema";
import { useT } from "./i18n";

const PROVIDER_NAME: Record<SchedulingProvider, string | null> = {
  cal: "Cal.com",
  calendly: "Calendly",
  google: "Google Calendar",
  meet: "Google Meet",
  zoom: "Zoom",
  teams: "Microsoft Teams",
  hubspot: "HubSpot Meetings",
  savvycal: "SavvyCal",
  tidycal: "TidyCal",
  other: null,
};

/** `cal.com/tgmlabs/intro-call`: where the button goes, without the scheme. */
function shortLink(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname === "/" ? "" : u.pathname}`.replace(/\/$/, "");
  } catch {
    return url;
  }
}

/**
 * A booking link, drawn as a card rather than two loose buttons.
 *
 * It was a pill and a chip under the question, which read as a bare link:
 * nothing said it was a calendar, or whose. The card names the service and the
 * page it opens, so the respondent knows where they are going before they go.
 *
 * Opening the page is the answer. There used to be an "I've booked" button
 * under it, and whoever booked in the new tab and never came back to press it
 * was left a partial response and sent a "finish your form" email. We can't
 * see the booking either way, so the click is recorded as the page being
 * opened, not as a booking.
 *
 * Drawn from the theme's own variables, so it wears the form's colours in the
 * live chat and the builder preview alike (both render `QuestionAffordance`).
 */
export function BookingCard({
  url,
  buttonLabel,
  disabled,
  onOpen,
}: {
  url: string;
  buttonLabel?: string;
  disabled?: boolean;
  onOpen: (room: boolean) => void;
}) {
  const t = useT();
  // A bare Zoom or Meet room has no slot to pick: it is joined, not booked.
  const room = url ? isMeetingRoom(url) : false;
  const Icon = room ? Video : CalendarDays;
  const provider = url ? PROVIDER_NAME[detectSchedulingProvider(url)] : null;

  return (
    <div className="animate-message-in w-full max-w-md overflow-hidden rounded-[var(--cf-radius-card)] border border-[var(--cf-chip-border)] bg-[var(--cf-chip-bg)]">
      <div className="flex items-center gap-3 p-4">
        {/* A calendar page: the accent binding strip over a tinted sheet. */}
        <div className="flex size-12 shrink-0 flex-col overflow-hidden rounded-xl border border-[color-mix(in_oklab,var(--cf-accent)_30%,transparent)] bg-[color-mix(in_oklab,var(--cf-accent)_12%,transparent)]">
          <div className="h-2.5 shrink-0 bg-[var(--cf-accent)]" />
          <div className="grid flex-1 place-items-center text-[var(--cf-accent)]">
            <Icon className="size-5" strokeWidth={2} aria-hidden />
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{provider ?? (room ? t("Video call") : t("Booking page"))}</p>
          {url && <p className="truncate text-xs opacity-60">{shortLink(url)}</p>}
        </div>
      </div>

      <div className="px-4 pb-4">
        <a
          href={url || "#"}
          target="_blank"
          rel="noreferrer"
          // Still opens once answered, so the link stays usable; only the
          // first click answers.
          onClick={() => {
            if (!disabled) onOpen(room);
          }}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[var(--cf-radius-control)] bg-[var(--cf-accent)] px-5 text-sm font-semibold text-[var(--cf-accent-text)] shadow-sm transition-[transform,filter] hover:brightness-105 active:scale-[0.98] motion-reduce:active:scale-100"
        >
          {schedulingLabel(url, buttonLabel)}
          <ArrowUpRight className="size-4" aria-hidden />
        </a>
      </div>
    </div>
  );
}
