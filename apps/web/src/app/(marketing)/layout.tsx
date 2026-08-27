import { MarketingNav } from "@/components/marketing/marketing-nav";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingMotionConfig } from "@/components/marketing/motion-config";

/**
 * The marketing shell DESIGN.md 1.3 specified and the app never got: one nav,
 * one footer, shared by `/` and `/pricing`. Before this, `/` hand-rolled its
 * own nav and `/pricing` had no chrome at all.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <MarketingMotionConfig>
      <div className="flex min-h-svh flex-col">
        <MarketingNav />
        <main className="flex-1">{children}</main>
        <MarketingFooter />
      </div>
    </MarketingMotionConfig>
  );
}
