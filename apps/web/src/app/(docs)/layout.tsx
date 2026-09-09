import type { ReactNode } from "react";
import Link from "next/link";
import { RootProvider } from "fumadocs-ui/provider/next";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { source } from "@/lib/source";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { MarketingFooter } from "@/components/marketing/marketing-footer";

/**
 * The documentation shell.
 *
 * Its own route group rather than nested inside `(marketing)`: that layout wraps
 * its children in a flex column that owns the viewport, and `DocsLayout` needs
 * to own it instead — sticky sidebar, its own scroll container.
 *
 * There is no top bar on desktop, and that is the point. There used to be one:
 * a custom `nav.component`, carrying the marketing links, the wordmark, the
 * theme control and the CTA. Two things were wrong with it. The links sent a
 * reader who has already chosen this API back to the sales site, above the
 * reference they came for — and the marketing footer under every docs page
 * already reaches those. And once they were gone, what was left was two
 * controls floating in an empty band: `nav.component` returns a bare node in
 * place of Fumadocs' own `<header>`, so it had no height, no border and no
 * sticky offset, and `--fd-header-height` stayed `0px`.
 *
 * So the chrome moved into the sidebar, which is the thing that persists while
 * a reader moves between pages. Brand at the top, theme beside the collapse
 * trigger, the key at the foot. The content column now starts at the top of
 * the viewport with nothing above it.
 *
 * Dropping `nav.component` also restores Fumadocs' own header below `md`,
 * which is where the sidebar drawer's trigger lives — the custom bar drew no
 * trigger, so the docs nav had no opener on a phone.
 */
export default function DocsRootLayout({ children }: { children: ReactNode }) {
  return (
    <RootProvider
      /**
       * `theme.enabled: false` is load-bearing. RootProvider mounts its own
       * next-themes provider by default, and the app already has one in the root
       * layout — two providers writing the same class on <html> from two pieces
       * of state means the header's theme toggle and the docs one disagree the
       * moment either is used. One provider, one toggle: the app's.
       */
      theme={{ enabled: false }}
      /**
       * Static search: the index is a prerendered asset the browser downloads,
       * rather than an Orama index rebuilt inside the worker on every cold start
       * and carried in its bundle.
       */
      search={{ options: { type: "static" } }}
    >
      <DocsLayout
        tree={source.pageTree}
        nav={{
          /**
           * The mark and the wordmark, at the top of the sidebar, where a docs
           * site says whose docs these are. `url: "/"` because the mark is the
           * way back to the product, not a link to the page you are already on.
           */
          url: "/",
          title: (
            <>
              <Logo />
              <span className="text-fd-muted-foreground text-caption font-normal">
                docs
              </span>
            </>
          ),
          /**
           * Rendered into the sidebar's top row between the title and the
           * collapse trigger — and, below `md`, into Fumadocs' own header. One
           * toggle, reachable at both sizes, without a bar of its own.
           */
          children: <ThemeToggle className="mb-auto" />,
        }}
        sidebar={{
          tabs: false,
          collapsible: true,
          /**
           * The one piece of chrome a reader of these pages actually wants, at
           * the end of the nav rather than above the prose: the key that makes
           * the examples run.
           */
          footer: (
            <>
              {/*
                The nav list scrolls under the footer, so without a rule the
                last item visible is a half-clipped word sitting on the button.
                Desktop only: the drawer's own footer already has `border-t`.
              */}
              <div className="bg-border -mx-4 mb-3 h-px max-md:hidden" />
              <Link
                href="/signin"
                className="bg-primary text-on-primary text-caption flex items-center justify-center rounded-full px-4 py-2 font-medium"
              >
                Get an API key
              </Link>
            </>
          ),
        }}
        /**
         * Fumadocs draws its theme switch in a row at the foot of the sidebar
         * that it shares with `links` of type `icon`. We pass no icon links, so
         * that row rendered as a full-width bordered box holding nothing but a
         * sun and a moon pinned to its right edge — a control with no visible
         * subject. `nav.children` above carries the app's own toggle instead.
         */
        themeSwitch={{ enabled: false }}
      >
        {children}
      </DocsLayout>
      <MarketingFooter />
    </RootProvider>
  );
}
