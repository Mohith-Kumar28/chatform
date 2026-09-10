"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { useState } from "react";
import { UpgradeDialog } from "@/components/billing/upgrade-dialog";
import { PlansDialog } from "@/components/billing/plans-dialog";
import {
  CACHE_MAX_AGE,
  createCachePersister,
  shouldPersistQuery,
} from "@/lib/api/persist";

export function ApiProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            /**
             * Half an hour, against TanStack's five-minute default.
             *
             * `gcTime` is how long an *unmounted* query's data is kept, and
             * every builder tab is a route: leaving Results unmounts it. At
             * five minutes a return trip after a coffee re-ran the full
             * skeleton — not because the data had changed, but because nobody
             * was subscribed while you were away. Thirty minutes costs only the
             * memory of a few JSON payloads and turns almost every one of those
             * skeletons back into an instant render with a silent refetch
             * behind it. `staleTime` still decides when to go back to the
             * network; this only decides when to forget.
             */
            gcTime: 30 * 60_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  /**
   * Built once, like the client. `undefined` on the server and wherever
   * storage is unavailable — Safari in private mode has the API and throws on
   * write — in which case we fall back to the plain provider and behave
   * exactly as this file did before persistence existed.
   */
  const [persister] = useState(createCachePersister);

  /*
    The same tree either way, so the two branches below cannot drift.

    Mounted once, here, because this is the only provider that wraps every authenticated
    surface — dashboard and builder both. `mutator.ts` pushes any 402 into the paywall
    store, so a gate added to the API later gets its dialog with no work in the UI. It
    renders nothing until a denial arrives.

    `PlansDialog` is its sibling: the paywall answers a refusal, this answers "what does
    it cost". Mounted alongside it so any Upgrade control anywhere can raise the prices
    without a navigation. Renders nothing until opened.
  */
  const tree = (
    <>
      {children}
      <UpgradeDialog />
      <PlansDialog />
    </>
  );

  if (!persister) {
    return <QueryClientProvider client={client}>{tree}</QueryClientProvider>;
  }

  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={{
        persister,
        maxAge: CACHE_MAX_AGE,
        dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
      }}
    >
      {tree}
    </PersistQueryClientProvider>
  );
}
