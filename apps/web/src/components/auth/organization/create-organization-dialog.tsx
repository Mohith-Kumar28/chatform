"use client"

import {
  getAdditionalFieldDefaultValues,
  getAdditionalFieldSubmitValues,
  validateStringLength
} from "@better-auth-ui/core"
import type { OrganizationAuthClient } from "@better-auth-ui/core/plugins/organization"
import { useAuth, useAuthPlugin } from "@better-auth-ui/react"
import { useCreateOrganization } from "@better-auth-ui/react/plugins/organization"
import { useQueryClient } from "@tanstack/react-query"
import { Briefcase } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { buttonVariants } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ENTITLEMENTS_KEY } from "@/hooks/use-entitlements"
import { organizationPlugin } from "@/lib/auth/organization-plugin"
import {
  getAuthAdditionalFieldValidators,
  isAuthFormFieldInvalid,
  useAuthForm
} from "../auth-form"
import { InviteTeammatesStep } from "./invite-teammates-step"
import { OrganizationLogoField } from "./organization-logo-field"
import { SlugField, sanitizeSlug } from "./slug-field"

/** Props for the `CreateOrganizationDialog` component. */
export type CreateOrganizationDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  hideSlug?: boolean
  /**
   * Skip the invite step and close as soon as the organization exists.
   *
   * For callers with nowhere sensible to send an invitation — not the common
   * case, which is why inviting is the default.
   */
  hideInvite?: boolean
  /**
   * The flow is over: created, and then either invitations sent or skipped.
   *
   * Separate from `onOpenChange(false)` because closing before submitting is
   * an abandoned create, and a caller that navigates on success must not
   * navigate on Cancel. Fires once, whether the invite step was completed,
   * skipped or dismissed.
   */
  onCompleted?: () => void
}

/**
 * Create a workspace: name it, give it a logo, then invite the people who will
 * work in it.
 *
 * ## Two steps, because the second one is the point
 *
 * A workspace with one person in it is an account with extra words. The minute
 * after somebody names one is the only moment they have their whole team in
 * mind, and every platform that asks then — and lets you skip — does so because
 * asking later means asking somebody who has already moved on to the thing they
 * came here to do. `InviteTeammatesStep` carries that half.
 *
 * Skipping is a first-class answer, not an escape hatch: plenty of workspaces
 * genuinely are for one person, and the roster is always there at `/team`.
 *
 * ## The logo is set here, not afterwards
 *
 * `logo` is part of `organization.create`'s body, so there is no reason to
 * create the workspace blank and immediately patch it — which is what pointing
 * people at Settings amounts to. `OrganizationLogoField` uploads on pick and
 * hands back a URL; the workspace has never existed without its logo.
 *
 * ## The slug is Better Auth UI's problem
 *
 * With `hideSlug`, `slug` goes to `useCreateOrganization` as `undefined` and
 * the mutation derives one from the name, asks `checkSlug`, and retries up to
 * five times with a suffix on `ORGANIZATION_SLUG_ALREADY_TAKEN`. That is worth
 * spelling out because the dashboard's workspace switcher used to carry a
 * hand-written copy of exactly that loop, and a second implementation of a
 * uniqueness retry is a second chance to get it wrong.
 */
