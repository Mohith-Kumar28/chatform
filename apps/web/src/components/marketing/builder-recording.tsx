"use client";

import { useEffect, useRef, useState } from "react";
import { Blocks, Maximize2, Palette, Pause, Play, RotateCcw, Send, Volume2, VolumeX } from "lucide-react";
import { TESTIMONIALS } from "@/content/social-proof";
import { Band } from "./band";
import { Doodle } from "./doodles";
import { PANEL_SHADOW, SectionLede, SectionTitle, TextLink } from "./kit";
import { TestimonialQuote } from "./social-proof";

/**
 * A screen recording of the real builder with quiet click and typing sounds,
 * about 1 MB, served as a static asset. Re-record with `tooling/builder-recording/record.mjs` and `encode.mjs`
 * when the builder changes enough that this stops matching it.
 */
const VIDEO = "/marketing/builder-demo.mp4";
const POSTER = "/marketing/builder-demo-poster.webp";

/**
 * Plays while on screen and pauses when it leaves, so it never burns a
 * phone's battery in the background. `preload="none"`: nothing downloads until
 * the section is close. Reduced motion leaves it on its poster with the play
 * button showing.
 */
function Recording() {
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [muted, setMuted] = useState(true);
  /* Sound is on unless the visitor turns it off. A browser only lets a video
     be heard once the page has been tapped or typed in, so until then it plays
     silently and the first tap anywhere brings the sound in. */
  const wantSound = useRef(true);

  useEffect(() => {
    const el = video.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    el.volume = 0.7;
    const start = () => {
      el.muted = !(wantSound.current && navigator.userActivation?.hasBeenActive);
      el.play().catch(() => {
        // Sound was refused after all: play silently instead of not at all.
        el.muted = true;
        el.play().catch(() => {});
      });
    };
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !userPaused) start();
        else el.pause();
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    const unlock = () => {
      if (wantSound.current) el.muted = false;
    };
    window.addEventListener("pointerup", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      io.disconnect();
      window.removeEventListener("pointerup", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [userPaused]);

  const toggle = () => {
    const el = video.current;
    if (!el) return;
    if (el.paused) {
      setUserPaused(false);
      el.play().catch(() => {});
    } else {
      setUserPaused(true);
      el.pause();
    }
  };

  const restart = () => {
    const el = video.current;
    if (!el) return;
    el.currentTime = 0;
    setUserPaused(false);
    el.play().catch(() => {});
  };

  const toggleSound = () => {
    const el = video.current;
    if (!el) return;
    el.muted = !el.muted;
    wantSound.current = !el.muted;
    if (!el.muted && el.paused) el.play().catch(() => {});
  };

  /* Full screen, mostly for phones, where the builder is too small to read
     inline. iOS Safari only full-screens a video through its own API. */
  const maximize = () => {
    const el = video.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (!el) return;
    if (el.requestFullscreen) el.requestFullscreen().catch(() => el.webkitEnterFullscreen?.());
    else el.webkitEnterFullscreen?.();
    el.play().catch(() => {});
  };

  const pill =
    "bg-card/95 text-foreground hover:bg-primary hover:text-on-primary inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold shadow-md backdrop-blur transition-colors";

  return (
    <div className={`group bg-card ring-foreground/10 relative overflow-hidden rounded-[14px] ring-1 ${PANEL_SHADOW}`}>
      <video
        ref={video}
        src={VIDEO}
        poster={POSTER}
        muted
        loop
        playsInline
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onVolumeChange={(e) => setMuted(e.currentTarget.muted)}
        aria-label="Screen recording: a form is built from a sentence, the questions are walked through, a rating question is added, the design is changed and the share page is opened."
        className="block aspect-[1600/900] w-full bg-[var(--muted)]"
      />
      <button type="button" onClick={toggleSound} className={`${pill} absolute bottom-3 left-3`} aria-pressed={!muted}>
        {muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
        {muted ? "Sound off" : "Sound on"}
      </button>
      <div className="absolute right-3 bottom-3 flex gap-2">
        <button type="button" onClick={maximize} className={pill} aria-label="Full screen">
          <Maximize2 className="size-3.5" />
          <span className="hidden sm:inline">Full screen</span>
        </button>
        <button type="button" onClick={toggle} className={pill}>
          {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
          {playing ? "Pause" : "Play"}
        </button>
        <button type="button" onClick={restart} className={`${pill} max-sm:hidden`}>
          <RotateCcw className="size-3.5" />
          Restart
        </button>
      </div>
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
    <Band id="features" hairline>
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
