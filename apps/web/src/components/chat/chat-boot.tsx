"use client";

/**
 * What fills the screen while we work out which screen this is.
 *
 * The respondent's first decision — a fresh conversation, a resumed one, or
 * "you've already answered this" — needs a network round trip, and the page
 * used to render the whole chat while it waited and then throw that away. A
 * hard swap of the entire viewport reads as a bug even when it is correct.
 *
 * So this holds the frame instead. It is deliberately the same shape as what
 * follows — a bubble arriving into a thread — so the transition is a
 * continuation rather than a replacement, and it uses the form's own accent so
 * the first thing anyone sees already belongs to the brand they signed up for.
 *
 * No progress bar and no percentage: it does not know how long this takes, and
 * a bar that lies is worse than a shape that waits.
 */
export function ChatBoot({ title, logoUrl }: { title?: string; logoUrl?: string | null }) {
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-5 px-6">
      <div className="relative grid place-items-center">
        {/*
          Two rings breathing out of the mark on a long, offset cycle. Slow
          enough to read as calm rather than busy, and `motion-reduce` drops
          them entirely — a waiting screen is the last place to force motion on
          someone who asked for none.
        */}
        <span className="chat-boot-ring motion-reduce:hidden" />
        <span className="chat-boot-ring chat-boot-ring-delayed motion-reduce:hidden" />
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="relative size-12 rounded-2xl object-contain" />
        ) : (
          <span
            className="relative grid size-12 place-items-center rounded-2xl text-lg font-semibold"
            style={{ background: "var(--cf-accent)", color: "var(--cf-accent-text)" }}
          >
            {(title ?? "").trim().charAt(0).toUpperCase() || "?"}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5" aria-hidden="true">
        <span className="chat-boot-dot" />
        <span className="chat-boot-dot chat-boot-dot-2" />
        <span className="chat-boot-dot chat-boot-dot-3" />
      </div>

      {/* The only text, and it is a status rather than a promise of speed. */}
      <p className="text-sm opacity-55" role="status">
        Getting the conversation ready…
      </p>
    </div>
  );
}
