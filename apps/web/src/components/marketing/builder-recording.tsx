"use client";

import { useEffect, useRef } from "react";
import { Blocks, Palette, Send } from "lucide-react";
import { TESTIMONIALS } from "@/content/social-proof";
import { Band } from "./band";
import { Doodle } from "./doodles";
import { PANEL_SHADOW, SectionLede, SectionTitle, TextLink } from "./kit";
import { TestimonialQuote } from "./social-proof";

/**
 * A screen recording of the real builder with quiet click and typing sounds,
 * about 5 MB and ninety seconds, served as a static asset. Re-record with `tooling/builder-recording/record.mjs` and `encode.mjs`
 * when the builder changes enough that this stops matching it.
 */
const VIDEO = "/marketing/builder-demo.mp4";
const POSTER = "/marketing/builder-demo-poster.webp";

/**
 * An ordinary video player: the browser's own controls, so it can be paused,
 * scrubbed, muted and put full screen the way any video can.
 *
 * It plays while on screen and pauses when it leaves. `preload="none"`:
 * nothing downloads until the section is close. Reduced motion leaves it on
 * its poster until play is pressed.
 *
 * Sound is on unless the visitor mutes it. The same approach as the product
 * tour: always try to play with sound first, because a browser allows it for
 * anyone who has tapped or typed on the page and, in Chrome, for a returning
 * visitor who has played our video before. Only when that is refused does it
 * play silently, and then the first tap, click or key anywhere on the page
 * brings the sound in without restarting it.
 */
function Recording() {
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = video.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    el.volume = 0.7;

    let wantSound = true;
    let userPaused = false;
    let inView = false;
    /*
      What this effect last set `muted` to, so `volumechange` can tell a
      visitor pressing the speaker from the effect doing its job. Compared by
      value rather than by a "this one is ours" flag: the event arrives later
      and in no promised order, and setting the volume above fires one too,
      which a flag read as the visitor muting before anything had played.
    */
    let mutedByUs = el.muted;
    const setMuted = (muted: boolean) => {
      mutedByUs = muted;
      el.muted = muted;
    };
    let pausedByUs = false;

    const GESTURES = ["pointerdown", "keydown", "touchend", "click"] as const;
    let armed = false;
    const disarm = () => {
      armed = false;
      for (const type of GESTURES) window.removeEventListener(type, onGesture, { capture: true });
    };
    const arm = () => {
      if (armed) return;
      armed = true;
      for (const type of GESTURES) window.addEventListener(type, onGesture, { capture: true });
    };
    const playSilently = () => {
      setMuted(true);
      el.play().catch(() => {});
      arm();
    };
    /* With sound if the browser allows it, silently and listening if not. */
    const start = () => {
      if (!wantSound) {
        el.play().catch(() => {});
        return;
      }
      setMuted(false);
      el.play().then(disarm, playSilently);
    };
    function onGesture(event: Event) {
      // The player's own controls speak for themselves.
      if (event.target instanceof Node && el!.contains(event.target)) return;
      if (!wantSound) return disarm();
      // Off screen it is paused; the next time it scrolls in, `start` tries
      // with sound, and this gesture is what lets that succeed.
      if (el!.paused || !el!.muted) return;
      setMuted(false);
      // A gesture the browser does not count (the end of a scroll, say)
      // pauses an unmuted video: go back to silent and wait for a real one.
      el!.play().then(disarm, playSilently);
    }

    const onVolume = () => {
      if (el.muted === mutedByUs) return;
      mutedByUs = el.muted;
      wantSound = !el.muted;
    };
    const onPause = () => {
      if (!pausedByUs && inView && !el.ended) userPaused = true;
      pausedByUs = false;
    };
    const onPlay = () => {
      userPaused = false;
    };
    el.addEventListener("volumechange", onVolume);
    el.addEventListener("pause", onPause);
    el.addEventListener("play", onPlay);

    const io = new IntersectionObserver(
      ([entry]) => {
        inView = entry?.isIntersecting ?? false;
        if (inView) {
          if (!userPaused) start();
        } else if (!el.paused) {
          pausedByUs = true;
          el.pause();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      disarm();
      el.removeEventListener("volumechange", onVolume);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("play", onPlay);
    };
  }, []);

  return (
    <div className={`bg-card ring-foreground/10 overflow-hidden rounded-[14px] ring-1 [transform:translateZ(0)] ${PANEL_SHADOW}`}>
      <video
        ref={video}
        src={VIDEO}
        poster={POSTER}
        muted
        loop
        controls
        playsInline
        preload="none"
        aria-label="Screen recording of chatform: a form is built from a sentence, edited, styled and shared, then its responses and analytics are opened."
        className="block aspect-[1600/900] w-full bg-[var(--muted)]"
      />
    </div>
  );
}

const STEPS = [
  {
    icon: Blocks,
    title: "Add your questions",
    body: "Pick from every kind of question, drag them into order, and branch on any answer.",
  },
  {
    icon: Palette,
    title: "Make it look like you",
    body: "Start from a theme, then set your own colour. Light or dark, round or square.",
  },
  {
    icon: Send,
    title: "Send it out",
    body: "A link, a QR code, a corner button or an embed on your own site.",
  },
] as const;

export function BuilderRecording() {
  return (
    <Band id="features">
      <div className="grid items-end gap-8 lg:grid-cols-2">
        <SectionTitle eyebrow="A builder that stays out of your way" accent="should feel this easy.">
          Building a form
        </SectionTitle>
        <div className="lg:pb-2">
          <SectionLede className="mt-0">
            Everything is on one screen: the questions on the left, the form as people will see it on the right.
          </SectionLede>
          <div className="mt-5">
            <TextLink href="/signin?mode=signup">Make your first form</TextLink>
          </div>
        </div>
      </div>

      <div className="relative mt-12">
        <Doodle name="pencil" tilt={-10} className="-top-10 -left-6" />
        <Doodle name="check" tilt={12} className="-right-8 top-1/3" tone="violet" />
        <Recording />
      </div>

      <ul className="mt-12 grid gap-8 sm:grid-cols-3">
        {STEPS.map(({ icon: Icon, title, body }) => (
          <li key={title}>
            <span className="border-border bg-card grid size-9 place-items-center rounded-lg border">
              <Icon className="size-4.5" strokeWidth={1.75} />
            </span>
            <h3 className="font-display mt-4 text-lg font-semibold">{title}</h3>
            <p className="text-muted-foreground mt-1.5 leading-relaxed">{body}</p>
          </li>
        ))}
      </ul>

      <TestimonialQuote testimonial={TESTIMONIALS.builder} />
    </Band>
  );
}
