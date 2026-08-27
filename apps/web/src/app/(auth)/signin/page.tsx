"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn, signUp } from "@/lib/auth/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { API_ORIGIN } from "@/lib/api/mutator";

function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  // A failed OAuth round trip comes back as a redirect, not a rejected promise, so the
  // reason only exists in the URL. Read once as the initial value rather than pushed in
  // from an effect — the parameter is already there during the first render, and a later
  // `setError` from a form submit is then free to replace it.
  const [error, setError] = useState<string | null>(() =>
    params.get("error") ? "Google sign-in did not complete. Please try again." : null,
  );
  const [pending, setPending] = useState(false);
  // `null` = not known yet, so the button is not drawn and then yanked away on a
  // deployment that has no Google credentials configured.
  const [googleEnabled, setGoogleEnabled] = useState<boolean | null>(null);

  // Drop `?error=` from the address bar once it has been read, so a refresh does not
  // resurrect the message. `replaceState` deliberately bypasses the router: re-rendering
  // this page is exactly what we do not want.
  useEffect(() => {
    if (params.get("error")) window.history.replaceState({}, "", "/signin");
  }, [params]);

  useEffect(() => {
    let live = true;
    fetch(`${API_ORIGIN}/api/auth-providers`)
      .then((r) => (r.ok ? r.json() : { google: false }))
      .then((cfg: { google?: boolean }) => {
        if (live) setGoogleEnabled(Boolean(cfg.google));
      })
      // An unreachable API is not the moment to offer a sign-in method that cannot work.
      .catch(() => {
        if (live) setGoogleEnabled(false);
      });
    return () => {
      live = false;
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      if (mode === "signup") {
        const res = await signUp.email({ email, password, name: name || (email.split("@")[0] ?? "User") });
        if (res.error) throw new Error(res.error.message ?? "Sign up failed");
      } else {
        const res = await signIn.email({ email, password });
        if (res.error) throw new Error(res.error.message ?? "Sign in failed");
      }
      // full navigation: guarantees the fresh session cookie is used server-side
      window.location.assign("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPending(false);
    }
  };

  /**
   * Google is a full-page redirect: the browser leaves for Google and comes back to
   * `callbackURL` with the session cookie already set, so there is no post-signup step to
   * run here and nothing to navigate to on success. The user's first organization is
   * created server-side on user creation, which is the only place both flows share.
   *
   * `callbackURL` is this app's own origin rather than a build-time constant so a local dev
   * app running against the deployed API returns to localhost. The API only honours origins
   * listed in `WEB_ORIGINS`, so this cannot be pointed anywhere else.
   */
  const submitGoogle = async () => {
    setPending(true);
    setError(null);
    try {
      const res = await signIn.social({
        provider: "google",
        callbackURL: `${window.location.origin}/dashboard`,
        errorCallbackURL: `${window.location.origin}/signin?error=google`,
      });
      if (res.error) throw new Error(res.error.message ?? "Google sign-in failed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed");
      setPending(false);
    }
  };

  return (
    <main className="flex min-h-svh items-center justify-center px-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="font-display text-2xl">
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </CardTitle>
          <CardDescription>
            {mode === "signin" ? "Sign in to your chatform dashboard" : "Free forever — unlimited forms"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {googleEnabled && (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={submitGoogle}
                className="w-full gap-2 rounded-full"
              >
                <GoogleMark />
                Continue with Google
              </Button>
              <div className="my-4 flex items-center gap-3">
                <span className="bg-border h-px flex-1" />
                <span className="text-muted-foreground text-xs">or</span>
                <span className="bg-border h-px flex-1" />
              </div>
            </>
          )}
          <form onSubmit={submit} className="space-y-4">
            {mode === "signup" && (
              <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada Lovelace" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
            <Button type="submit" disabled={pending} className="w-full rounded-full">
              {pending ? "…" : mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>
          <p className="text-muted-foreground mt-4 text-center text-sm">
            {mode === "signin" ? (
              <>
                No account?{" "}
                <button className="text-primary underline" onClick={() => setMode("signup")}>
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have one?{" "}
                <button className="text-primary underline" onClick={() => setMode("signin")}>
                  Sign in
                </button>
              </>
            )}
          </p>
          <p className="mt-4 text-center">
            <Link href="/" className="text-muted-foreground text-xs hover:underline">
              ← back to chatform.com
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}

/**
 * Google's mark, inline. lucide-react carries no brand icons, and Google's sign-in
 * branding rules ask for the four-colour mark rather than a generic substitute.
 */
function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A9 9 0 0 0 9 18Z"
      />
      <path fill="#FBBC05" d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.01-2.34Z" />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.94l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

/**
 * `useSearchParams` in a client component requires a Suspense boundary, or Next opts the
 * entire route out of prerendering at build time.
 */
export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}
