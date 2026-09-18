import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";

/**
 * Nothing behind the session guard belongs in a search index.
 *
 * `robots.ts` disallows most of these paths, but not `/templates`, which is
 * linked from every public template page's "Use this template" button — and a
 * crawler following it gets an app shell with the site's default title and no
 * content, a thin duplicate of the page it came from. The public version of
 * the catalogue is `/form-templates`; this says so to anything that looks.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
