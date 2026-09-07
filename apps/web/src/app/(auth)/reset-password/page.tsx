"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Choose a new password.
 *
 * Reached two ways, and both have to work. The email links straight here with
 * `?token=…`, which is the path this page is built for. Better Auth's own
 * callback also redirects here — with `?token=` on success and
 * `?error=INVALID_TOKEN` when the link has expired — which is why the error
 * parameter is read as well as the token.
 *
 * No token at all is the same situation as an expired one from the reader's
 * point of view: they cannot proceed, and the useful thing to offer is a fresh
 * link rather than an explanation of token lifetimes.
 */
function ResetPasswordForm() {
  const params = useSearchParams();
  const token = params.get("token");
  const linkError = params.get("error");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError("Those two passwords don't match.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await authClient.resetPassword({ newPassword: password, token: token! });
      if (res.error) throw new Error(res.error.message ?? "That link is no longer valid.");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPending(false);
    }
  };

  if (!token || linkError) {
    return (
      <Shell title="That link has expired" description="Reset links last an hour and work once.">
        <Button asChild className="w-full rounded-full">
          <Link href="/forgot-password">Send a new link</Link>
        </Button>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell title="Password changed" description="You can sign in with your new password now.">
        {/*
          A full navigation rather than a router push: signing in is about to
          change the session cookie, and the sign-in page is the only thing
          that should be deciding where to go next.
        */}
        <Button asChild className="w-full rounded-full">
          <Link href="/signin">Sign in</Link>
        </Button>
      </Shell>
    );
  }

  return (
    <Shell title="Choose a new password" description="At least 8 characters.">
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            type="password"
            required
            autoFocus
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm">Confirm new password</Label>
          <Input
            id="confirm"
            type="password"
            required
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="••••••••"
          />
        </div>
        {error && <p className="text-destructive text-sm">{error}</p>}
        <Button type="submit" disabled={pending} className="w-full rounded-full">
          {pending ? "…" : "Change password"}
        </Button>
      </form>
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
        <CardContent>
          {children}
          <p className="mt-4 text-center">
            <Link href="/signin" className="text-muted-foreground text-xs hover:underline">
              ← back to sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}

/** `useSearchParams` needs a boundary, or the route opts out of prerendering. */
export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
