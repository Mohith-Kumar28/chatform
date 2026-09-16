"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { findStoredSession, storedEmbedQuery } from "@/components/chat/session-store";
import { API_ORIGIN } from "@/lib/api/mutator";

/**
 * Where a gateway that takes the whole window (Stripe Checkout) sends the
 * respondent back to.
 *
 *   /pay/return?cf_pay=<recordId>&slug=<form slug>[&session=<sessionId>][&cancelled=1]
 *
 * It arrives in one of two situations, and the only thing that tells them
 * apart is whether this browser can find the conversation:
 *
 *   - The form was open in this tab and checkout took it over. The session is
 *     in storage under the form's slug. We nudge the server to check the
 *     payment and go straight back to the form, which resumes where it was and
 *     moves on once `payment_settled` arrives.
 *   - Checkout was opened in a new tab, because the form is embedded in
 *     someone else's page or is the builder's preview. That form keeps its
 *     storage partitioned under the host page, so this tab finds nothing, and
 *     it does not need to: the form that opened the tab is already checking on
 *     the payment itself. This tab only has to say so.
 *
 * Nothing here decides whether the payment happened. The token is never in
 * the URL (the address a gateway redirects to ends up in its logs and in
 * browser history), so it can only come from storage. Without it, this page
 * cannot even ask.
 */
type View =
  | { kind: "working" }
  | { kind: "back"; href: string; paid: boolean }
  | { kind: "elsewhere" }
  | { kind: "incomplete" };

export function PayReturn() {
  const params = useSearchParams();
  const recordId = params.get("cf_pay");
  const slug = params.get("slug");
  const sessionHint = params.get("session");
  const cancelled = params.get("cancelled") === "1";

  const [view, setView] = useState<View>({ kind: "working" });

  useEffect(() => {
    let live = true;
    void (async () => {
      if (!recordId || !slug) {
        if (live) setView({ kind: "incomplete" });
        return;
      }
      const stored = findStoredSession(slug);
      // A session hint that names a different conversation means the one in
      // storage is not the one that paid, and its token would be refused.
      const ours = stored && (!sessionHint || stored.sessionId === sessionHint) ? stored : null;
      if (!ours) {
        if (live) setView({ kind: "elsewhere" });
        return;
      }

      let paid = false;
      if (!cancelled) {
        try {
          const res = await fetch(
            `${API_ORIGIN}/p/sessions/${ours.sessionId}/payments/${encodeURIComponent(recordId)}/confirm`,
            {
              method: "POST",
              headers: { "x-respondent-token": ours.token },
              signal: AbortSignal.timeout(15000),
            },
          );
          const body = res.ok ? ((await res.json().catch(() => null)) as { status?: string } | null) : null;
          paid = body?.status === "paid";
        } catch {
          // The form asks again when it loads (`cf_pay`), and the webhook does
          // not depend on either.
        }
      }
      if (!live) return;

      // `cf_pay` rides along so the form nudges once more when its stream is
      // up, which covers a confirm that raced the gateway here. A cancel says so
      // instead: the session still holds that checkout open, and without being
      // told the form would sit on "Waiting for payment confirmation…".
      //
      // And with whatever this form was opened with. A gateway that redirected the *iframe* of
      // an embedded form lands here inside that frame, and sending it on to a bare `/f/<slug>`
      // would bring the form back without `embed=1` or `parentOrigin` — standalone chrome in
      // somebody's panel, and a host page that never hears another word from it.
      const embed = storedEmbedQuery(slug);
      const href = `/f/${encodeURIComponent(slug)}?${cancelled ? "cf_pay_cancelled" : "cf_pay"}=${encodeURIComponent(recordId)}${embed ? `&${embed}` : ""}`;
      setView({ kind: "back", href, paid });
      // `replace`, so Back from the form does not land here and confirm again.
      window.location.replace(href);
    })();
    return () => {
      live = false;
    };
  }, [recordId, slug, sessionHint, cancelled]);

  if (view.kind === "working") {
    return (
      <Shell title={cancelled ? "Payment cancelled" : "Checking your payment"} description="One moment.">
        <div className="flex justify-center">
          <Spinner className="size-5 opacity-60" />
        </div>
      </Shell>
    );
  }

  if (view.kind === "back") {
    return (
      <Shell
        title={view.paid ? "Payment received" : cancelled ? "Payment cancelled" : "Payment submitted"}
        description={
          view.paid || cancelled
            ? "Taking you back to the form…"
            : "Taking you back to the form. It moves on once the payment is confirmed."
        }
      >
        <Button asChild variant="outline" className="w-full rounded-full">
          <a href={view.href}>Back to the form</a>
        </Button>
      </Shell>
    );
  }

  if (view.kind === "incomplete") {
    return (
      <Shell
        title="This link is incomplete"
        description="Go back to the form you were filling in. If you paid, it will show there once the payment is confirmed."
      />
    );
  }

  return cancelled ? (
    /*
     * The form is in another tab (an embed, or the builder's preview), and its storage is
     * partitioned away from this one — so this tab cannot tell it anything, and it is still
     * showing "Waiting for payment confirmation…" for the checkout just backed out of. Say what
     * to tap there, rather than "try again" at a card that has no Pay button on it.
     */
    <Shell
      title="Payment cancelled"
      description="Nothing was charged. Close this tab, go back to the form and tap Cancel on the payment card to try again."
    />
  ) : (
    <Shell
      title="Payment received"
      description="You can close this tab and return to the form. It will move on by itself once the payment is confirmed."
    />
  );
}

function Shell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <main className="flex min-h-svh items-center justify-center px-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="font-display text-2xl">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        {children ? <CardContent>{children}</CardContent> : null}
      </Card>
    </main>
  );
}
