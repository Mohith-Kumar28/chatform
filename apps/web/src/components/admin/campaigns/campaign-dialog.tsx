"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { patchApiAdminCampaignsById, postApiAdminCampaigns } from "@/lib/api/admin/admin";
import type { GetApiAdminCampaignsById200Campaign } from "@/lib/api/generated.schemas";
import { apiData } from "@/lib/api/payload";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CURRENCIES, fromDateInput, toDateInput } from "./presets";

type Campaign = GetApiAdminCampaignsById200Campaign;

/** Every campaigns query, list and detail, whatever its period: a change shows everywhere at once. */
export function useRefreshCampaigns() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/admin/campaigns") });
}

/**
 * Start a campaign, or edit one. A name is all it needs; when it runs and what
 * it cost are there for when somebody knows.
 *
 * `adopt` is a campaign name already out on links nobody saved here: the new
 * campaign takes that exact key, so everything those links brought is its own.
 */
export function CampaignDialog({
  open,
  onOpenChange,
  campaign,
  adopt,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaign?: Campaign;
  adopt?: string;
  onSaved?: (campaign: Campaign) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        {/* Mounted with the dialog, so every opening starts from what is saved. */}
        {open && <CampaignForm campaign={campaign} adopt={adopt} onDone={onSaved} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function CampaignForm({ campaign, adopt, onDone, onClose }: { campaign?: Campaign; adopt?: string; onDone?: (campaign: Campaign) => void; onClose: () => void }) {
  const refresh = useRefreshCampaigns();
  const [name, setName] = useState(campaign?.name ?? adopt ?? "");
  const [notes, setNotes] = useState(campaign?.notes ?? "");
  const [starts, setStarts] = useState(toDateInput(campaign?.startsAt));
  const [ends, setEnds] = useState(toDateInput(campaign?.endsAt));
  const [spend, setSpend] = useState(campaign?.spendCents != null ? String(campaign.spendCents / 100) : "");
  const [currency, setCurrency] = useState(campaign?.spendCurrency ?? "USD");
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const amount = spend.trim() === "" ? null : Math.round(Number(spend) * 100);
    if (amount != null && (!Number.isFinite(amount) || amount < 0)) {
      toast.error("Spend has to be a number");
      return;
    }
    const body = {
      name: name.trim(),
      notes: notes.trim() || null,
      startsAt: fromDateInput(starts),
      endsAt: fromDateInput(ends),
      spendCents: amount,
      spendCurrency: currency,
    };
    setSaving(true);
    try {
      const saved = apiData<Campaign>(
        campaign ? await patchApiAdminCampaignsById(campaign.id, body) : await postApiAdminCampaigns({ ...body, ...(adopt ? { key: adopt } : {}) }),
      );
      await refresh();
      onDone?.(saved);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the campaign");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{campaign ? "Edit campaign" : "New campaign"}</DialogTitle>
      </DialogHeader>
      <div className="grid gap-1.5">
        <Label htmlFor="campaign-name">Name</Label>
        <Input id="campaign-name" autoFocus required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="October launch" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="campaign-starts">Starts</Label>
          <Input id="campaign-starts" type="date" value={starts} onChange={(e) => setStarts(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="campaign-ends">Ends</Label>
          <Input id="campaign-ends" type="date" value={ends} min={starts || undefined} onChange={(e) => setEnds(e.target.value)} />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="campaign-spend">Spend</Label>
        <div className="flex gap-2">
          <Input
            id="campaign-spend"
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={spend}
            onChange={(e) => setSpend(e.target.value)}
            placeholder="Optional"
          />
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger aria-label="Currency" className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="campaign-notes">Notes</Label>
        <Textarea id="campaign-notes" rows={3} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving || !name.trim()}>
          {campaign ? "Save" : "Create campaign"}
        </Button>
      </DialogFooter>
    </form>
  );
}
