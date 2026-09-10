import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Caveat, Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { ApiProvider } from "@/lib/api/api-provider";
import { AuthUIProvider } from "@/components/auth/auth-ui-provider";
import { JsonLd } from "@/components/seo/json-ld";
import { SITE_ORIGIN, organizationLd, webSiteLd } from "@/lib/seo";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  display: "swap",
  weight: ["500", "600", "700"],
});
/**
 * The margin hand.
 *
 * Marketing only, and deliberately a real handwriting face rather than an
 * italic of the display font: the point of an annotation is that it reads as
 * something a person added AFTER the page was set, and a slanted Bricolage
 * still reads as the page talking to itself. Two weights, no more — this
 * writes six short notes on one page and nothing else in the product.
 */
const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin"],
  display: "swap",
  weight: ["500", "700"],
});
const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  /**
   * Without this, Next resolves `opengraph-image` and every other relative
   * metadata URL against `http://localhost:3000` — and it does it silently, at
   * build time, so production shipped `<meta property="og:image"
   * content="http://localhost:3000/opengraph-image-…">`. The card itself
   * rendered correctly at its real URL the whole time; nothing that unfurled a
   * chatform.in link could reach it.
   *
   * Same env var and same default as `sitemap.ts`, which already had to solve
   * this for absolute URLs.
   */
  metadataBase: new URL(SITE_ORIGIN),
  /**
   * Two vocabularies, doing two different jobs.
   *
   * The page headlines make the claim only we can make — "the first form that
   * answers back" — and that is the right thing to say to someone who has
   * already stopped and is reading. It is the wrong thing to say in a `title`,
   * which is a browser tab, a Google result and a Slack unfurl: places people
   * *scan*, where the reader has not yet decided what kind of product this is
   * and will not work it out from a metaphor. Worse, "forms that talk back"
   * has a second reading in English — talking back is what an insolent child
   * does — and that was the string in every tab on the site.
   *
   * The words here are deliberately the plainest available. "Agentic forms
   * that interview for you" was the previous attempt and it failed the only
   * test a title has to pass: a stranger, one second in, knowing what this is.
   * Nobody searches for an interviewer. Everybody knows what a form is and
   * what a chat is, so the title is built from those two and nothing else. The
   * clever version reads better and communicates less, and this is a scan
   * position, where communicating is the entire job.
   */
  title: {
    default: "chatform — AI chat forms",
    template: "%s · chatform",
  },
  description:
    "Long forms lose people. chatform turns yours into a conversation that reads what people write, follows up when an answer is too thin to use, and answers their questions too — so more of them finish.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf7f2" },
    { media: "(prefers-color-scheme: dark)", color: "#211f1d" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning is required: next-themes writes the class on the
    // html element before React hydrates, so server and client markup differ.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${bricolage.variable} ${caveat.variable} ${jetbrains.variable}`}
    >
      <head>
        {/*
          A shim for a name the bundler leaves behind in somebody else's script.
          
          `next-themes` builds its blocking theme script by serialising one of
          its own functions, and the Cloudflare build runs that function through
          esbuild with `keepNames`, which instruments it with `__name(fn, "fn")`
          calls. The instrumentation travels into the serialised string, so the
          browser gets a script that calls a helper only the server bundle has.
          It threw `__name is not defined` on the first line of every
          dynamically rendered page — the respondent form page most of all —
          and everything after it, which is the part that actually applies the
          theme, never ran. Statically prerendered pages were fine, because
          their script was serialised at build time by plain Node.
          
          Defined here rather than fixed at the bundler: it is three tokens, it
          runs before any script `next-themes` injects into the body, and it
          neutralises the whole class rather than the one instance. `||=` so a
          real `__name` is never overwritten.
        */}
        <script dangerouslySetInnerHTML={{ __html: "window.__name||=function(f){return f}" }} />
      </head>
      <body className="min-h-svh font-sans">
        {/*
          Who this is, once, for the whole site.

          It sits in the root layout rather than on the landing page because
          every other JSON-LD block on the site references the organisation by
          `@id` — the FAQ on /pricing, the Article on a blog post, the
          comparison pages — and a reference to an `@id` that is not present
          on the same page is a dangling pointer. Emitting it everywhere is a
          few hundred bytes and removes the whole class of problem.
        */}
        <JsonLd nodes={[organizationLd(), webSiteLd()]} />
        <ThemeProvider>
          {/*
            Inside ApiProvider on purpose: Better Auth UI reads and writes
            through TanStack Query, so it needs the client that already lives
            there rather than a second one with its own cache of the session.
          */}
          <ApiProvider>
            <AuthUIProvider>{children}</AuthUIProvider>
          </ApiProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
