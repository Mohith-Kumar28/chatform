import type { Metadata } from "next";

/**
 * `pricing/page.tsx` is a client component — it holds the billing-cycle toggle
 * and reads the seeded catalogue over the network — and a client component
 * cannot export `metadata`. So the page had none: every share of the pricing
 * URL, and every crawler, got the root layout's default title and the landing
 * page's description. This layout exists only to give the route its own.
 */
export const metadata: Metadata = {
  title: "Pricing",
  /**
   * Names the product before it prices it. Someone arriving here from search
   * lands on a number with no idea what it buys — this page is often the first
   * one a comparison shopper sees, not the second.
   */
  description:
    "Pricing for chatform's AI chat forms. Unlimited forms and unlimited responses on every plan, including free. Compare limits, question types and features across Free, Pro and Business.",
  openGraph: {
    title: "chatform pricing — collect for free, pay to look closer",
    description:
      "Unlimited forms and unlimited responses on every plan, including free.",
    type: "website",
  },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
