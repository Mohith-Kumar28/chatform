"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { AppMark } from "./app-mark";
import { authClient, signOut } from "@/lib/auth/auth-client";
import { daysUntilPurge, purgeDate } from "@/lib/account-deletion";

/**
 * What someone sees after signing in to an account they deleted. Nothing else
 * opens until they choose: recover it as it was, or sign out and let the
 * thirty days run out.
 */
export function AccountPendingDeletion({ deletedAt, email }: { deletedAt: number; email: string }) {
  const [busy, setBusy] = useState<"recover" | "signout" | null>(null);
  const days = daysUntilPurge(deletedAt);

  const recover = async () => {
    setBusy("recover");
    const { error } = await authClient.$fetch("/account/restore", { method: "POST", body: {} });
    if (error) {
      setBusy(null);
      toast.error("Couldn't recover your account", { description: error.message });
      return;
    }
    // A full load, so the session and every cache start from the recovered account.
    window.location.replace("/dashboard");
  };

  const leave = async () => {
    setBusy("signout");
    await signOut().catch(() => undefined);
    window.location.replace("/signin");
  };

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 px-4 text-center">
      <AppMark />
      <div className="max-w-md space-y-2">
        <h1 className="font-display text-2xl font-semibold">You deleted this account</h1>
        <p className="text-muted-foreground text-body">
          {email} and all its data will be erased on{" "}
          <span className="text-foreground font-medium">{purgeDate(deletedAt)}</span>, {days}{" "}
          {days === 1 ? "day" : "days"} from now. Recover it to keep everything as it was.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button shape="pill" onClick={recover} disabled={busy !== null}>
          {busy === "recover" && <Spinner />}
          Recover my account
        </Button>
        <Button shape="pill" variant="ghost" onClick={leave} disabled={busy !== null}>
          {busy === "signout" && <Spinner />}
          Keep it deleted and sign out
        </Button>
      </div>
    </main>
  );
}
