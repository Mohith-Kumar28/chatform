import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { ApiProvider } from "@/lib/api/api-provider";
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
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_ORIGIN ?? "https://chatform.in"),
  title: { default: "chatform — forms that talk back", template: "%s · chatform" },
  description:
    "Agentic chatbot forms. Your form is an AI interviewer that asks, answers questions back, and gets to the goal.",
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
      className={`${inter.variable} ${bricolage.variable} ${jetbrains.variable}`}
    >
      <body className="min-h-svh font-sans">
        <ThemeProvider>
          <ApiProvider>{children}</ApiProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
