"use client";

import { createAuthClient } from "better-auth/react";
import { emailOTPClient, organizationClient } from "better-auth/client/plugins";

export const API_ORIGIN =
  process.env.NEXT_PUBLIC_API_ORIGIN ?? "https://api.chatform.in";

export const authClient = createAuthClient({
  baseURL: API_ORIGIN,
  basePath: "/api/auth",
  fetchOptions: { credentials: "include" },
  // `emailOTPClient` is what puts `authClient.emailOtp.*` on the client. The
  // server verifies email with six-digit codes rather than links, and without
  // this the browser has no method to send one back.
  plugins: [organizationClient(), emailOTPClient()],
});

export const { signIn, signUp, signOut, useSession, useActiveOrganization, useListOrganizations } = authClient;
