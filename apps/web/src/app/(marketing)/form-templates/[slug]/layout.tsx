import { ApiProvider } from "@/lib/api/api-provider";

/**
 * `TemplatePanes` calls `useQueryClient` to invalidate the form list after
 * "Use this template", so this one marketing subtree needs a query client.
 *
 * Scoped to the route rather than the `(marketing)` group on purpose: the
 * landing page and every other marketing page must stay free of it. Not
 * `AppProviders` — nothing here touches better-auth, and pulling it in would
 * put the auth bundle back on a public page.
 */
export default function TemplateDetailLayout({ children }: { children: React.ReactNode }) {
  return <ApiProvider>{children}</ApiProvider>;
}
