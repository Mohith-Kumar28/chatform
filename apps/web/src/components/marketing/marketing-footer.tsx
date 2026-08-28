import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";

/**
 * Every link here resolves. Nothing is listed that does not exist yet — no
 * blog, no careers page, no changelog, because none of those are built.
 */
const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/#the-moment", label: "How it answers back" },
      { href: "/#product", label: "How it works" },
      { href: "/pricing#question-types", label: "Question types" },
      { href: "/pricing#compare", label: "Compare" },
      { href: "/pricing", label: "Pricing" },
    ],
  },
  {
    title: "Developers",
    links: [
      { href: "/#developers", label: "Headless API" },
      { href: "/#developers", label: "Embed" },
      { href: "/#developers", label: "Webhooks" },
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
      <div className="mx-auto grid max-w-6xl gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Logo />
          <p className="text-body text-muted-foreground mt-3 max-w-xs">
            Forms answered as a conversation, hosted at the edge on Cloudflare Workers, D1 and
            Durable Objects.
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
        <p>Built on Cloudflare Workers · D1 · Durable Objects · R2</p>
      </div>
    </footer>
  );
}
