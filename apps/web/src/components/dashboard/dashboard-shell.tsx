"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "@/lib/auth/auth-client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AppNav } from "./app-nav";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!isPending && !session) router.replace("/signin");
  }, [isPending, session, router]);

  if (isPending) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 px-6 py-10">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (!session) return null;

  return (
    <div className="min-h-svh">
      <header data-tour="nav" className="bg-sidebar flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="bg-primary flex size-7 items-center justify-center rounded-lg text-sm font-bold text-white">
            c
          </span>
          <span className="font-display font-semibold">chatform</span>
          <div className="ml-4"><AppNav /></div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground text-sm">{session.user.email}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await signOut();
              window.location.assign("/signin");
            }}
          >
            Sign out
          </Button>
        </div>
      </header>
      {children}
    </div>
  );
}
