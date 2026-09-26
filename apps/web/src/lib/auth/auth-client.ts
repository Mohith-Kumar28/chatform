"use client";

import { createAuthClient } from "better-auth/react";
import { emailOTPClient, organizationClient } from "better-auth/client/plugins";
import { clientContextHeader } from "./client-context";
import { readImpersonation, stopImpersonation } from "@/lib/impersonation";

export const API_ORIGIN =
  process.env.NEXT_PUBLIC_API_ORIGIN ?? "https://api.chatform.in";

export const authClient = createAuthClient({
  baseURL: API_ORIGIN,
  basePath: "/api/auth",
  fetchOptions: {
    credentials: "include",
    // Where and on what they signed up or in, for the admin console. Only on
    // the calls that can open a session; see `./client-context.ts`.
    onRequest: (context) => {
      // Acting as a customer: Better Auth answers as them, so the account menu
      // and organization switcher are theirs. See `@/lib/impersonation`.
      const acting = readImpersonation();
      if (acting) context.headers.set("x-chatform-impersonate", acting.token);
      if (/\/(sign-up|sign-in|email-otp|verify-email)/.test(String(context.url))) {
        const header = clientContextHeader();
        if (header) context.headers.set("x-chatform-client", header);
      }
      return context;
    },
    /**
     * The server ended this impersonation (Stop from another tab, the hour, or
     * the admin leaving the allowlist): the customer's session reads as none.
     * End the tab instead of letting it bounce to the sign-in page.
     */
    onSuccess: (context) => {
      if (
        context.data === null &&
        /\/get-session/.test(String(context.request.url)) &&
        readImpersonation()
      ) {
        void stopImpersonation();
      }
    },
  },
  // `emailOTPClient` is what puts `authClient.emailOtp.*` on the client. The
  // server verifies email with six-digit codes rather than links, and without
  // this the browser has no method to send one back.
  plugins: [organizationClient(), emailOTPClient()],
});

export const { signIn, signUp, signOut, useSession, useActiveOrganization, useListOrganizations } = authClient;
