"use client";

import { Archive, ArchiveRestore, Link2, MoreHorizontal, Pencil, QrCode } from "lucide-react";
import { toast } from "sonner";
import { patchApiAdminCampaignLinksById } from "@/lib/api/admin/admin";
import type { GetApiAdminCampaignsById200LinksItem } from "@/lib/api/generated.schemas";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { qrSvg } from "@/lib/qr";
import { useRefreshCampaigns } from "./campaign-dialog";
import { longUrl, shortUrl } from "./presets";

type LinkRow = GetApiAdminCampaignsById200LinksItem;

/** The link's short address as a QR code, saved as an SVG that prints at any size. */
function downloadQr(link: LinkRow) {
  const a = document.createElement("a");
  a.href = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg(shortUrl(link.code), 8))}`;
  a.download = `${link.code}-qr.svg`;
  a.click();
}

/** Everything a link's row can do beyond copying its short address. */
export function LinkRowActions({ link, onEdit }: { link: LinkRow; onEdit: () => void }) {
  const refresh = useRefreshCampaigns();

  async function setArchived(archived: boolean) {
    try {
      await patchApiAdminCampaignLinksById(link.id, { archived });
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the link");
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`More for ${link.label}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onSelect={() =>
            navigator.clipboard.writeText(longUrl(link.target)).then(
              () => toast.success("Long link copied"),
              () => toast.error("Your browser blocked the clipboard"),
            )
          }
        >
          <Link2 /> Copy long link
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => downloadQr(link)}>
          <QrCode /> Download QR code
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onEdit}>
          <Pencil /> Edit
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {link.archived ? (
          <DropdownMenuItem onSelect={() => setArchived(false)}>
            <ArchiveRestore /> Restore
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={() => setArchived(true)}>
            <Archive /> Archive
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
