import { Star } from "lucide-react";
import { CUSTOMER_LOGOS, STATS, type Testimonial } from "@/content/social-proof";
import { cn } from "@/lib/utils";

/**
 * The social-proof slots. Each one renders nothing when `content/social-proof.ts`
 * has nothing for it, so an empty list leaves no gap and no placeholder.
 */

function Avatar({ person, size }: { person: Testimonial; size: number }) {
  if (person.avatar) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a static asset; no optimiser on Workers
      <img src={person.avatar} alt="" width={size} height={size} loading="lazy" className="rounded-full object-cover" style={{ width: size, height: size }} />
    );
  }
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className="bg-primary-soft text-primary-soft-foreground grid shrink-0 place-items-center rounded-full text-sm font-bold"
    >
      {person.name.charAt(0)}
    </span>
  );
}

function Highlighted({ quote, highlight }: { quote: string; highlight?: string }) {
  if (!highlight || !quote.includes(highlight)) return <>{quote}</>;
  const [before, after] = quote.split(highlight, 2);
  return (
    <>
      {before}
      <mark className="bg-primary-soft text-inherit rounded-sm px-1">{highlight}</mark>
      {after}
    </>
  );
}

/**
 * One quote. `inline` sits at the foot of a section, under a hairline; `big`
 * is its own section, with the quote set as large as a heading.
 */
export function TestimonialQuote({
  testimonial,
  variant = "inline",
  className,
}: {
  testimonial?: Testimonial;
  variant?: "inline" | "big";
  className?: string;
}) {
  if (!testimonial) return null;
  const big = variant === "big";

  return (
    <figure className={cn("mx-auto max-w-3xl text-center", big ? "py-6" : "border-border/70 mt-16 border-t pt-12", className)}>
      <span aria-hidden className={cn("font-hand text-primary block leading-none", big ? "h-16 text-[8rem]" : "h-10 text-[5rem]")}>
        &ldquo;
      </span>
      <blockquote
        className={cn(
          "font-display font-semibold tracking-[-0.03em] text-balance",
          big ? "text-[clamp(2rem,1.2rem+2.6vw,3.25rem)] leading-[1.08]" : "text-[1.5rem] leading-snug",
        )}
      >
        <Highlighted quote={testimonial.quote} highlight={testimonial.highlight} />
      </blockquote>
      <figcaption className="mt-6 flex items-center justify-center gap-3 text-left">
        <Avatar person={testimonial} size={big ? 44 : 40} />
        <span className="text-sm">
          <span className="block font-semibold">{testimonial.name}</span>
          <span className="text-muted-foreground block">{testimonial.role}</span>
        </span>
      </figcaption>
    </figure>
  );
}

export function Stars({ count }: { count: number }) {
  return (
    <span className="flex gap-0.5 text-[var(--family-number)]" aria-label={`${count} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} className={cn("size-4", i < count ? "fill-current" : "opacity-30")} />
      ))}
    </span>
  );
}

/** Customer logos on a slow loop. Two copies, so the -50% translate has no seam. */
export function LogoMarquee() {
  if (CUSTOMER_LOGOS.length === 0) return null;
  const row = [...CUSTOMER_LOGOS, ...CUSTOMER_LOGOS];

  return (
    <section aria-label="Teams using chatform" className="px-6 pt-4 pb-10">
      <p className="text-muted-foreground text-center text-xs font-semibold">Teams that ask with chatform</p>
      <div className="mt-6 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
        <ul className="marquee-track flex w-max items-center gap-14 hover:[animation-play-state:paused] [--marquee-duration:80s]">
          {row.map((logo, i) => (
            <li key={`${logo.name}-${i}`} aria-hidden={i >= CUSTOMER_LOGOS.length}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a static asset; no optimiser on Workers */}
              <img src={logo.src} alt={logo.name} height={28} loading="lazy" className="h-7 w-auto opacity-70 brightness-0 dark:invert" />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function StatsRow() {
  if (STATS.length === 0) return null;
  return (
    <section aria-label="chatform in numbers" className="px-6">
      <dl className="border-border/70 mx-auto grid max-w-6xl grid-cols-2 gap-8 border-y py-10 text-center sm:grid-cols-4">
        {STATS.map((s) => (
          <div key={s.label} className="flex flex-col-reverse">
            <dt className="text-muted-foreground mt-1 text-sm">{s.label}</dt>
            <dd className="font-display tabular text-[clamp(1.75rem,1.2rem+1.4vw,2.5rem)] font-semibold tracking-tight">{s.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
