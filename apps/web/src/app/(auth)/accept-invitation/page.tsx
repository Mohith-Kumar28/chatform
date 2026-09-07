"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { authClient, useSession, API_ORIGIN } from "@/lib/auth/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Where an invitation email lands.
 *
 * Better Auth stores invitations but builds no URL for them and serves no page —
 * delivery and acceptance are both the application's job. This is the second
 * half of that; `lib/auth.ts` sends the link.
 *
 * The page used to ask Better Auth's own `getInvitation`, which needs a session
 * whose email is already the invitee's. That is the one thing nobody arriving
 * here reliably has, and every other case — signed out, signed in as the person
 * who *sent* the invite, no account at all — came back as a single opaque error
 * that this page rendered as "This invitation is no longer valid". A live
 * invitation, sitting in the sender's dashboard marked pending, read as dead.
 *
 * So the copy now comes from `/api/invitation-preview`, which needs no session
 * and says which of those cases it is. Four sentences, each about a different
 * problem:
 *
 *   not pending        revoked, already used, or genuinely past its date — and
 *                      the three are not the same sentence.
 *   no session         name the workspace and the address it was sent to, then
 *                      hand that address to sign-in so nobody retypes it or
 *                      creates an account under the wrong one.
 *   wrong account      somebody with two addresses, signed in as the other one.
 *                      Naming both is the whole fix; without it it reads as a
 *                      broken link. Signing out is one button.
 *   right account      one button.
 *
 * Accepting is still Better Auth's `acceptInvitation`, which still demands the
 * matching signed-in address. Nothing here is a security decision.
 */
type InvitationState = "pending" | "expired" | "accepted" | "rejected" | "canceled" | "not_found";

interface InvitationPreview {
  state: InvitationState;
  email: string | null;
  role: string | null;
  organizationName: string | null;
  inviterName: string | null;
  inviterEmail: string | null;
  expiresAt: number | null;
  recipientHasAccount: boolean;
}

const ROLE_LABELS: Record<string, string> = {
  owner: "an owner",
  admin: "an admin",
  editor: "an editor",
  viewer: "a viewer",
  member: "a member",
};

/** The dead ends, each with its own reason. "Ask for another" is only useful advice on some of them. */
const DEAD_END: Record<Exclude<InvitationState, "pending">, { title: string; description: string }> = {
  expired: {
    title: "This invitation has expired",
    description: "Invitations are only good for a few days. Ask whoever invited you to send a new one.",
  },
  accepted: {
    title: "This invitation was already used",
    description: "Somebody has already joined with this link. Sign in to reach the workspace.",
  },
  rejected: {
    title: "This invitation was declined",
    description: "Ask whoever invited you to send a new one if that was a mistake.",
  },
  canceled: {
    title: "This invitation was revoked",
    description: "Whoever invited you has since withdrawn it.",
  },
  not_found: {
    title: "We can't find this invitation",
    description: "The link may be incomplete. Copy it from the email again, or ask for a new invite.",
  },
};

