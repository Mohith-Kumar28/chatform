import { authClient } from "@/lib/auth/auth-client";
import { switchOrganization } from "@/lib/api/persist";

/**
 * Accept an invitation and land inside what it opened.
 *
 * Shared by the email link's page, the dashboard prompt and Settings, so all
 * three end in the same place: the invited organization, on the first
 * workspace the invitation named, rather than whichever workspace this browser
 * last viewed somewhere else.
 *
 * Accepting writes the new active organization to the session row but leaves
 * the 5-minute session cookie cache alone, so the header kept naming the old
 * organization. `setActive` re-issues that cookie, and the switch is a full
 * navigation for the same reason. Throws with Better Auth's message on failure.
 */
export async function acceptAndEnter(invitationId: string, workspaceSlug?: string | null): Promise<void> {
  const res = await authClient.organization.acceptInvitation({ invitationId });
  if (res.error) throw new Error(res.error.message ?? "Could not accept this invitation.");
  const href = workspaceSlug ? `/dashboard?ws=${encodeURIComponent(workspaceSlug)}` : "/dashboard";
  const organizationId = res.data?.member?.organizationId;
  if (organizationId) await switchOrganization(authClient.organization.setActive, organizationId, href);
  else window.location.assign(href);
}
