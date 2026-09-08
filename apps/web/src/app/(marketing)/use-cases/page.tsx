import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Band, BandTitle, BandLede } from "@/components/marketing/band";
import { CtaBand } from "@/components/marketing/cta-band";
import { JsonLd } from "@/components/seo/json-ld";
import { USE_CASES, USE_CASE_GROUPS } from "@/content/use-cases";
import { breadcrumbLd, canonical, itemListLd, openGraphBase } from "@/lib/seo";

const TITLE = "What people use chatform for";
const DESCRIPTION =
  "Step-by-step guides for the things people actually build: taking bookings, chasing testimonials, screening leads, running an event, collecting feedback. Each one has a prompt you can paste in.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  ...canonical("/use-cases"),
  openGraph: { ...openGraphBase("/use-cases"), title: TITLE, description: DESCRIPTION },
  twitter: { card: "summary_large_image" },
};

export default function UseCasesPage() {
  return (
    <>
      <JsonLd
        nodes={[
          breadcrumbLd([
            { name: "chatform", path: "/" },
            { name: "Use cases", path: "/use-cases" },
          ]),
          itemListLd(USE_CASES.map((entry) => ({ name: entry.name, path: entry.path }))),
        ]}
      />

      <Band size="tall">
        <div className="max-w-3xl">
          <BandTitle as="h1">Pick the thing you need to ask people.</BandTitle>
          <BandLede className="max-w-2xl">
            Every guide below is the whole job, start to finish, with a prompt you can paste in.
          </BandLede>
        </div>

        <div className="mt-16 flex flex-col gap-14">
          {USE_CASE_GROUPS.map((group) => (
            <section key={group.title}>
              <h2 className="text-h1 font-display border-border/60 border-b pb-3 font-bold">
                {group.title}
              </h2>
              <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {group.items.map((item) => (
                  <li key={item.slug}>
                    <Link
                      href={item.path}
                      className="border-border/70 bg-card group flex h-full flex-col rounded-xl border p-5 shadow-xs transition-[box-shadow,transform] duration-[var(--duration-standard)] ease-[var(--ease-out)] hover:-translate-y-0.5 hover:shadow-md motion-reduce:hover:translate-y-0"
                    >
                      <h3 className="text-h2 font-display font-bold">{item.name}</h3>
                      <p className="text-body text-muted-foreground mt-1.5 flex-1 leading-relaxed">
                        {item.navBlurb}
                      </p>
                      <span className="text-micro text-muted-foreground mt-4">{item.audience}</span>
                      <span className="text-caption text-primary mt-3 inline-flex items-center gap-1.5 font-medium">
                        Read the guide
                        <ArrowRight className="size-4 transition-transform duration-[var(--duration-micro)] group-hover:translate-x-0.5 motion-reduce:group-hover:translate-x-0" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </Band>

      <CtaBand />
    </>
  );
}
