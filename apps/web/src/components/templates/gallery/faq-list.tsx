import { ChevronDown } from "lucide-react";

/**
 * Questions and answers as native disclosures.
 *
 * `<details>` rather than an accordion component: the answers stay in the
 * server-rendered HTML, so they are readable without JavaScript and by a
 * crawler, which is what the `FAQPage` data beside them claims.
 */
export function FaqList({ faqs }: { faqs: readonly { q: string; a: string }[] }) {
  return (
    <div className="divide-border/70 border-border/70 divide-y border-y">
      {faqs.map((f) => (
        <details key={f.q} className="group py-4">
          <summary className="text-body flex cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
            {f.q}
            <ChevronDown className="text-muted-foreground size-4 shrink-0 transition-transform duration-[var(--duration-micro)] group-open:rotate-180 motion-reduce:transition-none" />
          </summary>
          <p className="text-muted-foreground text-body mt-2 max-w-3xl leading-relaxed">{f.a}</p>
        </details>
      ))}
    </div>
  );
}
