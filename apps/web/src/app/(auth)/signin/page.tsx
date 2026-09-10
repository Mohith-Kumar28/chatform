"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn, signUp } from "@/lib/auth/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordField } from "@/components/auth/password-field";
import { API_ORIGIN } from "@/lib/api/mutator";

function SignInForm() {
  /**
   * The router is only for the paths that do NOT change the session.
   *
   * Landing on a dashboard uses `window.location.assign`, because the cookie
   * has just changed and a client transition would render the new session
   * against the previous session's cached RSC payload. The hop to
   * `/auth/verify-email` is the opposite case — no cookie moved, nothing is
   * cached that could be stale — so it is a normal navigation and keeps the
   * `sessionStorage` entry the verify view is about to read.
   */
  const router = useRouter();
  const params = useSearchParams();
  /**
   * Both of these are read once, as initial state rather than from an effect.
   *
   * An invitation link sends people here with the address it was mailed to and,
   * when that address has no account yet, with `mode=signup`. Prefilling is not
   * a nicety: an invitation is only redeemable by the exact address it names, so
   * somebody who retypes it slightly differently — or signs up with the address
   * they usually use — creates an account the invitation will refuse, and the
   * only symptom is the accept page telling them they are signed in as somebody
   * else. Both stay editable; this decides the starting point, not the answer.
   */
  const [mode, setMode] = useState<"signin" | "signup">(() =>
    params.get("mode") === "signup" ? "signup" : "signin",
  );
  const [email, setEmail] = useState(() => params.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
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
  // this page is exactly what we do not want. Only that one parameter is removed —
  // rewriting the URL to a bare `/signin` used to throw away the `next` of whoever
  // arrived from an invitation, so a failed Google round trip lost the invitation.
  useEffect(() => {
    if (!params.get("error")) return;
    const rest = new URLSearchParams(params.toString());
    rest.delete("error");
    const query = rest.toString();
    window.history.replaceState({}, "", query ? `/signin?${query}` : "/signin");
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

  /**
   * Where to go after signing in.
   *
   * `?next=` exists so an invitation link survives the detour through sign-in:
   * somebody who clicks an emailed invite while signed out should land back on
   * it, not on a dashboard with no explanation of why they are there.
   *
   * Only same-origin *paths* are honoured. Reflecting the parameter as given
   * would make this an open redirect on the one page where a customer is most
   * primed to type a password, so anything that is not a single leading slash
   * — a protocol, a `//host`, a backslash Chrome will normalise — falls back to
   * the dashboard.
   */
  const nextPath = (() => {
    const raw = params.get("next");
    if (!raw) return "/dashboard";
    if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/dashboard";
    return raw;
  })();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Caught here rather than by the server, because the server cannot catch
    // it: two boxes of dots that differ is not an error to Better Auth, it is
    // a password. The whole value of the second field is this comparison.
    if (mode === "signup" && password !== confirm) {
      setError("Those two passwords don't match.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      if (mode === "signup") {
        const res = await signUp.email({ email, password, name: name || (email.split("@")[0] ?? "User") });
        if (res.error) throw new Error(res.error.message ?? "Sign up failed");
        /*
          Signing up no longer signs you in. The account exists and is inert
          until the address is confirmed, so the only honest next screen is the
          one asking for the code — and `?next=` is carried through it so an
          invitation still survives the detour.

          The address goes into session storage under the key the verify view
          reads, which is how it knows who to resend to without asking again.
        */
        try {
          sessionStorage.setItem("better-auth-ui.verify-email", email);
        } catch {
          // Private mode, or storage disabled. The view asks for the address.
        }
        router.push(`/auth/verify-email?redirectTo=${encodeURIComponent(nextPath)}`);
        return;
      }

      const res = await signIn.email({ email, password });
      if (res.error) {
        /*
          An unconfirmed address is not a failed sign-in, and saying "sign in
          failed" to someone whose password was right sends them to the reset
          form for a problem a reset cannot fix. The server has already mailed
          a fresh code by the time this arrives — `sendOnSignIn` — so the right
          move is to hand them the box to type it into.
        */
        if (res.error.status === 403 || /verif/i.test(res.error.message ?? "")) {
          try {
            sessionStorage.setItem("better-auth-ui.verify-email", email);
          } catch {
            // As above.
          }
          router.push(`/auth/verify-email?redirectTo=${encodeURIComponent(nextPath)}`);
          return;
        }
        throw new Error(res.error.message ?? "Sign in failed");
      }
      // A full navigation, deliberately. `router.push` is a client transition:
      // it keeps the RSC payload and every cached query from before sign-in, so
      // the dashboard would render against the previous session. Leaving the
      // page is what guarantees the server reads the new cookie.
      window.location.assign(nextPath);
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
        callbackURL: `${window.location.origin}${nextPath}`,
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
            <PasswordField
              id="password"
              label="Password"
              value={password}
              onChange={setPassword}
              disabled={pending}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              // The meter belongs on the form where a password is *chosen*.
              // Scoring one you already have is a judgement you cannot act on.
              strength={mode === "signup"}
              labelAction={
                /* Sign-in only: offering a password reset to somebody creating
                   an account is an answer to a question they have not asked. */
                mode === "signin" ? (
                  <Link href="/forgot-password" className="text-muted-foreground text-xs hover:underline">
                    Forgot?
                  </Link>
                ) : null
              }
            />
            {mode === "signup" && (
              <PasswordField
                id="confirm-password"
                label="Confirm password"
                value={confirm}
                onChange={setConfirm}
                disabled={pending}
                autoComplete="new-password"
              />
            )}
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
              ← back to chatform.in
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
