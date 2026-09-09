import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";

/**
 * Every link here resolves. Nothing is listed that does not exist yet.
 *
 * The Developers column used to be three separate labels pointing at the same
 * `/#developers` anchor, which is a column that looks like navigation and is
 * one link wearing three hats. It now points at the pages that actually answer
 * each of those words. `/docs` was in the top nav and missing from the footer
 * entirely, which is backwards: the footer is where somebody looks after
 * scrolling a whole page without finding what they came for.
 */
const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/use-cases", label: "What people use it for" },
      { href: "/#how-it-works", label: "How it works" },
      { href: "/#the-moment", label: "How it answers back" },
      /* Was labelled "How it works", which is now the band above it. This one
         has always been the *build* flow — describe, shape, share — and giving
         it the name it deserved makes the two distinguishable in a list. */
      { href: "/#product", label: "Building and sharing" },
      { href: "/pricing#question-types", label: "Question types" },
      { href: "/pricing", label: "Pricing" },
    ],
  },
  {
    /*
     * Named the way somebody scanning a footer would name it to themselves.
     * This column read "Compare / All comparisons / Typeform alternative …",
     * which is the site's own filing system showing through: "alternative" is
     * the word in the URL because it is the word people type into Google, and
     * "all comparisons" is a description of a directory. Nobody scans a footer
     * looking for a directory. They are looking for the one line that says
     * whether this beats the thing they already pay for.
     */
    title: "How we compare",
    links: [
      { href: "/typeform-alternative", label: "chatform vs Typeform" },
      { href: "/google-forms-alternative", label: "chatform vs Google Forms" },
      { href: "/jotform-alternative", label: "chatform vs Jotform" },
      { href: "/tally-alternative", label: "chatform vs Tally" },
      { href: "/compare", label: "See them side by side" },
    ],
  },
  {
    title: "Learn",
    links: [
      { href: "/use-cases", label: "Guides by use case" },
      { href: "/why-conversation-works", label: "Why conversation works" },
      { href: "/blog", label: "Writing" },
      { href: "/ai-info", label: "For AI assistants" },
    ],
  },
  {
    /*
     * Developer material, in one place, behind its own heading.
     *
     * It used to be mixed into a general "Resources" column beside the
     * research page and the blog, which put "Headless API" two lines under
     * something written for a salon owner. Most people arriving here are not
     * developers and have no idea what a headless API is; the ones who are
     * will find this column in a second because it is labelled with their
     * word. Separating them costs one column and stops the footer reading as
     * though the product is for engineers.
     */
    title: "Developers",
    links: [
      { href: "/docs", label: "Documentation" },
      { href: "/docs/quickstart", label: "Quickstart" },
      { href: "/docs/embed", label: "Embed on your site" },
      { href: "/docs/headless", label: "Headless API" },
      { href: "/docs/webhooks", label: "Webhooks" },
    ],
  },
  {
    title: "Account",
    links: [
      { href: "/signin", label: "Sign in" },
      { href: "/signin", label: "Create an account" },
      { href: "/dashboard", label: "Dashboard" },
    ],
  },
] as const;

export function MarketingFooter() {
  return (
    <footer className="border-border/60 border-t px-6 py-14">
      <div className="mx-auto grid max-w-6xl gap-10 sm:grid-cols-2 lg:grid-cols-[1.2fr_repeat(5,1fr)]">
        <div>
          <Logo />
          {/* The one place on the page that names the category outright. A
              footer under a logo is scanned, not read — it is where someone
              who scrolled the whole page without working out what this is
              finally finds out.

              The stack is not repeated here. This line used to end "hosted at
              the edge on Cloudflare Workers, D1 and Durable Objects", which is
              the same list the bar at the foot of this very footer already
              carries, four inches below. Said twice in one region, it stopped
              reading as proof and started reading as filler — and it was
              crowding out the only sentence on the page that says what the
              product is. */}
          <p className="text-body text-muted-foreground mt-3 max-w-xs">
            Forms that ask like a person. They read what someone writes, ask again when the
            answer is too thin to use, and answer questions back.
          </p>
          <div className="mt-4">
            <ThemeToggle />
          </div>
        </div>

        {COLUMNS.map((col) => (
          <div key={col.title}>
            <h3 className="text-micro font-semibold tracking-[0.12em] uppercase">{col.title}</h3>
            <ul className="mt-3 flex flex-col gap-2">
              {col.links.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-body text-muted-foreground hover:text-foreground transition-colors duration-[var(--duration-micro)]"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-border/60 text-micro text-muted-foreground mx-auto mt-12 flex max-w-6xl flex-col gap-2 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p>© {new Date().getFullYear()} chatform</p>
        {/*
          This said "Built on Cloudflare Workers · D1 · Durable Objects · R2".
          Four proper nouns, at the very bottom of the page, aimed at nobody
          who was still reading. The person who has scrolled a whole marketing
          site runs a salon or a studio or a small agency; they do not know
          what a Durable Object is and there is no version of this sentence
          that makes them want the product more. A developer who cares reads
          the docs, where it is written down properly.
        */}
        <p>Made with care, for people who have to ask other people things.</p>
      </div>
    </footer>
  );
}
