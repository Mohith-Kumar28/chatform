import { ApiProvider } from "@/lib/api/api-provider";
import { AuthUIProvider } from "@/components/auth/auth-ui-provider";

/**
 * The signed-in half of the app: a query client, its persistence, the billing
 * dialogs, and Better Auth UI.
 *
 * This used to sit in the root layout, which meant every anonymous visitor to
 * the marketing site downloaded TanStack Query, its persist adapter,
 * better-auth and better-auth-ui — about 220 KB over the wire — and paid two
 * cross-origin round-trips to the API for a session they do not have. The
 * landing page's LCP was 11.1s, most of it waiting on that hydration.
 *
 * So it moved down here, and each route group that actually needs it says so.
 * `(marketing)`, `(docs)`, `/f` (the respondent runtime) and `/card-preview`
 * deliberately do NOT mount this — adding it back to any of them puts the
 * whole app shell on a public page again. `/f` in particular is the highest
 * traffic route on the site and reaches the paywall store only through
 * `mutator.ts`'s 402 handler, which is a module-level zustand store and needs
 * no provider.
 *
 * Not a client component itself: both children already are, and composing them
 * from the server keeps this file out of the bundle.
 */
export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ApiProvider>
      {/*
        Inside ApiProvider on purpose: Better Auth UI reads and writes through
        TanStack Query, so it needs the client that already lives there rather
        than a second one with its own cache of the session.
      */}
      <AuthUIProvider>{children}</AuthUIProvider>
    </ApiProvider>
  );
}