export function CreateOrganizationDialog({
  open,
  onOpenChange,
  hideSlug: hideSlugProp,
  hideInvite,
  onCompleted
}: CreateOrganizationDialogProps) {
  const { authClient, localization } = useAuth<OrganizationAuthClient>()
  const {
    additionalFields,
    localization: organizationLocalization,
    hideSlug: pluginHideSlug
  } = useAuthPlugin(organizationPlugin)
  const hideSlug = hideSlugProp ?? pluginHideSlug ?? false

  const qc = useQueryClient()
  const [slugEdited, setSlugEdited] = useState(false)
  /**
   * The workspace that now exists, and the flag that moves the dialog to its
   * second step.
   *
   * Both fields earn their place. The name, because the invite step says which
   * workspace it is filling and the form is about to be reset out from under
   * it. The id, because the invite step must not infer it — see `finishCreate`.
   */
  const [created, setCreated] = useState<{ id: string; name: string } | null>(
    null
  )
  const submissionGeneration = useRef(0)
  const submissionAttemptGeneration = useRef(0)

  const { mutateAsync: createOrganization } = useCreateOrganization(authClient)

  const form = useAuthForm({
    defaultValues: {
      additionalFields: getAdditionalFieldDefaultValues(additionalFields),
      logo: "",
      name: "",
      slug: ""
    },
    onSubmit: async ({ value }) => {
      const generation = submissionAttemptGeneration.current
      if (generation !== submissionGeneration.current) return
      const name = value.name.trim() || value.name
      const organization = await createOrganization({
        ...getAdditionalFieldSubmitValues(
          additionalFields,
          value.additionalFields
        ),
        // Omitted rather than sent empty: `logo` is nullish in the endpoint's
        // schema, and "" would be stored and then rendered as a broken image.
        ...(value.logo ? { logo: value.logo } : {}),
        name: value.name,
        slug: hideSlug ? undefined : value.slug
      })
      if (generation !== submissionGeneration.current) return

      /**
       * Make it the active workspace, explicitly.
       *
       * `organization.create` already does this server-side — it writes
       * `sessions.active_organization_id` unless told to keep the current one
       * — and that is not enough here. The API runs with
       * `session.cookieCache` on a five-minute age, so the browser goes on
       * presenting a cached session naming the *previous* workspace until it
       * expires. The row said one thing and every request said another; the
       * switcher kept showing the old name after a full page load, and it was
       * right to.
       *
       * `setActive` re-issues that cookie, which is the only thing that
       * actually moves the user. It is also why this is awaited before the
       * invite step renders: that step reads seats for the active workspace.
       */
      const organizationId = organization?.id
      if (organizationId) {
        await authClient.organization.setActive({ organizationId })
        /**
         * Everything keyed on "the active workspace" now describes the wrong
         * one, and the invite step is about to read the most load-bearing of
         * them: the seat limit it will not let somebody exceed. Invalidated
         * here rather than on that step's mount because this is the handler
         * that actually moved the user, and an effect would have to run twice
         * in development and cancel itself doing it.
         */
        await qc.invalidateQueries({ queryKey: ENTITLEMENTS_KEY })
      }
      if (generation !== submissionGeneration.current) return

      if (hideInvite || !organizationId) {
        onOpenChange(false)
        onCompleted?.()
        return
      }
      setCreated({ id: organizationId, name })
    }
  })

  useEffect(() => {
    if (!open) {
      submissionGeneration.current += 1
      form.reset()
      setSlugEdited(false)
      setCreated(null)
    }
  }, [form, open])

  /** Sending, skipping and dismissing the invite step are the same ending. */
  function finish() {
    onOpenChange(false)
    onCompleted?.()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Past the point of no return: the workspace exists, so closing the
        // dialog is skipping the invitations rather than cancelling anything.
        if (!next && created !== null) {
          finish()
          return
        }
        onOpenChange(next)
      }}
    >
      <DialogContent>
        {created !== null ? (
          <InviteTeammatesStep
            organizationId={created.id}
            organizationName={created.name}
            onDone={finish}
          />
        ) : (
          <form.AppForm>
            <form.AuthFormRoot
              className="flex flex-col gap-6"
              onBeforeSubmit={() => {
                submissionAttemptGeneration.current = submissionGeneration.current
              }}
            >
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Briefcase />
                  {organizationLocalization.createOrganization}
                </DialogTitle>

                <DialogDescription>
                  {organizationLocalization.organizationsDescription}
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-col gap-4">
                {/* Subscribed to the name so the empty circle fills with real
                    initials as it is typed — the one bit of feedback that
                    makes an optional logo feel like part of the workspace
                    rather than a chore attached to it. */}
                <form.Subscribe selector={(state) => state.values.name}>
                  {(name) => (
                    <form.AppField name="logo">
                      {(field) => (
                        <OrganizationLogoField
                          name={name}
                          value={field.state.value}
                          onChange={field.handleChange}
                        />
                      )}
                    </form.AppField>
                  )}
                </form.Subscribe>

                <form.AppField
                  name="name"
                  validators={{
                    onChange: ({ value }) =>
                      validateStringLength(value, {
                        requiredMessage: localization.auth.fieldRequired,
                        trim: true
                      })
                  }}
                >
                  {(field) => {
                    const isInvalid = isAuthFormFieldInvalid(field.state.meta)

                    return (
                      <Field data-invalid={isInvalid}>
                        <FieldLabel htmlFor="create-organization-name">
                          {organizationLocalization.name}
                        </FieldLabel>

                        <Input
                          id="create-organization-name"
                          name={field.name}
                          autoFocus
                          placeholder={organizationLocalization.namePlaceholder}
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(event) => {
                            const value = event.target.value
                            field.handleChange(value)
                            if (!slugEdited) {
                              form.setFieldValue("slug", sanitizeSlug(value))
                            }
                          }}
                          aria-invalid={isInvalid}
                        />

                        <field.AuthFormFieldError />
                      </Field>
                    )
                  }}
                </form.AppField>

                {!hideSlug && (
                  <form.AppField name="slug">
                    {(field) => (
                      <SlugField
                        id="create-organization-slug"
                        value={field.state.value}
                        onChange={(value) => {
                          field.handleChange(value)
                          setSlugEdited(true)
                        }}
                      />
                    )}
                  </form.AppField>
                )}

                {additionalFields.map((configuredField) => (
                  <form.AppField
                    key={configuredField.name}
                    name={`additionalFields.${configuredField.name}`}
                    validators={getAuthAdditionalFieldValidators(
                      configuredField,
                      localization.auth.fieldRequired
                    )}
                  >
                    {(field) => (
                      <field.AuthFormAdditionalField
                        field={configuredField}
                        optionalLabel={localization.settings.optional}
                      />
                    )}
                  </form.AppField>
                ))}
              </div>

              <DialogFooter>
                <DialogClose
                  className={buttonVariants({ variant: "outline" })}
                  type="button"
                >
                  {localization.settings.cancel}
                </DialogClose>

                <form.AuthFormSubmitButton>
                  {organizationLocalization.createOrganization}
                </form.AuthFormSubmitButton>
              </DialogFooter>
            </form.AuthFormRoot>
          </form.AppForm>
        )}
      </DialogContent>
    </Dialog>
  )
}
