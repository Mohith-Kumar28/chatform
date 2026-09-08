"use client";

import { LogoMark } from "@/components/brand/logo";

/**
 * What fills the screen while we work out which screen this is.
 *
 * The respondent's first decision — a fresh conversation, a resumed one, or
 * "you've already answered this" — needs a network round trip, and the page
 * used to render the whole chat while it waited and then throw that away. A
 * hard swap of the entire viewport reads as a bug even when it is correct.
 *
 * So this holds the frame instead. It is deliberately the same shape as what
 * follows — a mark, then the thread — so the transition is a continuation
 * rather than a replacement.
 *
 * It is also the first thing a stranger sees of somebody's brand, which is why
 * it is now so quiet. It used to ping two accent rings out of the logo to
 * 2.1x while three accent dots hopped underneath: expanding geometry, moving
 * geometry and the loudest colour on the page, all at once, on a screen whose
 * entire job is to wait. The mark holds still now and the dots only fade. The
 * motion budget of a loading screen is very close to zero.
 *
 * No progress bar and no percentage: it does not know how long this takes, and
 * a bar that lies is worse than a shape that waits.
 */
export function ChatBoot({ title, logoUrl }: { title?: string; logoUrl?: string | null }) {
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center px-6">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt={title ?? ""} className="size-12 rounded-2xl object-contain" />
      ) : (
        <span
          className="grid size-12 place-items-center rounded-2xl bg-[var(--cf-surface)] ring-1 ring-[var(--cf-bot-bubble-border)]"
          role="img"
          aria-label={title ?? "chatform"}
        >
          <LogoMark className="size-7" />
        </span>
      )}

      {/*
        Uneven on purpose. The dots belong to the mark — they are the thing
        telling you it is working — while the sentence is a caption underneath
        the pair, so it sits closer to them than they do to the logo.
      */}
      <div className="mt-6 flex items-center gap-1.5" aria-hidden="true">
        <span className="chat-boot-dot" />
        <span className="chat-boot-dot chat-boot-dot-2" />
        <span className="chat-boot-dot chat-boot-dot-3" />
      </div>

      {/* The only text, and it is a status rather than a promise of speed. */}
      <p className="mt-3.5 text-sm opacity-50" role="status">
        Getting the conversation ready…
      </p>
    </div>
  );
}
