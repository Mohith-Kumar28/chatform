import type { ReactNode } from "react";
import { RootProvider } from "fumadocs-ui/provider/next";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { source } from "@/lib/source";
import { DocsNav } from "@/components/docs/docs-nav";
import { Logo } from "@/components/brand/logo";
import { MarketingFooter } from "@/components/marketing/marketing-footer";

/**
 * The documentation shell.
 *
 * Its own route group rather than nested inside `(marketing)`: that layout wraps
 * its children in a flex column that owns the viewport, and `DocsLayout` needs
 * to own it instead — sticky sidebar, its own scroll container. Nav parity comes
 * from sharing the link list, not from sharing a layout.
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
           * site says whose docs these are. `component` replaces the header
           * bar, so this is the only place the brand appears on wide screens —
           * and it is the right one: the sidebar is the thing that persists
           * while a reader moves between pages.
           *
           * `url: "/"` because the mark is the way back to the product, not a
           * link to the page you are already on.
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
          component: <DocsNav />,
        }}
        sidebar={{ tabs: false, collapsible: true }}
        /**
         * Fumadocs puts its theme switch in a row at the foot of the sidebar
         * that it shares with `links` of type `icon`. We pass no icon links, so
         * that row rendered as a full-width bordered box holding nothing but a
         * sun and a moon pinned to its right edge — a control with no visible
         * subject. `DocsNav` already draws the app's own toggle, so this is one
         * duplicate removed and one piece of stray furniture with it.
         */
        themeSwitch={{ enabled: false }}
      >
        {children}
      </DocsLayout>
      <MarketingFooter />
    </RootProvider>
  );
}
