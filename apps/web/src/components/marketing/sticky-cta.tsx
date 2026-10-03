"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { useSignedIn } from "@/lib/auth/use-signed-in";
import { cn } from "@/lib/utils";

/**
 * One action, always in reach: a bar that rises from the bottom once you are
 * past the first screen, and sinks again at the top and near the footer
 * (which carries the same ask). Hidden for anyone signed in; they are not the
 * audience for "start free".
 *
 * Below 1280px it shares the bottom edge with the contact launcher, where the
 * two used to overlap. So while the bar is up it carries Contact itself and
 * the launcher steps aside (`html[data-cta-bar]` in globals.css), and the
 * launcher comes back when the bar sinks.
 */
export function StickyCta() {
  const signedIn = useSignedIn();
  const [show, setShow] = useState(false);
  const [hasLauncher, setHasLauncher] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      const nearEnd = y + window.innerHeight > document.documentElement.scrollHeight - 520;
      setShow(y > 560 && !nearEnd);
      setHasLauncher(document.querySelector(".cf-launcher") !== null);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const merged = signedIn === false && show && hasLauncher;
  useEffect(() => {
    if (!merged) return;
    document.documentElement.setAttribute("data-cta-bar", "");
    return () => document.documentElement.removeAttribute("data-cta-bar");
  }, [merged]);

  if (signedIn !== false) return null;

  return (
    <div
      aria-hidden={!show}
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-4 z-[var(--z-sticky)] flex justify-center px-4",
        "transition-[transform,opacity] duration-300 ease-[var(--ease-out)] motion-reduce:transition-none",
        show ? "translate-y-0 opacity-100" : "translate-y-[140%] opacity-0",
      )}
    >
      <div className="bg-card/95 border-border/70 pointer-events-auto flex w-full max-w-3xl items-center gap-4 rounded-2xl border px-4 py-3 shadow-lg backdrop-blur-md sm:px-5">
        <span className="hidden shrink-0 sm:block">
          <LogoMark className="size-9" />
        </span>
        <div className={cn("min-w-0 flex-1", hasLauncher && "max-sm:hidden")}>
          <p className="font-display text-foreground truncate text-base font-semibold">
            Forms people finish. <span className="text-primary">Unlimited responses.</span>
          </p>
          <p className="text-foreground/70 hidden truncate text-sm sm:block">Free forever. No credit card needed.</p>
        </div>
        {hasLauncher ? (
          <button
            type="button"
            data-chatform-open
            tabIndex={show ? 0 : -1}
            className="border-border text-foreground hover:bg-muted inline-flex shrink-0 items-center rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors duration-[var(--duration-micro)] xl:hidden"
          >
            Contact us
          </button>
        ) : null}
        <Link
          href="/signin?mode=signup"
          tabIndex={show ? 0 : -1}
          className={cn(
            "bg-foreground text-background hover:bg-foreground/90 inline-flex shrink-0 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors duration-[var(--duration-micro)]",
            hasLauncher && "max-sm:flex-1",
          )}
        >
          Start for free
          <ArrowRight className="size-4" />
        </Link>
      </div>
    </div>
  );
}
