"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";
import { CalendarX2, Clock, Users } from "lucide-react";
import { CLOSED_MESSAGE_DEFAULT, type PublicFormConfig } from "@repo/form-schema";
import { safeMediaSrc } from "@repo/guard";
import { chatThemeVars } from "@/lib/chat-theme";
import { useThemeFonts } from "@/lib/theme-fonts";
import { LogoMark } from "@/components/brand/logo";
import { RichText, SAFE_ELEMENTS } from "./rich-text";
import { cn } from "@/lib/utils";

/**
 * What somebody gets when they open a form that is no longer taking answers.
 *
 * This screen is almost always the *only* thing a person will ever see of a
 * form — a link goes round a college WhatsApp group, the deadline passes, and
 * every tap after that lands here. It used to land on the chat: the whole
 * runtime booted, drew a header with a progress bar reading "0% complete",
 * posted a session the server refused, and printed the refusal in the error
 * rail at the bottom of an empty thread, in red, next to a Retry button that
 * could never work. Three separate pieces of furniture, two of them lying
 * (there is no progress to be 0% of, and nothing to retry), and the one true
 * sentence set in the smallest type on the page.
 *
 * So: no chat, no header, no composer, no retry. One screen that says which
 * form this is, that it is shut, and — where we are allowed to — why.
 *
 * It keeps the author's theme and logo, and that is the point rather than a
 * nicety. A stranger who was sent a link and arrives late should land on
 * something that plainly belongs to the people who sent it; an unbranded grey
 * error page reads as "this link is broken", which sends them back to the
 * organiser to ask a question the page could have answered.
 *
 * Rendered from two places, and both matter. `/f/[slug]/page.tsx` renders it
 * on the server when the config already says `closed`, so the common case
 * costs no boot screen and no round trip. `chat-client` renders it when a
 * session is refused mid-flight — the form that filled up or timed out in the
 * seconds between the page loading and somebody tapping into it.
 */
