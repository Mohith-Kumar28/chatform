import type { ReactNode } from "react";
import { RootProvider } from "fumadocs-ui/provider/next";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { source } from "@/lib/source";
import { DocsNav } from "@/components/docs/docs-nav";
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
        nav={{ component: <DocsNav /> }}
        sidebar={{ tabs: false, collapsible: true }}
      >
        {children}
      </DocsLayout>
      <MarketingFooter />
    </RootProvider>
  );
}