function AcceptInvitation() {
  const params = useSearchParams();
  const id = params.get("id");
  const { data: session, isPending: sessionPending } = useSession();

  /**
   * One state, not three.
   *
   * `null` means the fetch has not settled, so "still loading" is derived below
   * rather than stored — a separate `loading` flag would have to be lowered
   * from inside the effect on the paths that never fetch, and setting state
   * synchronously in an effect body is a cascading render React now warns about.
   */
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    if (!id) return;
    let live = true;
    fetch(`${API_ORIGIN}/api/invitation-preview?id=${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? (r.json() as Promise<InvitationPreview>) : null))
      .then((data) => {
        if (!live) return;
        // An unreachable API is not the same thing as a dead invitation, but it
        // is the same dead end for the reader, and `not_found` is the honest
        // half of it: we could not find this invitation.
        setPreview(data ?? { ...EMPTY, state: "not_found" });
      })
      .catch(() => {
        if (live) setPreview({ ...EMPTY, state: "not_found" });
      });
    return () => {
      live = false;
    };
  }, [id]);

  /** Where sign-in should come back to, with the address already filled in. */
  const signInHref = useCallback(
    (email: string | null, mode?: "signup") => {
      const next = encodeURIComponent(`/accept-invitation?id=${id}`);
      const withEmail = email ? `&email=${encodeURIComponent(email)}` : "";
      const withMode = mode ? `&mode=${mode}` : "";
      return `/signin?next=${next}${withEmail}${withMode}`;
    },
    [id],
  );

  const accept = async () => {
    if (!id) return;
    setAccepting(true);
    setAcceptError(null);
    try {
      const res = await authClient.organization.acceptInvitation({ invitationId: id });
      if (res.error) throw new Error(res.error.message ?? "Could not accept this invitation.");
      // A full navigation: accepting changes the active organization on the
      // session, and a client transition would render the dashboard against the
      // workspace they were in a moment ago.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/dashboard");
    } catch (err) {
      setAcceptError(err instanceof Error ? err.message : "Could not accept this invitation.");
      setAccepting(false);
    }
  };

  /**
   * Sign out, then straight back here through sign-in.
   *
   * A full navigation for the same reason accepting is one — and it is the
   * whole of the fix for the wrong-account case, which otherwise asks somebody
   * to find the sign-out control in a dashboard they were not trying to reach.
   */
  const switchAccount = async (email: string | null) => {
    setSwitching(true);
    try {
      await authClient.signOut();
    } catch {
      // Signing out failed server-side; sign-in will still let them switch.
    }
    window.location.assign(signInHref(email));
  };

  if (!id) {
    return (
      <Shell title="Invitation not found" description="That link is missing its invitation.">
        <Button asChild variant="outline" className="w-full rounded-full">
          <Link href="/dashboard">Go to dashboard</Link>
        </Button>
      </Shell>
    );
  }

  if (sessionPending || preview === null) {
    return (
      <Shell title="Invitation" description="One moment.">
        <div className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-10 w-full rounded-full" />
        </div>
      </Shell>
    );
  }

  if (preview.state !== "pending") {
    const { title, description } = DEAD_END[preview.state];
    return (
      <Shell title={title} description={description}>
        <Button asChild variant="outline" className="w-full rounded-full">
          <Link href={session ? "/dashboard" : signInHref(preview.email)}>
            {session ? "Go to dashboard" : "Sign in"}
          </Link>
        </Button>
      </Shell>
    );
  }

  const org = preview.organizationName ?? "a workspace";
  const roleLabel = preview.role ? (ROLE_LABELS[preview.role] ?? preview.role) : "a teammate";
  const who = preview.inviterName?.trim() || preview.inviterEmail?.trim() || "Someone";

  // Nobody signed in. The address is known, so the account they need is named
  // rather than guessed at, and sign-in is handed it.
  if (!session) {
    const hasAccount = preview.recipientHasAccount;
    return (
      <Shell title={`Join ${org} on chatform`} description={`${who} invited you as ${roleLabel}.`}>
        <Button asChild className="w-full rounded-full">
          <Link href={signInHref(preview.email, hasAccount ? undefined : "signup")}>
            {hasAccount ? "Sign in to accept" : "Create your account"}
          </Link>
        </Button>
        {preview.email && (
          <p className="text-muted-foreground mt-4 text-center text-xs">
            This invitation is for {preview.email}.
          </p>
        )}
      </Shell>
    );
  }

  // Signed in, but as somebody else. Both addresses named, and one button out.
  const sameAccount =
    Boolean(preview.email) && preview.email!.toLowerCase() === session.user.email.toLowerCase();

  if (!sameAccount) {
    return (
      <Shell
        title="You're signed in as someone else"
        description={`This invitation was sent to ${preview.email}, and you're signed in as ${session.user.email}.`}
      >
        <Button
          onClick={() => void switchAccount(preview.email)}
          disabled={switching}
          className="w-full rounded-full"
        >
          {switching ? "…" : `Sign in as ${preview.email}`}
        </Button>
        <Button asChild variant="outline" className="mt-3 w-full rounded-full">
          <Link href="/dashboard">Stay signed in as {session.user.email}</Link>
        </Button>
        <p className="text-muted-foreground mt-4 text-xs">
          The invitation stays open either way &mdash; you can come back to this link once
          you&rsquo;re signed in as {preview.email}.
        </p>
      </Shell>
    );
  }

  return (
    <Shell title={`Join ${org}`} description={`${who} invited you as ${roleLabel}.`}>
      <Button onClick={accept} disabled={accepting} className="w-full rounded-full">
        {accepting ? "…" : "Accept invitation"}
      </Button>
      {acceptError && <p className="text-destructive mt-3 text-sm">{acceptError}</p>}
      <p className="text-muted-foreground mt-4 text-center text-xs">
        Joining as {session.user.email}
      </p>
    </Shell>
  );
}

const EMPTY: InvitationPreview = {
  state: "not_found",
  email: null,
  role: null,
  organizationName: null,
  inviterName: null,
  inviterEmail: null,
  expiresAt: null,
  recipientHasAccount: false,
};

function Shell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-svh items-center justify-center px-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="font-display text-2xl">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </main>
  );
}

/** `useSearchParams` needs a boundary, or the route opts out of prerendering. */
export default function AcceptInvitationPage() {
  return (
    <Suspense>
      <AcceptInvitation />
    </Suspense>
  );
}
