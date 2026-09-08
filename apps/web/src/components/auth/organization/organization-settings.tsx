"use client"

import { getOrganizationCardKey, useAuth } from "@better-auth-ui/react"
import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"
import { OrganizationDangerZone } from "./organization-danger-zone"
import { OrganizationProfile } from "./organization-profile"

export type OrganizationSettingsProps = {
  className?: string
  organizationId: string
  organizationSlug: string
}

/**
 * Organization settings UI: profile card, plugin-contributed cards
 * (`organizationCards`), our own cards, then danger zone.
 *
 * `children` land before the danger zone rather than after it, because the
 * danger zone is a floor: everything above it is settings you edit, and
 * anything below reads as an afterthought bolted on past the point where the
 * page said "here be dragons".
 */
export function OrganizationSettings({
  className,
  organizationId,
  organizationSlug,
  children,
  ...props
}: OrganizationSettingsProps & ComponentProps<"div">) {
  const { plugins } = useAuth()

  return (
    <div className={cn("flex flex-col gap-4 md:gap-6", className)} {...props}>
      <OrganizationProfile />

      {plugins.flatMap((plugin) =>
        plugin.organizationCards?.map((Card) => (
          <Card
            key={getOrganizationCardKey(plugin.id, Card)}
            organizationId={organizationId}
            organizationSlug={organizationSlug}
          />
        ))
      )}

      {children}

      <OrganizationDangerZone />
    </div>
  )
}
