import { PricingPageClient } from "@/components/marketing/pricing-page-client";
import { JsonLd } from "@/components/seo/json-ld";
import { FAQ_ITEMS } from "@/components/marketing/faq";
import { buildCatalogue, dollars } from "@/lib/pricing-catalogue";
import { breadcrumbLd, faqPageLd, softwareApplicationLd } from "@/lib/seo";

/**
 * The server half of `/pricing`.
 *
 * Everything on this page used to wait on a client fetch, which meant the one
 * page people arrive at from a pricing search prerendered as a heading and a
 * shimmer. The catalogue is now built on the server from `@repo/entitlements`
 * and handed to the client component, which still fetches the seeded copy and
 * still owns the yearly/monthly toggle — it just no longer owns whether the
 * page has any content in it.
 *
 * The metadata lives in the sibling `layout.tsx`, which is where it had to go
 * when this file was a client component. It stays there: moving it now would
 * change nothing except which file people have to look in.
 */
export default function PricingPage() {
  const catalogue = buildCatalogue();

  return (
    <>
      <JsonLd
        nodes={[
          softwareApplicationLd(
            catalogue.plans.map((plan) => ({
              name: plan.name,
              /* The monthly price is the honest headline number: the annual
                 figure on the card is a per-month equivalent of a yearly
                 charge, and an `Offer` that prints it without the term reads
                 as a cheaper monthly plan than the one on sale. */
              price: dollars(plan.priceMonthlyCents),
              billingDuration: "P1M",
              url: "/pricing",
            })),
          ),
          faqPageLd(FAQ_ITEMS),
          breadcrumbLd([
            { name: "chatform", path: "/" },
            { name: "Pricing", path: "/pricing" },
          ]),
        ]}
      />
      <PricingPageClient initial={catalogue} />
    </>
  );
}
