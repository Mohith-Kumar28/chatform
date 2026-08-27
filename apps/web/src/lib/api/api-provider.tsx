"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { UpgradeDialog } from "@/components/billing/upgrade-dialog";

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
    </QueryClientProvider>
  );
}
