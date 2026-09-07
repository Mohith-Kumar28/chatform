"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { authClient, useSession } from "@/lib/auth/auth-client";
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
 * Three states have to be handled and each one is a different sentence:
 *
 *   not signed in      the invitation is addressed to an email, and the server
 *                      will only hand it over to a session on that email. So the
 *                      first step is signing in — carrying the invitation id
 *                      through `?next=` so nobody has to find this link again in
 *                      their inbox afterwards.
 *   signed in, wrong   somebody with two addresses, signed in as the other one.
 *   account            Naming both is the whole fix; without it the 403 reads as
 *                      a broken link.
 *   signed in, right   one button.
 *   account
 */
interface InvitationView {
  id: string;
  email: string;
  role: string;
  status: string;
  organizationName: string;
  inviterEmail: string;
}

const ROLE_LABELS: Record<string, string> = {
  owner: "an owner",
  admin: "an admin",
  editor: "an editor",
  viewer: "a viewer",
  member: "a member",
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
  const [result, setResult] = useState<{ invitation?: InvitationView; error?: string } | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  useEffect(() => {
    // Nothing to fetch until there is a session — the endpoint 401s without one,
    // and a failed request here would render as "invitation not found" when the
    // invitation is fine and the browser simply is not signed in yet.
    if (!id || sessionPending || !session) return;
    let live = true;
    authClient.organization
      .getInvitation({ query: { id } })
      .then((res) => {
        if (!live) return;
        setResult(
          res.error
            ? { error: res.error.message ?? "This invitation is no longer valid." }
            : { invitation: res.data as unknown as InvitationView },
        );
      })
      .catch(() => {
        if (live) setResult({ error: "This invitation is no longer valid." });
      });
    return () => {
      live = false;
    };
  }, [id, session, sessionPending]);

  const invitation = result?.invitation ?? null;
  const loadError = result?.error ?? null;
  const loading = Boolean(id) && (sessionPending || (Boolean(session) && result === null));

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

  if (!id) {
    return (
      <Shell title="Invitation not found" description="That link is missing its invitation.">
        <Button asChild variant="outline" className="w-full rounded-full">
          <Link href="/dashboard">Go to dashboard</Link>
        </Button>
      </Shell>
    );
  }

  if (sessionPending || loading) {
    return (
      <Shell title="Invitation" description="One moment.">
        <div className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-10 w-full rounded-full" />
        </div>
      </Shell>
    );
  }

  if (!session) {
    const next = encodeURIComponent(`/accept-invitation?id=${id}`);
    return (
      <Shell
        title="Sign in to accept"
        description="Use the address this invitation was sent to."
      >
        <Button asChild className="w-full rounded-full">
          <Link href={`/signin?next=${next}`}>Continue</Link>
        </Button>
      </Shell>
    );
  }

  if (loadError || !invitation) {
    return (
      <Shell
        title="This invitation is no longer valid"
        description={`It may have been revoked, already used, or sent to a different address than ${session.user.email}.`}
      >
        <p className="text-muted-foreground mb-4 text-sm">
          Ask whoever invited you to send it again.
        </p>
        <Button asChild variant="outline" className="w-full rounded-full">
          <Link href="/dashboard">Go to dashboard</Link>
        </Button>
      </Shell>
    );
  }

  const roleLabel = ROLE_LABELS[invitation.role] ?? invitation.role;

  return (
    <Shell
      title={`Join ${invitation.organizationName}`}
      description={`${invitation.inviterEmail} invited you as ${roleLabel}.`}
    >
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