export function FormClosed({
  config,
  /**
   * The message to show, when it did not come with the config.
   *
   * The client path has a config that was fetched while the form was still
   * open, so `config.closedMessage` is empty there; the refusal it just got
   * carries the author's words instead.
   */
  message,
  /**
   * Fill the parent box rather than the viewport.
   *
   * The same switch `ChatSurface` makes: the hosted page owns the whole screen
   * and uses the fixed shell that survives a phone's collapsing address bar,
   * while the builder preview is a panel inside another layout and a `fixed`
   * child of it would escape to cover the builder.
   */
  contained,
}: {
  config: PublicFormConfig;
  message?: string;
  contained?: boolean;
}) {
  const logoUrl = safeMediaSrc(config.theme.logoUrl);
  const body = (message ?? config.closedMessage ?? "").trim();

  /*
   * The author's own message, or nothing.
   *
   * The schema's default is "This form is no longer accepting responses.",
   * which is the heading again in body type — the same fact twice, one of them
   * set to look like it adds something. An author who wrote a real message
   * (where else to register, when it reopens, who to email) has said the one
   * thing this screen cannot know, and that gets the space. An author who left
   * the default alone gets a heading and nothing under it, which is the honest
   * amount of content.
   */
  const authored = body && body !== CLOSED_MESSAGE_DEFAULT ? body : null;

  const full = config.closedReason === "capacity";
  useThemeFonts(config.theme);

  return (
    <div
      className={cn("chat-surface flex flex-col", contained ? "h-full min-h-0" : "cf-chat-viewport")}
      style={chatThemeVars(config.theme, config.slug)}
    >
      {/*
        `overflow-x-hidden` beside the vertical scroll, and it is not belt and
        braces — a non-visible `overflow-y` forces the computed `overflow-x`
        from `visible` to `auto`, so this box quietly became a horizontal
        scroller too. The thread carries the same guard and the same note.
      */}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-x-hidden overflow-y-auto px-6 py-10 text-center">
        {/*
          The mark, at the size the boot screen uses.

          Same shape and same position, so a form that is refused after the
          spinner — the client-side path — resolves into this rather than
          swapping one screen for a differently-shaped one.
        */}
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={config.theme.brandName ?? config.title}
            className="size-12 rounded-2xl object-contain"
          />
        ) : (
          <span
            className="grid size-12 place-items-center rounded-2xl bg-[var(--cf-surface)] ring-1 ring-[var(--cf-bot-bubble-border)]"
            role="img"
            aria-label={config.theme.brandName ?? config.title}
          >
            <LogoMark className="size-7" />
          </span>
        )}

        {/*
          Which form this is, above the sentence about it.

          The heading is generic by necessity, so without this the page never
          names the thing it is talking about — and somebody who has three
          registration links in a group chat cannot tell which of them just
          shut. It is an eyebrow rather than the heading because the state is
          the news here; the title is the subject it applies to.

          `w-full min-w-0 break-words`, all three, because this is the author's
          own string and nothing upstream promises it contains a space. A title
          like `Campus_Catalyst_2026_Internal_SIH_Hackathon_Registration` is
          one word to a line breaker.

          `break-words` alone does not do it, which is worth writing down: a
          flex item's `min-width` is `auto`, so its floor is its *min-content*
          width — the whole unbroken word — and `overflow-wrap` never lowers
          that floor, it only breaks a line that is already narrow enough to
          need it. So the paragraph sat 384px wide inside a 320px phone and
          slid the screen sideways. `min-w-0` lets it shrink past min-content
          and `break-words` then wraps it. Measured at 320px, not feared —
          and the same trio `EndingCard` puts on its body for the same reason.
        */}
        <p className="mt-6 w-full max-w-sm min-w-0 text-sm leading-snug break-words text-balance opacity-55">
          {config.title}
        </p>

        <h1
          className="mt-1.5 w-full min-w-0 text-2xl font-semibold break-words text-balance sm:text-3xl"
          style={{ fontFamily: "var(--cf-font-heading)" }}
        >
          {full ? "This form is full" : "This form is closed"}
        </h1>

        {authored && (
          <RichText
            markdown={authored}
            /*
              The author's own words, from the same editor as an ending's body,
              so the same element set: a closed message very often carries the
              link to wherever registration moved to, and stripping it would
              leave a dead-end screen that mentions somewhere else to go
              without being able to send anyone there.
            */
            allowedElements={SAFE_ELEMENTS}
            className="mt-3 w-full max-w-sm min-w-0 text-[0.9375rem] opacity-75"
          />
        )}

        {/*
          The detail under it, in the chip the live countdown uses.

          Deliberately the same object as the "closes in 2d" pill a respondent
          would have seen had they arrived in time — the deadline they were
          being counted down to is the deadline they missed, and it should look
          like the same fact having happened.
        */}
        <ClosedDetail closeAt={config.closeAt} full={full} />
      </div>

      {/*
        Our line stays, on the same terms as the chat's.

        No "Report a bug" beside it: that panel attaches a snapshot of the
        conversation, and there is no conversation here. A closed form is the
        form working correctly.
      */}
      {!config.brandingHidden && (
        <p className="pb-6 text-center text-[0.6875rem] opacity-40">
          Powered by{" "}
          <a href="https://chatform.in" target="_blank" rel="noreferrer" className="underline">
            chatform
          </a>
        </p>
      )}
    </div>
  );
}

/**
 * The detail under the heading: when it closed, or that it filled up.
 *
 * The date waits for hydration rather than rendering on the server, and that
 * is not caution about a warning — it is the difference between a right answer
 * and a wrong one. A date formatted server-side is formatted in the worker's
 * zone, so a deadline of 23:30 IST renders as the previous day to every reader
 * in India, and a form that closed "yesterday" when it closed tonight is
 * exactly the sort of thing somebody will argue with an organiser about.
 *
 * The clock comes through `useSyncExternalStore` with a `0` server snapshot —
 * the same shape `ClosingNotice` uses, and for the same two reasons: nothing
 * reads `Date.now()` while rendering, and the first paint is empty on both
 * sides so the locale-formatted time cannot tear during hydration. One read,
 * because unlike the countdown this describes something that has stopped
 * moving.
 *
 * Nothing at all when the date is absent, which is not an edge case: `closeAt`
 * is only projected when the author left the countdown switched on, so an
 * author who chose not to publish their deadline does not publish it here
 * either. The heading stands on its own.
 */
