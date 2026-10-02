"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Check, Laptop, X } from "lucide-react";
import { useSession } from "@/lib/auth/auth-client";
import { customFetch } from "@/lib/api/mutator";
import { currentPath } from "@/lib/safe-next";
import { LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * "Allow Claude to use Chatform?" — the one screen of MCP OAuth a person sees.
 *
 * An AI app (Claude, ChatGPT, Cursor…) opened the browser at the API's
 * `/oauth/authorize`, which checked the request and sent it here with a
 * `request` id. Sign in if needed, pick the organization, Allow, and the API
 * answers with the address to send the browser back to the app on.
 *
 * What the page must show comes from the OAuth spec rather than taste: the
 * app's name, whether that name is verified, and where the access goes. The
 * name of an app that registered itself is whatever it said it was.
 */

interface ConsentInfo {
  client: { name: string; verifiedDomain: string | null; redirectHost: string; local: boolean };
  orgs: { id: string; name: string; role: string; canConnect: boolean }[];
  defaultOrgId: string | null;
}

const CAN = ["Read your forms, responses and analytics", "Create, edit and publish forms", "Export responses"];
const CANNOT = "Delete anything";

function Consent() {
  const params = useSearchParams();
  const requestId = params.get("request");
  const { data: session, isPending } = useSession();

  const [info, setInfo] = useState<ConsentInfo | null>(null);
  const [error, setError] = useState<string | null>(params.get("error") ? "invalid" : null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [busy, setBusy] = useState<"allow" | "deny" | null>(null);
  const [done, setDone] = useState(false);

  // Signed out: sign in (or sign up), then come straight back to this address.
  useEffect(() => {
    if (isPending || session || !requestId) return;
    window.location.replace(`/signin?next=${encodeURIComponent(currentPath())}`);
  }, [isPending, session, requestId]);

  useEffect(() => {
    if (!session || !requestId) return;
    let live = true;
    customFetch<ConsentInfo>(`/api/mcp/consent/${encodeURIComponent(requestId)}`)
      .then((data) => {
        if (!live) return;
        setInfo(data);
        setOrgId(data.defaultOrgId);
      })
      .catch(() => live && setError("expired"));
    return () => {
      live = false;
    };
  }, [session, requestId]);

  async function decide(decision: "allow" | "deny") {
    if (!requestId) return;
    setBusy(decision);
    try {
      const { redirectTo } = await customFetch<{ redirectTo: string }>(
        `/api/mcp/consent/${encodeURIComponent(requestId)}`,
        { method: "POST", body: JSON.stringify({ decision, orgId }) },
      );
      if (decision === "allow") setDone(true);
      window.location.assign(redirectTo);
    } catch (err) {
      setBusy(null);
      setError(err instanceof Error && err.message ? err.message : "expired");
    }
  }

  if (!requestId || error === "invalid") {
    return (
      <Shell title="This link didn't work" description="Start connecting again from your AI app." />
    );
  }

  if (error) {
    return (
      <Shell
        title="Couldn't connect"
        description={error === "expired" ? "This sign-in link has expired. Start connecting again from your AI app." : error}
      >
        <Button asChild variant="outline" className="w-full rounded-full">
          <Link href="/dashboard">Go to dashboard</Link>
        </Button>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell
        title="Connected"
        description={`You can go back to ${info?.client.name ?? "your AI app"} now.`}
        icon={<Check className="size-6 text-[var(--success)]" />}
      />
    );
  }

  if (isPending || !session || !info) {
    return (
      <Shell title="Connect to Chatform" description="One moment.">
        <div className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-10 w-full rounded-full" />
        </div>
      </Shell>
    );
  }

  const { client, orgs } = info;
  const allowed = orgs.filter((o) => o.canConnect);

  if (allowed.length === 0) {
    return (
      <Shell
        title="Ask an admin to connect"
        description={`Only an owner or admin of ${orgs[0]?.name ?? "your organization"} can connect ${client.name}.`}
      >
        <Button variant="outline" className="w-full rounded-full" onClick={() => decide("deny")} disabled={busy !== null}>
          Go back
        </Button>
      </Shell>
    );
  }

  return (
    <Shell title={`Allow ${client.name} to use Chatform?`} description={`Signed in as ${session.user.email}`}>
      <div className="space-y-5">
        {orgs.length > 1 && (
          <Select value={orgId ?? undefined} onValueChange={setOrgId}>
            <SelectTrigger className="w-full" aria-label="Organization">
              <SelectValue placeholder="Choose an organization" />
            </SelectTrigger>
            <SelectContent>
              {allowed.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <ul className="text-body space-y-2">
          {CAN.map((line) => (
            <li key={line} className="flex items-start gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-[var(--success)]" />
              {line}
            </li>
          ))}
          <li className="text-muted-foreground flex items-start gap-2">
            <X className="mt-0.5 size-4 shrink-0" />
            {CANNOT}
          </li>
        </ul>

        {/* Where the access goes. Required by the spec, and the one fact that tells a real app from a lookalike. */}
        <p className="text-muted-foreground text-caption flex items-start gap-2">
          {client.local ? (
            <>
              <Laptop className="mt-0.5 size-3.5 shrink-0" />
              Access goes to an app on this computer. Allow only if you just started connecting from it.
            </>
          ) : (
            <>
              Access goes to <span className="text-foreground font-medium">{client.verifiedDomain ?? client.redirectHost}</span>.
            </>
          )}
        </p>

        <div className="flex flex-col gap-2">
          <Button
            className="w-full rounded-full"
            onClick={() => decide("allow")}
            disabled={busy !== null || !orgId}
          >
            {busy === "allow" ? "Connecting…" : "Allow"}
          </Button>
          <Button
            variant="ghost"
            className="w-full rounded-full"
            onClick={() => decide("deny")}
            disabled={busy !== null}
          >
            Cancel
          </Button>
        </div>
      </div>
    </Shell>
  );
}

function Shell({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description: string;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <main className="flex min-h-svh items-center justify-center px-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex justify-center">{icon ?? <LogoMark className="size-9" />}</div>
          <CardTitle className="font-display text-2xl text-balance">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        {children && <CardContent>{children}</CardContent>}
      </Card>
    </main>
  );
}

/** `useSearchParams` needs a boundary, or the route opts out of prerendering. */
export default function ConsentPage() {
  return (
    <Suspense>
      <Consent />
    </Suspense>
  );
}
