import { AppProviders } from "@/components/providers/app-providers";

/**
 * Sign-in, sign-up, password reset and the Better Auth UI callback views.
 *
 * This group had no layout at all while the providers lived in the root one.
 * It needs them for the obvious reason — every screen here talks to
 * `authClient` — so the group grew a layout of its own rather than pushing the
 * app shell back up to the root.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <AppProviders>{children}</AppProviders>;
}
