"use client";

import { LayoutDashboard } from "lucide-react";
import { ApiProvider } from "@/lib/api/api-provider";
import { AuthUIProvider } from "@/components/auth/auth-ui-provider";
import { UserButton } from "@/components/auth/user/user-button";

/**
 * The account menu on the marketing pages, for someone already signed in.
 *
 * Better Auth UI's `UserButton`, with its multi-session switcher: the other
 * signed-in accounts, Add account, Settings and Sign out. It needs the app's
 * providers, which the marketing layout leaves out on purpose (~220 KB, see
 * `AppProviders`), so the nav loads this file only once it knows there is a
 * session. An anonymous visitor never downloads any of it.
 */
export function MarketingAccountButton() {
  return (
    <ApiProvider>
      <AuthUIProvider>
        <UserButton
          size="icon"
          align="end"
          links={[{ label: "Dashboard", href: "/dashboard", icon: <LayoutDashboard className="text-muted-foreground" /> }]}
        />
      </AuthUIProvider>
    </ApiProvider>
  );
}
