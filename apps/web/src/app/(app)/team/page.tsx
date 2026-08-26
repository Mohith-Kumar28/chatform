"use client";

import { useEffect, useState } from "react";
import { authClient, useListOrganizations } from "@/lib/auth/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { UserPlus } from "lucide-react";

interface MemberRow {
  id: string;
  role: string;
  user?: { name?: string; email?: string };
}

const API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN ?? "http://localhost:8787";

export default function TeamPage() {
  const { data: orgs, isPending } = useListOrganizations();
  const org = orgs?.[0] as unknown as { id: string; name: string } | undefined;
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [email, setEmail] = useState("");
  const [invited, setInvited] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!org?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_ORIGIN}/api/auth/organization/list-members?organizationId=${org.id}`, {
          credentials: "include",
        });
        const body = (await res.json()) as { members?: MemberRow[] } | MemberRow[];
        if (!cancelled && res.ok) setMembers(Array.isArray(body) ? body : (body.members ?? []));
      } catch {
        /* members list is non-critical */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [org?.id, invited]);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await authClient.organization.inviteMember({ email, role: "member" });
      if (res.error) throw new Error(res.error.message ?? "Invite failed");
      setInvited(true);
      setEmail("");
      setTimeout(() => setInvited(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invite failed");
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10">
      {isPending && (
        <div className="space-y-3">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-48 w-full" />
        </div>
      )}
      {!isPending && !org && (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center text-sm">
            No organization yet — create one from the dashboard to invite teammates.
          </CardContent>
        </Card>
      )}
      {org && (
      <>
      <header className="mb-8">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Team</h1>
        <p className="text-muted-foreground mt-1 text-sm">{org?.name ?? "No organization"}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-base">Members</CardTitle>
            <CardDescription>People with access to this workspace.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {members.length === 0 && <p className="text-muted-foreground text-sm">No members yet.</p>}
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-3 rounded-lg border px-3 py-2">
                <div className="bg-primary flex size-8 items-center justify-center rounded-full text-xs font-bold text-white">
                  {(m.user?.name ?? m.user?.email ?? "?").charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.user?.name ?? m.user?.email}</p>
                  <p className="text-muted-foreground truncate text-xs">{m.user?.email}</p>
                </div>
                <Badge variant="secondary">{m.role}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display text-base">Invite a teammate</CardTitle>
            <CardDescription>{"They'll get access to all forms in this organization."}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={invite} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="invite-email">Email</Label>
                <Input id="invite-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@company.com" />
              </div>
              {error && <p className="text-destructive text-sm">{error}</p>}
              {invited && <p className="text-sm text-[var(--primary)]">Invite sent</p>}
              <Button type="submit" className="w-full rounded-full">
                <UserPlus className="size-4" /> Send invite
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
      </>
      )}
    </div>
  );
}
