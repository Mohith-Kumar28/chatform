"use client";

import { use } from "react";
import { notFound, redirect } from "next/navigation";
import { viewPaths } from "@better-auth-ui/core";
import { Auth } from "@/components/auth/auth";
import { emailOtpPlugin } from "@/lib/auth/email-otp-plugin";

/**
 * The Better Auth UI auth views, on one route.
 *
 * Only the screens we had nothing for get used here — `verify-email` above
 * all, which is where somebody types the six digits we mailed them, plus the
 * `callback` / `error` / `redirect` views that social sign-in bounces through.
 *
 * `sign-in` and `sign-up` are deliberately NOT rendered. `/signin` is the one
 * sign-in page: it prefills the address an invitation was sent to and honours
 * `?next=`, and two forms that both take an email and a password, at two
 * addresses, is the kind of thing nobody notices until a customer bookmarks
 * the wrong one. They still resolve rather than 404, because
 * `useAuthenticate` sends every signed-out visitor to `/auth/sign-in` by
 * construction; they just resolve to the real page, carrying the destination
 * across the two spellings of the same idea.
 *
 * The rest of the path is validated rather than passed through, because
 * `<Auth>` throws on an unknown one, and an uncaught throw in a client
 * component is a blank screen where a 404 belongs.
 */
const REDIRECT_TO_SIGNIN = new Set<string>([viewPaths.auth.signIn, viewPaths.auth.signUp]);

const VALID = new Set<string>([
  ...Object.values(viewPaths.auth),
  ...Object.values(emailOtpPlugin().viewPaths?.auth ?? {}),
]);

export default function AuthViewPage({
  params,
  searchParams,
}: {
  params: Promise<{ path: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { path } = use(params);
  const query = use(searchParams);

  if (REDIRECT_TO_SIGNIN.has(path)) {
    const raw = query.redirectTo;
    const next = typeof raw === "string" ? raw : undefined;
    // Only a path, for the same reason `/signin` only honours a path in
    // `?next=`: this value ends up deciding where a freshly authenticated
    // browser lands.
    const safe = next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : null;
    const mode = path === viewPaths.auth.signUp ? "?mode=signup" : "";
    const joiner = mode ? "&" : "?";
    redirect(`/signin${mode}${safe ? `${joiner}next=${encodeURIComponent(safe)}` : ""}`);
  }

  if (!VALID.has(path)) notFound();

  return (
    <main className="flex min-h-svh items-center justify-center px-6 py-12">
      <Auth path={path} className="w-full max-w-sm" />
    </main>
  );
}
