"use client";

import { fileToBase64 } from "@better-auth-ui/core";
import type { OrganizationAuthClient } from "@better-auth-ui/core/plugins/organization";
import { useAuth, useAuthPlugin } from "@better-auth-ui/react";
import {
  useActiveOrganization,
  useHasPermission,
  useUpdateOrganization,
} from "@better-auth-ui/react/plugins/organization";
import { Trash2 } from "lucide-react";
import { type ChangeEvent, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { organizationPlugin } from "@/lib/auth/organization-plugin";
import { cn } from "@/lib/utils";
import { OrganizationLogo } from "./organization-logo";

export type ChangeOrganizationLogoProps = {
  className?: string;
};

export function ChangeOrganizationLogo({
  className,
}: ChangeOrganizationLogoProps) {
  const { authClient } = useAuth<OrganizationAuthClient>();
  const { logo, localization: organizationLocalization } =
    useAuthPlugin(organizationPlugin);

  const { data: activeOrganization, isPending: activeOrganizationPending } =
    useActiveOrganization(authClient);
  const canUpdate = useHasPermission(authClient, {
    permissions: { organization: ["update"] },
  });

  const { mutate: updateOrganization, isPending: updatePending } =
    useUpdateOrganization(authClient);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isPending = updatePending || isUploading || isDeleting;

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !activeOrganization || !canUpdate.data?.success) return;

    e.target.value = "";

    setIsUploading(true);

    try {
      const resized =
        (await logo.resize?.(file, logo.size, logo.extension)) || file;

      const image =
        (await logo.upload?.(resized)) || (await fileToBase64(resized));

      updateOrganization(
        { data: { logo: image } },
        {
          onSuccess: () =>
            toast.success(organizationLocalization.logoChangedSuccess),
          onSettled: () => setIsUploading(false),
        },
      );
    } catch (error) {
      setIsUploading(false);
      if (error instanceof Error) {
        toast.error(error.message);
      }
    }
  }

  async function handleDelete() {
    if (!canUpdate.data?.success) return;
    const currentLogo = activeOrganization?.logo;

    updateOrganization(
      { data: { logo: "" } },
      {
        onSuccess: async () => {
          if (!currentLogo) {
            toast.success(organizationLocalization.logoDeletedSuccess);
            return;
          }

          setIsDeleting(true);
          try {
            await logo.delete?.(currentLogo);
            toast.success(organizationLocalization.logoDeletedSuccess);
          } catch (error) {
            if (error instanceof Error) {
              toast.error(error.message);
            }
          } finally {
            setIsDeleting(false);
          }
        },
      },
    );
  }

  if (!logo.enabled) {
    return null;
  }

  const hasLogo = Boolean(activeOrganization?.logo);

  /**
   * Upload and Remove are both on the surface.
   *
   * Removing used to be an item inside a dropdown whose trigger read "Change
   * logo", so the way to get rid of a logo was to open a menu named after the
   * other thing and find a third option in it. People reported not being able
   * to remove a logo at all, which was fair — the control worked, and nothing
   * about the screen suggested it existed.
   *
   * `OrganizationLogoField`, the same job in the create dialog, already had
   * this right: pick on the avatar, a button to change, a quiet destructive one
   * to clear. Two screens editing the same value now behave the same way.
   */
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label aria-disabled={!activeOrganization}>
        {organizationLocalization.logo}
      </Label>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="flex items-center gap-4">
        {canUpdate.data?.success ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-auto w-auto rounded-full p-0"
            disabled={!activeOrganization || isPending}
            onClick={() => fileInputRef.current?.click()}
            aria-label={
              hasLogo
                ? organizationLocalization.changeLogo
                : organizationLocalization.uploadLogo
            }
          >
            <OrganizationLogo
              size="lg"
              isPending={activeOrganizationPending}
              organization={activeOrganization}
            />
          </Button>
        ) : (
          <OrganizationLogo
            size="lg"
            isPending={activeOrganizationPending}
            organization={activeOrganization}
          />
        )}

        {(canUpdate.isPending || canUpdate.data?.success) && (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!activeOrganization || isPending || canUpdate.isPending}
              onClick={() => fileInputRef.current?.click()}
            >
              {isPending && <Spinner />}

              {hasLogo
                ? organizationLocalization.changeLogo
                : organizationLocalization.uploadLogo}
            </Button>

            {/* Only once there is something to remove — a permanent disabled
                Remove next to an empty circle is a control explaining a state
                the empty circle already shows. */}
            {hasLogo && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-muted-foreground hover:text-destructive"
                disabled={isPending || canUpdate.isPending}
                onClick={handleDelete}
              >
                <Trash2 className="size-3.5" />

                {organizationLocalization.deleteLogo}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
