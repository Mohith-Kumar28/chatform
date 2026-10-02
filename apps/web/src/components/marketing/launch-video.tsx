"use client";

import { useEffect, useRef, useState, type AnchorHTMLAttributes, type MouseEvent } from "react";
import { Volume2 } from "lucide-react";

/**
 * The launch video, in its own band directly under the hero.
 *
 * Not in the hero itself: the right column there is ~520px, too narrow for a
 * 16:9 cut with on-screen type, and the chat demo already says "a form that
 * talks" in three seconds without sound. This band is where the 80-second
 * version gets the full width.
 *
 * The files live in the `chatform-media` R2 bucket behind `media.chatform.in`,
 * a public bucket kept apart from `chatform-uploads` (respondent files, never
 * public). They are too big for Workers Assets, which caps a file at 25 MiB.
 *
 * Nothing is fetched until the band is near the viewport: `src` is set by the
 * observer, so the hero's first paint never waits on a video. Phones get the
 * 720p encode (8 MB), everything else 1080p (20 MB).
 */
const MEDIA = "https://media.chatform.in/launch";
const SRC_720 = `${MEDIA}/launch-720.mp4`;
const SRC_1080 = `${MEDIA}/launch-1080.mp4`;
const POSTER = `${MEDIA}/launch-poster.jpg`;

function pickSrc() {
  return window.matchMedia("(max-width: 768px)").matches ? SRC_720 : SRC_1080;
}

export const LAUNCH_VIDEO_ID = "launch-video";

/** Fired by the hero cue, whose click is itself the gesture that allows sound. */
const PLAY_EVENT = "chatform:launch-video-play";

