import type { Metadata } from "next";
import { canonical, openGraphBase } from "@/lib/seo";

/**
 * `pricing/page.tsx` is a client component — it holds the billing-cycle toggle
 * and reads the seeded catalogue over the network — and a client component
 * cannot export `metadata`. So the page had none: every share of the pricing
 * URL, and every crawler, got the root layout's default title and the landing
 * page's description. This layout exists only to give the route its own.
 *
 * `page.tsx` is a server component again, so this could move back into it — but
 * there is nothing to gain from the move and one more diff to read, so the
 * metadata stays where people have learned to look for it.
 */
export const metadata: Metadata = {
  title: "Pricing",
  /**
   * Names the product before it prices it. Someone arriving here from search
   * lands on a number with no idea what it buys — this page is often the first
   * one a comparison shopper sees, not the second.
   */
  description:
    "Affordable pricing for chatform's AI chat forms. Unlimited forms and unlimited responses on every plan, including free. Compare limits, question types and features across Free, Pro and Business.",
  ...canonical("/pricing"),
  openGraph: {
    ...openGraphBase("/pricing"),
    title: "chatform pricing — collect for free, pay to look closer",
    description: "Unlimited forms and unlimited responses on every plan, including free.",
  },
  twitter: { card: "summary_large_image" },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
