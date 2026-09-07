"use client";

import { useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Ask for a reset link.
 *
 * The success state does not say whether the address exists, and the request is
 * treated as having succeeded even when it did not: an endpoint that answers
 * differently for a known and an unknown address is a way to find out who our
 * customers are, one address at a time. The only thing a real error changes
 * here is a line in the console.
 *
 * `redirectTo` is where Better Auth sends someone who followed a link that has
 * expired — it lands back on the reset page with `?error=INVALID_TOKEN`, which
 * that page turns into a sentence and an offer to start again.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    try {
      await authClient.requestPasswordReset({
        email,
        redirectTo: `${window.location.origin}/reset-password`,
      });
    } catch (err) {
      console.error("password_reset_request_failed", err);
    } finally {
      setPending(false);
      setSent(true);
    }
  };

  return (
    <main className="flex min-h-svh items-center justify-center px-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="font-display text-2xl">
            {sent ? "Check your email" : "Forgot your password?"}
          </CardTitle>
          <CardDescription>
            {sent
              ? `If an account exists for ${email}, a reset link is on its way. It expires in an hour.`
              : "We'll email you a link to choose a new one."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="space-y-4">
              <p className="text-muted-foreground text-sm">
                Nothing after a minute or two? Check your spam folder, or{" "}
                <button className="text-primary underline" onClick={() => setSent(false)}>
                  try a different address
                </button>
                .
              </p>
              <Button asChild variant="outline" className="w-full rounded-full">
                <Link href="/signin">Back to sign in</Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                />
              </div>
              <Button type="submit" disabled={pending} className="w-full rounded-full">
                {pending ? "…" : "Send reset link"}
              </Button>
            </form>
          )}
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
