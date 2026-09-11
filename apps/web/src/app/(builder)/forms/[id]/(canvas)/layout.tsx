import { SmallScreenGate } from "@/components/builder/small-screen-gate";

/**
 * The editing canvas: Build, Flow and the old Design route.
 *
 * A route group so the width floor applies here and nowhere else. Results,
 * Share, Integrate and Settings are single-column pages that work on a phone;
 * these three put a list, a preview and an inspector side by side and do not.
 */
export default function CanvasLayout({ children }: { children: React.ReactNode }) {
  return <SmallScreenGate>{children}</SmallScreenGate>;
}
