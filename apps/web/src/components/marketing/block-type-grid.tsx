import { BLOCK_GROUPS } from "@/components/builder/block-library";
import { QUESTION_TYPES } from "./question-types";

/**
 * Every question type, rendered from the builder's own registry via
 * `question-types` — the same list the hero's spectrum strip runs on, and the
 * same one the counts in the copy are derived from.
 *
 * Reading the real registry means this grid cannot drift from the product —
 * add a block type and it appears here, with its own family colour, on the
 * next build. Two entries carry an honest override rather than the builder's
 * copy, because both hand off to something outside chatform and the marketing
 * copy must not imply we process the payment or own the calendar.
 *
 * On colour, and the rule this grid got wrong twice: a `Band` with a family
 * tone sets `--on-band-vivid` on itself, and every descendant inherits it.
 * That is correct for anything sitting directly ON the band, and wrong for
 * anything inside a card, because a card brings its own `--card` ground. So
 * the two levels take tokens from two different systems — band ink outside the
 * card, page ink inside it — and neither may be left to inherit. Left to
 * inherit, each is invisible in exactly one theme, which is why this looked
 * fine in light and unreadable in dark.
 */

const HONEST_COPY: Record<string, string> = {
  payment: "Show your payment link or a UPI QR, then record that they paid.",
  scheduling: "Link out to Cal.com, Calendly or a meeting room, then confirm.",
};

export function BlockTypeGrid() {
  const groups = BLOCK_GROUPS.map((group) => ({
    group,
    items: QUESTION_TYPES.filter((b) => b.group === group),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="flex flex-col gap-8">
      {groups.map(({ group, items }) => (
        <div key={group}>
          {/* On the band, so band ink. `--muted-foreground` is a step off the
              PAGE background — near-white in the dark theme — and these
              headings sit on the number family's vivid ground, which is bright
              in both themes. It was pale grey on gold. */}
          <h3
            className="text-micro mb-3 font-semibold tracking-[0.12em] uppercase"
            style={{ color: "var(--on-band-vivid-muted)" }}
          >
            {group}
          </h3>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((block) => (
              <li key={block.type}>
                <div
                  className="border-border/60 bg-card group flex h-full items-start gap-3 rounded-xl border p-3 transition-colors duration-[var(--duration-micro)] ease-[var(--ease-out)]"
                  style={{ borderColor: `color-mix(in oklch, var(--family-${block.tone}) 22%, transparent)` }}
                >
                  <span
                    className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg"
                    style={{
                      background: `var(--family-${block.tone}-soft)`,
                      color: `var(--family-${block.tone}-ink)`,
                    }}
                  >
                    <block.icon className="size-4" strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0">
                    {/* Inside the card, so page ink. This was the only line
                        in the grid with no colour of its own: it inherited the
                        band's near-black onto a `--card` that goes near-black
                        in the dark theme, and every question type lost its
                        name. The description under it never broke because
                        `--muted-foreground` was already the right system. */}
                    <p className="text-body text-foreground font-medium">{block.label}</p>
                    <p className="text-caption text-muted-foreground mt-0.5 leading-snug">
                      {HONEST_COPY[block.type] ?? block.description}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
