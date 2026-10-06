"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { patchApiAdminCampaignLinksById, postApiAdminCampaignsByIdLinks } from "@/lib/api/admin/admin";
import type { GetApiAdminCampaignsById200LinksItem, PostApiAdminCampaignsByIdLinks200 } from "@/lib/api/generated.schemas";
import { apiData } from "@/lib/api/payload";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useRefreshCampaigns } from "./campaign-dialog";
import { DESTINATIONS, shortUrl, type Channel } from "./presets";

type LinkRow = GetApiAdminCampaignsById200LinksItem;

const OTHER_PAGE = "__other";
/** What the label is for, per channel: the one thing that tells two links of a campaign apart. */
const LABEL_HINT: Record<string, string> = {
  google_ads: "Ad group or keyword",
  paid_social: "Ad or audience",
  x_post: "Which post",
  linkedin_post: "Which post",
  newsletter: "Which issue",
  cold_outreach: "Which list or sequence",
  partner: "Partner's name",
  creator: "Creator's name",
  community: "Which community or thread",
  launch: "Which launch",
  video: "Which video",
  qr: "Where it is printed",
  other: "Where it is posted",
};

/**
 * Make a link, or edit one. Three questions: where it goes, where it will be
 * posted, and what to call it. The tags follow from the channel, so nobody types
 * a medium; they can still be set by hand under Advanced, along with the short
 * code.
 */
export function LinkDialog({
  open,
  onOpenChange,
  campaignId,
  channels,
  link,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  channels: Channel[];
  link?: LinkRow;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        {open && <LinkForm campaignId={campaignId} channels={channels} link={link} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function LinkForm({ campaignId, channels, link, onClose }: { campaignId: string; channels: Channel[]; link?: LinkRow; onClose: () => void }) {
  const refresh = useRefreshCampaigns();
  const known = DESTINATIONS.some(([path]) => path === (link?.destination ?? "/"));
  const [page, setPage] = useState(known ? (link?.destination ?? "/") : OTHER_PAGE);
  const [path, setPath] = useState(known ? "" : (link?.destination ?? ""));
  const [channel, setChannel] = useState(link?.channel ?? channels[0]?.key ?? "other");
  const [label, setLabel] = useState(link?.label ?? "");
  const preset = channels.find((c) => c.key === channel);
  const [platform, setPlatform] = useState(link && preset?.source === "pick" && preset.sources.includes(link.source) ? link.source : "");
  const [advanced, setAdvanced] = useState(false);
  const [source, setSource] = useState("");
  const [medium, setMedium] = useState("");
  const [content, setContent] = useState("");
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);

  const destination = page === OTHER_PAGE ? path.trim() : page;
  const picked = preset?.source === "pick" ? platform || preset.sources[0] : undefined;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!destination.startsWith("/")) {
      toast.error("The page has to be a path on chatform, starting with /");
      return;
    }
    const typed = {
      ...(source.trim() ? { source: source.trim() } : picked ? { source: picked } : {}),
      ...(medium.trim() ? { medium: medium.trim() } : {}),
      ...(content.trim() ? { content: content.trim() } : {}),
      ...(code.trim() ? { code: code.trim().toLowerCase() } : {}),
    };
    setSaving(true);
    try {
      if (link) {
        // Only what changed is sent: a link whose channel and label are untouched keeps the exact tags it was shared with.
        const retag = channel !== link.channel || label.trim() !== link.label || (picked !== undefined && picked !== link.source);
        await patchApiAdminCampaignLinksById(link.id, {
          ...(destination !== link.destination ? { destination } : {}),
          ...(retag ? { channel, label: label.trim() } : {}),
          ...typed,
        });
      } else {
        const made = apiData<PostApiAdminCampaignsByIdLinks200>(
          await postApiAdminCampaignsByIdLinks(campaignId, { destination, channel, label: label.trim(), ...typed }),
        );
        await navigator.clipboard.writeText(shortUrl(made.code)).then(
          () => toast.success("Link copied"),
          () => toast.success("Link created"),
        );
      }
      await refresh();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the link");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{link ? "Edit link" : "New link"}</DialogTitle>
      </DialogHeader>

      <div className="grid gap-1.5">
        <Label htmlFor="link-label">Name</Label>
        <Input
          id="link-label"
          autoFocus
          required
          maxLength={120}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={LABEL_HINT[channel] ?? LABEL_HINT.other}
        />
      </div>

      <div className="grid gap-1.5">
        <Label>Where it will be posted</Label>
        <div className="flex gap-2">
          <Select value={channel} onValueChange={setChannel}>
            <SelectTrigger aria-label="Channel" className="min-w-0 flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {channels.map((c) => (
                <SelectItem key={c.key} value={c.key}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {preset?.source === "pick" && (
            <Select value={picked} onValueChange={setPlatform}>
              <SelectTrigger aria-label="Platform" className="w-40 capitalize">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {preset.sources.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label>Where it goes</Label>
        <Select value={page} onValueChange={setPage}>
          <SelectTrigger aria-label="Page" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DESTINATIONS.map(([value, text]) => (
              <SelectItem key={value} value={value}>
                {text}
              </SelectItem>
            ))}
            <SelectItem value={OTHER_PAGE}>Another page</SelectItem>
          </SelectContent>
        </Select>
        {page === OTHER_PAGE && (
          <Input aria-label="Path" required value={path} onChange={(e) => setPath(e.target.value)} placeholder="/blog/a-post or /f/a-form" maxLength={300} />
        )}
      </div>

      <div>
        <button
          type="button"
          onClick={() => setAdvanced((a) => !a)}
          aria-expanded={advanced}
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronRight className={cn("size-3.5 transition-transform", advanced && "rotate-90")} />
          Advanced
        </button>
        {advanced && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="link-code">Short code</Label>
              <Input id="link-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder={link?.code ?? "Made for you"} maxLength={40} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="link-source">Source</Label>
              <Input id="link-source" value={source} onChange={(e) => setSource(e.target.value)} placeholder={link?.source ?? picked ?? preset?.sources[0] ?? "From the name"} maxLength={60} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="link-medium">Medium</Label>
              <Input id="link-medium" value={medium} onChange={(e) => setMedium(e.target.value)} placeholder={link?.medium ?? preset?.medium} maxLength={60} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="link-content">Content</Label>
              <Input id="link-content" value={content} onChange={(e) => setContent(e.target.value)} placeholder={link?.content ?? "From the name"} maxLength={100} />
            </div>
          </div>
        )}
      </div>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving || !label.trim() || !destination}>
          {link ? "Save" : "Create and copy"}
        </Button>
      </DialogFooter>
    </form>
  );
}
