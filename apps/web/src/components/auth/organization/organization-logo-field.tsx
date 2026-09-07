"use client"

import { useAuthPlugin } from "@better-auth-ui/react"
import { Trash2, Upload } from "lucide-react"
import { type ChangeEvent, useRef, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { organizationPlugin } from "@/lib/auth/organization-plugin"
import { cn } from "@/lib/utils"
import { OrganizationLogo } from "./organization-logo"

export type OrganizationLogoFieldProps = {
  className?: string
  disabled?: boolean
  /** The name being typed alongside it, so the fallback shows real initials. */
  name?: string
  onChange: (logo: string) => void
  /** The uploaded URL, or `""` for none. */
  value: string
}

/**
 * The logo picker for an organization that does not exist yet.
 *
 * `ChangeOrganizationLogo` cannot do this job: every path through it calls
 * `useUpdateOrganization`, which needs an organization id, and there is no id
 * until the form below it is submitted. So this uploads on pick and hands the
 * URL back to the form, which passes it to `organization.create` — `logo` is
 * part of that endpoint's body schema, so the workspace is created with its
 * logo already on it rather than created blank and then patched.
 *
 * Everything else is shared with `ChangeOrganizationLogo` deliberately: the
 * same `logo` config off the organization plugin, so the same resize
 * (256px PNG) and the same upload target. That target is worth naming, because
 * the fallback is a trap — Better Auth UI defaults to encoding the image as a
 * base64 data URL, and `logo` is serialised into the session cookie cache. A
 * 256px PNG is tens of kilobytes against a cookie ceiling of four. Our
 * `auth-ui-provider` sets `avatar.upload` to R2, and the organization plugin's
 * `logo` config inherits from `avatar`, so we land on a short `/p/assets/<id>`
 * URL. If that config ever goes missing this field disables itself rather than
 * silently producing a workspace nobody can sign into.
 */
export function OrganizationLogoField({
  className,
  disabled,
  name,
  onChange,
  value
}: OrganizationLogoFieldProps) {
  const { logo, localization: organizationLocalization } =
    useAuthPlugin(organizationPlugin)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)

  // No uploader means the only thing this could produce is a data URL that
  // breaks the session cookie. Better to offer nothing than to offer that.
  if (!logo.enabled || !logo.upload) return null

  const busy = disabled || isUploading

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Cleared straight away so picking the same file twice still fires.
    event.target.value = ""
    if (!file) return

    setIsUploading(true)
    try {
      const resized =
        (await logo.resize?.(file, logo.size, logo.extension)) || file
      const uploaded = await logo.upload?.(resized)
      if (!uploaded) throw new Error("Could not upload that image")
      onChange(uploaded)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not upload that image"
      )
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className={cn("flex items-center gap-4", className)}>
      <button
        type="button"
        disabled={busy}
        onClick={() => fileInputRef.current?.click()}
        aria-label={organizationLocalization.uploadLogo}
        className={cn(
          "group relative shrink-0 rounded-full",
          "focus-visible:ring-ring/50 outline-none focus-visible:ring-2",
          busy ? "cursor-default" : "cursor-pointer"
        )}
      >
        <OrganizationLogo
          size="lg"
          organization={{ logo: value, name: name?.trim() || undefined }}
        />

        {/* The affordance only appears over the avatar, which is the whole
            hit area. A permanent camera badge on an empty circle reads as a
            second control next to the name field; this reads as one. */}
        <span
          className={cn(
            "absolute inset-0 flex items-center justify-center rounded-full",
            "bg-foreground/55 text-background transition-opacity",
            isUploading
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
          )}
        >
          {isUploading ? (
            <Spinner className="size-4" />
          ) : (
            <Upload className="size-4" />
          )}
        </span>
      </button>

      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-sm font-medium">{organizationLocalization.logo}</p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
          >
            {value
              ? organizationLocalization.changeLogo
              : organizationLocalization.uploadLogo}
          </Button>

          {value && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => onChange("")}
              aria-label={organizationLocalization.deleteLogo}
            >
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        disabled={busy}
        onChange={handleFileChange}
      />
    </div>
  )
}