export function LaunchVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState<string>();
  const [withSound, setWithSound] = useState(false);
  // Sound is offered once: after one full playthrough it goes back to a
  // muted loop, so scrolling past again does not start the music over.
  const finishedRef = useRef(false);

  /**
   * Browsers refuse unmuted playback until the visitor has clicked, tapped or
   * pressed a key on the page. Scrolling does not count, and nothing gets
   * round that. So: try with sound; if refused, play muted and turn the sound
   * on (from the top) at the first gesture anywhere on the page. A visitor
   * who has clicked anything earlier, the hero cue included, hears it at once.
   */
  function unmute(restart: boolean) {
    const video = videoRef.current;
    if (!video) return;
    if (!video.getAttribute("src")) {
      const next = pickSrc();
      video.src = next;
      setSrc(next);
    }
    if (restart) video.currentTime = 0;
    video.muted = false;
    setWithSound(true);
    void video.play().catch(() => {
      video.muted = true;
      setWithSound(false);
    });
  }

  const unmuteRef = useRef(unmute);
  useEffect(() => {
    unmuteRef.current = unmute;
  });

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    video.muted = true;

    let armed = false;
    const onGesture = (event: Event) => {
      // A click on the player is its own button's to handle. Unmuting on its
      // pointerdown would show the native controls under the pointer, and the
      // click that follows would land on them and pause the video.
      if (event.target instanceof Node && video.parentElement?.contains(event.target)) return;
      disarm();
      if (video.muted && !finishedRef.current) unmuteRef.current(true);
    };
    const arm = () => {
      if (armed) return;
      armed = true;
      for (const type of ["pointerdown", "keydown", "touchend"] as const) {
        window.addEventListener(type, onGesture, { capture: true });
      }
    };
    const disarm = () => {
      armed = false;
      for (const type of ["pointerdown", "keydown", "touchend"] as const) {
        window.removeEventListener(type, onGesture, { capture: true });
      }
    };

    const loader = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setSrc((current) => current ?? pickSrc());
        loader.disconnect();
      },
      { rootMargin: "600px 0px" },
    );
    const player = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (!entry.isIntersecting) {
          video.pause();
          return;
        }
        if (reduced && video.muted) return;
        if (!video.muted || finishedRef.current) {
          void video.play().catch(() => {});
          return;
        }
        video.muted = false;
        video
          .play()
          .then(() => setWithSound(true))
          .catch(() => {
            video.muted = true;
            void video.play().catch(() => {});
            arm();
          });
      },
      { threshold: 0.5 },
    );
    loader.observe(video);
    player.observe(video);
    return () => {
      loader.disconnect();
      player.disconnect();
      disarm();
    };
  }, []);

  useEffect(() => {
    const onCue = () => unmuteRef.current(true);
    window.addEventListener(PLAY_EVENT, onCue);
    return () => window.removeEventListener(PLAY_EVENT, onCue);
  }, []);

  return (
    <section
      id={LAUNCH_VIDEO_ID}
      aria-label="Launch video"
      className="relative scroll-mt-16 overflow-x-clip px-6 pt-4 pb-16 sm:pt-8 sm:pb-24"
    >
      {/* The dot grid from the hero, carried down so the band reads as the
          hero's continuation rather than a new section. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:radial-gradient(var(--foreground)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]"
      />

      <div className="relative mx-auto max-w-5xl">

        <div className="relative">
          {/* The halo: the mark's hues on a slow turn, blurred into light
              behind the frame. Rotating a conic gradient moves the colour
              around the edge without anything visibly spinning. The section
              clips only sideways, so the light bleeds up into the hero and
              down into the next band instead of stopping on a hard line. */}
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-10 sm:-inset-20"
          >
            <div className="absolute inset-0 overflow-hidden rounded-[4rem] opacity-60 blur-[90px] dark:opacity-45">
              <div
                className="absolute top-1/2 left-1/2 aspect-square w-[150%] -translate-x-1/2 -translate-y-1/2 [animation:spin_18s_linear_infinite] [background:conic-gradient(from_0deg,var(--brand-orange),var(--family-content),var(--brand-violet),var(--family-number),var(--brand-orange))]"
              />
            </div>
          </div>

          {/* The frame. Phones composite the video on its own layer, which
              ignores a rounded overflow clip and paints over a rim drawn
              underneath it. So the clip is forced onto a layer of its own
              (translateZ), and the 1px gradient rim is drawn on top. */}
          <div className="relative rounded-2xl shadow-[0_30px_80px_-20px_rgb(0_0_0/0.45)] sm:rounded-3xl">
            <div className="relative overflow-hidden rounded-2xl bg-black [transform:translateZ(0)] sm:rounded-3xl">
              <video
                ref={videoRef}
                src={src}
                poster={POSTER}
                loop={!withSound}
                playsInline
                preload="none"
                controls={withSound}
                aria-label="chatform launch video"
                className="block aspect-video w-full"
                onEnded={(event) => {
                  finishedRef.current = true;
                  event.currentTarget.muted = true;
                  setWithSound(false);
                  void event.currentTarget.play().catch(() => {});
                }}
              />

              {withSound ? null : (
                <button
                  type="button"
                  onClick={() => unmute(true)}
                  className="group absolute inset-0 flex items-end justify-center p-4 sm:items-center"
                >
                  <span className="flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-[var(--on-band-vivid)] shadow-lg transition-transform duration-200 ease-out group-hover:scale-105 group-active:scale-[0.97]">
                    <Volume2 className="size-4" strokeWidth={2.25} />
                    Play with sound
                  </span>
                </button>
              )}
            </div>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-2xl bg-[linear-gradient(115deg,var(--brand-orange),var(--brand-violet))] p-px sm:rounded-3xl"
              style={{
                mask: "linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0)",
              }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

/** Scroll to the band and start the video with sound; the click is the permission. */
function playFromCue(event: MouseEvent<HTMLAnchorElement>) {
  event.preventDefault();
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document
    .getElementById(LAUNCH_VIDEO_ID)
    ?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  window.dispatchEvent(new Event(PLAY_EVENT));
}

/** The same jump as the margin note, as a link a `Button asChild` can wrap. */
export function WatchVideoButton({
  children,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a {...props} href={`#${LAUNCH_VIDEO_ID}`} onClick={playFromCue}>
      {children}
    </a>
  );
}

