"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { API_ORIGIN, authClient } from "@/lib/auth/auth-client";
import { uploadAuthImage } from "@/lib/auth/upload-image";
import { deleteUserPlugin } from "@/lib/auth/delete-user-plugin";
import { emailOtpPlugin } from "@/lib/auth/email-otp-plugin";
import { organizationPlugin } from "@/lib/auth/organization-plugin";
import { AuthProvider } from "./auth-provider";

/**
 * Better Auth UI, configured once for the whole app.
 *
 * This is the only place the account, security and organization screens are
 * described: everything they render — the fields, the validation, the strength
 * meter, the code inputs, the session list — comes from the installed
 * components under `components/auth/`, and this file is the seam where our
 * product's answers are supplied to them.
 *
 * It deliberately does NOT take over sign-in. `/signin` stays our own page
 * because it carries product behaviour these views have no concept of — an
 * invitation's address prefilled into the form, and `?next=` so an emailed
 * invite survives the detour through authentication. What lives at `/auth/…`
 * is the handful of screens we had nothing for: confirming a new address,
 * signing out, and the callback views.
 */
export function AuthUIProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  /**
   * Drawn only when the deployment can actually complete it.
   *
   * `/signin` has always asked the API whether Google is configured rather
   * than trusting a build-time constant, because a deployment with no Google
   * credentials renders a button that dead-ends in a failed callback. The
   * linked-accounts card in settings offers exactly the same button, so it
   * has to ask the same question. `null` until the answer arrives, so nothing
   * is drawn and then taken away.
   */
  const [google, setGoogle] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`${API_ORIGIN}/api/auth-providers`)
      .then((r) => (r.ok ? r.json() : { google: false }))
      .then((cfg: { google?: boolean }) => {
        if (live) setGoogle(Boolean(cfg.google));
      })
      .catch(() => {
        if (live) setGoogle(false);
      });
    return () => {
      live = false;
    };
  }, []);

  return (
    <AuthProvider
      authClient={authClient}
      basePaths={{ auth: "/auth", settings: "/account", organization: "/organization" }}
      redirectTo="/dashboard"
      socialProviders={google ? ["google"] : []}
      emailAndPassword={{
        minPasswordLength: 8,
        // The three things a password field owes the person typing into it.
        // `confirmPassword` catches the typo you cannot see behind the dots,
        // the strength meter says why eight characters is a floor and not a
        // target, and the reveal toggle is in every one of these components
        // already. All three are configuration, not code.
        confirmPassword: true,
        strengthMeter: true,
        requireEmailVerification: true,
      }}
      /**
       * The avatar goes to R2, not into the session. See `uploadAuthImage` for
       * why that is not a preference.
       *
       * Note what this does NOT reach: the organization plugin resolves its
       * own `logo` config from Better Auth UI's *default* avatar settings, not
       * from this one, so an uploader set here never arrives there. The
       * organization logo has to say so again, and does, in
       * `lib/auth/organization-plugin`.
       */
      avatar={{ upload: uploadAuthImage }}
      /**
       * Same-origin paths only.
       *
       * `redirectTo` is read straight off the query string by these
       * components, so `/auth/verify-email?redirectTo=https://elsewhere` would
       * otherwise walk somebody out of the product the moment they finish
       * confirming their address — an open redirect on the screens where
       * people are most primed to trust what happens next. `/signin` has
       * always filtered its own `?next=` for exactly this reason; this is the
       * same rule, applied at the one place every one of these views
       * navigates through.
       */
      navigate={({ to, replace }) => {
        const safe = to.startsWith("/") && !to.startsWith("//") && !to.startsWith("/\\") ? to : "/dashboard";
        return replace ? router.replace(safe) : router.push(safe);
      }}
      plugins={[
        emailOtpPlugin({
          /**
           * Codes for confirming an address and for changing it; passwords
           * still reset through a link.
           *
           * `signIn` is off deliberately. It is not a second factor — it
           * *replaces* the password, so leaving it on would mean anyone who
           * can read the inbox is in, which is a weaker door than the one we
           * just finished locking.
           *
           * `passwordReset` is off because our reset emails are already out
           * there pointing at `/reset-password?token=…`; switching that flow
           * to codes would strand every link currently in someone's inbox.
           */
          signIn: false,
          emailVerification: true,
          passwordReset: false,
          changeEmail: true,
          verifyCurrentEmail: true,
        }),
        organizationPlugin(),
        /**
         * The danger zone in Security: delete this account, permanently.
         *
         * The card asks for the password and then for a typed confirmation,
         * and the server does considerably more than drop a row — a workspace
         * with nobody else in it goes too, forms, responses and uploaded files
         * included, because leaving those behind would make this button a
         * promise we did not keep. See `purgeUserData` in the API.
         */
        deleteUserPlugin(),
      ]}
      Link={Link}
    >
      {children}
    </AuthProvider>
  );
}