function ClosedDetail({ closeAt, full }: { closeAt?: string; full: boolean }) {
  const nowRef = useRef(0);
  const subscribe = useCallback((onStoreChange: () => void) => {
    nowRef.current = Date.now();
    onStoreChange();
    return () => {};
  }, []);
  const now = useSyncExternalStore(
    subscribe,
    () => nowRef.current,
    () => 0,
  );

  if (full) {
    return (
      <Chip icon={<Users className="mt-px size-3.5 shrink-0" strokeWidth={2} />}>
        Every place has been taken
      </Chip>
    );
  }

  /*
   * Compared against the clock rather than trusted because it is on a closed
   * form. The two are not the same question: the monthly ceiling closes a form
   * whose own deadline may be weeks away, and that form would otherwise print
   * "Closed 3 October" about a date that has not happened.
   */
  const at = closeAt ? Date.parse(closeAt) : NaN;
  if (now === 0 || !Number.isFinite(at) || at > now) return null;

  return (
    <Chip icon={<Clock className="mt-px size-3.5 shrink-0" strokeWidth={2} />}>
      Closed {new Intl.DateTimeFormat(undefined, { dateStyle: "long", timeStyle: "short" }).format(at)}
    </Chip>
  );
}

function Chip({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mt-6 flex justify-center">
      <div
        className={cn(
          // `items-start` and a fixed icon column, so a detail that wraps on a
          // narrow phone wraps as text rather than orphaning the icon — see
          // the same note on `ClosingNotice`, which this is the sibling of.
          "flex max-w-full items-start gap-1.5 rounded-2xl border px-3 py-1.5 text-xs",
          "border-[var(--cf-chip-border)] bg-[var(--cf-chip-bg)] text-[var(--cf-muted)]",
        )}
      >
        {icon}
        <span className="min-w-0 text-left">{children}</span>
      </div>
    </div>
  );
}

/**
 * The link that goes nowhere.
 *
 * A separate screen from the one above, on purpose. "Closed" and "never
 * existed" are different things to the person holding the link: one means they
 * are late, the other means the link is wrong — and the second is the only one
 * where going back to whoever sent it is the right next move. Next's stock 404
 * ("404 | This page could not be found", black on white, no layout) said
 * neither, on the single most-shared URL shape this product has.
 *
 * No theme here, because there is no form to take one from: a slug that does
 * not resolve has no author, no logo and no colours. This is ours, and it says
 * so.
 */
export function FormNotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center px-6 py-10 text-center">
      <span
        className="bg-card ring-border grid size-12 place-items-center rounded-2xl ring-1"
        role="img"
        aria-label="chatform"
      >
        <LogoMark className="size-7" />
      </span>

      <h1 className="mt-6 text-2xl font-semibold text-balance sm:text-3xl">This link doesn&apos;t work</h1>

      {/*
        Both causes, because the reader cannot tell them apart and the action is
        different for each. A mistyped link is theirs to fix; a deleted form is
        not, and the only thing that helps is knowing to go back and ask.
      */}
      <p className="text-muted-foreground mt-3 max-w-sm text-[0.9375rem] leading-relaxed text-balance">
        This form may have been deleted, or the address may be mistyped. If somebody sent you here,
        it is worth asking them for the link again.
      </p>

      <div className="text-muted-foreground mt-6 flex items-center gap-1.5 text-xs">
        <CalendarX2 className="size-3.5 shrink-0" strokeWidth={2} />
        <span>Closed forms keep working and say so. This address matches no form at all.</span>
      </div>

      <a
        href="https://chatform.in"
        className="mt-8 text-sm underline opacity-55 transition-opacity hover:opacity-100"
      >
        What is chatform?
      </a>
    </div>
  );
}
