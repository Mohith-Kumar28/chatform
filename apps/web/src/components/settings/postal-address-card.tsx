"use client";

import { useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth/auth-client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * The postal address that goes in the footer of follow-up reminders.
 *
 * Not optional decoration: a reminder to somebody who abandoned a form is
 * commercial email, and CAN-SPAM requires the sender's physical address on every
 * commercial message. Follow-ups stay switched off until this is filled in — so
 * this card is the thing standing between an author and the feature, which is
 * why it explains itself rather than sitting behind a tooltip.
 *
 * Written through Better Auth's own organization update endpoint: `postalAddress`
 * is declared as an additional field on the plugin, so there is one endpoint and
 * one copy of the record.
 */
export function PostalAddressCard({
  organizationId,
  initialValue,
}: {
  organizationId: string;
  initialValue: string | null;
}) {
  /**
   * The org loads asynchronously, so the first render arrives with no address
   * even for an org that has one. Keying off the loaded value and adjusting
   * during render is React's own answer to that — an effect that calls
   * `setState` would render once with the stale value and again with the real
   * one, which is a visible flash of an empty box on a field people have
   * already filled in.
   */
  const loaded = initialValue ?? "";
  const [seen, setSeen] = useState(loaded);
  const [value, setValue] = useState(loaded);
  const [saving, setSaving] = useState(false);
  if (seen !== loaded) {
    setSeen(loaded);
    setValue(loaded);
  }

  const dirty = value.trim() !== loaded.trim();

  async function save() {
    setSaving(true);
    try {
      const { error } = await authClient.organization.update({
        organizationId,
        data: { postalAddress: value.trim() } as { postalAddress: string },
      });
      if (error) throw new Error(error.message ?? "Could not save");
      toast.success("Business address saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border p-5">
      <div>
        <h3 className="text-sm font-medium">Business address</h3>
        <p className="text-muted-foreground mt-1 text-xs">
          Required by law at the bottom of follow-up emails.
        </p>
      </div>
      <Textarea
        className="min-h-20 max-w-xl"
        value={value}
        placeholder={"Acme Ltd\n4th Floor, MG Road\nBengaluru 560001, India"}
        onChange={(e) => setValue(e.target.value)}
      />
      <Button size="sm" disabled={!dirty || saving} onClick={() => void save()}>
        {saving ? "Saving…" : "Save address"}
      </Button>
    </div>
  );
}
