"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { UpgradeDialog } from "@/components/billing/upgrade-dialog";
import { PlansDialog } from "@/components/billing/plans-dialog";

export function ApiProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      {children}
      {/*
        Mounted once, here, because this is the only provider that wraps every authenticated
        surface — dashboard and builder both. `mutator.ts` pushes any 402 into the paywall
        store, so a gate added to the API later gets its dialog with no work in the UI. It
        renders nothing until a denial arrives.
      */}
      <UpgradeDialog />
      {/* Its sibling: the paywall answers a refusal, this answers "what does it cost".
          Mounted alongside it so any Upgrade control anywhere can raise the prices
          without a navigation. Renders nothing until opened. */}
      <PlansDialog />
    </QueryClientProvider>
  );
}
