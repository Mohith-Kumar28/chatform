"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileSpreadsheet, Link2, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CopyButton } from "@/components/ui/copy-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { LockChip } from "@/components/billing/gate";
import { useEntitlements } from "@/hooks/use-entitlements";
import { API_ORIGIN, customFetch } from "@/lib/api/mutator";

/**
 * Spreadsheets.
 *
 * Two different requests wear the same word. "Give me the responses in Excel"
 * wants a file; "keep a sheet up to date" wants a subscription. A download
 * answers the first and quietly fails the second — someone has to remember to
 * take it again, and the version in the shared drive is always yesterday's.
 *
 * So: real `.xlsx` and `.csv` downloads, and one feed URL that Google Sheets
 * and Excel refresh on their own. No Google account, no OAuth consent screen,
 * no connector to authorise — the URL is the whole integration, and it can be
 * rotated or revoked from this panel.
 */

interface FeedRow {
  id: string;
  provider: string;
  status: string;
  feedUrl?: string;
  includePartials?: boolean;
}

export function SpreadsheetPanel({ formId }: { formId: string }) {
  const queryClient = useQueryClient();
  const { can } = useEntitlements();
  const canPartials = can("export_partials");
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const queryKey = ["integrations", formId];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => customFetch<FeedRow[]>(`/api/forms/${formId}/integrations`),
  });
  const feed = (Array.isArray(data) ? data : []).find((row) => row.provider === "spreadsheet_feed");

  const save = useMutation({
    mutationFn: (body: { includePartials?: boolean; rotate?: boolean }) =>
      customFetch<FeedRow>(`/api/forms/${formId}/integrations/spreadsheet`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey }),
  });

  const revoke = useMutation({
    mutationFn: () =>
      customFetch(`/api/forms/${formId}/integrations/spreadsheet`, { method: "DELETE" }),
    onSuccess: () => {
      setConfirmRevoke(false);
      toast.success("Feed revoked. Any sheet pointing at it will stop updating.");
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const exportBase = `${API_ORIGIN}/api/forms/${formId}/submissions/export`;

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <div>
          <h3 className="text-h3">Download a file</h3>
          <p className="text-muted-foreground text-caption">
            A snapshot of everything collected so far.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Through the browser so the session cookie rides along. */}
          <Button variant="outline" size="sm" shape="pill" asChild>
            <a href={`${exportBase}.xlsx`} download>
              <FileSpreadsheet className="size-3.5" />
              Excel workbook
            </a>
          </Button>
          <Button variant="outline" size="sm" shape="pill" asChild>
            <a href={exportBase} download>
              <Download className="size-3.5" />
              CSV
            </a>
          </Button>
        </div>
        <p className="text-muted-foreground text-micro">
          The workbook keeps a frozen header, filters and column widths — and it keeps the
          leading zeros on phone numbers, which a CSV opened in Excel does not.
        </p>
      </section>

      <hr className="border-border" />

      <section className="space-y-3">
        <div>
          <h3 className="text-h3">Live feed</h3>
          <p className="text-muted-foreground text-caption">
            One URL your spreadsheet re-reads on its own. New responses appear without anyone
            exporting anything.
          </p>
        </div>

        {isLoading ? (
          <div className="bg-muted h-20 animate-pulse rounded-xl" />
        ) : feed?.feedUrl ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-caption font-normal">Feed URL</Label>
              <div className="flex gap-2">
                <Input readOnly value={feed.feedUrl} className="font-mono text-xs" />
                <CopyButton value={feed.feedUrl} label="Copy" variant="outline" />
              </div>
              {/*
                Said plainly, because the consequence is not obvious: a
                spreadsheet cannot send a cookie or a header, so the link is the
                credential and anyone holding it can read the responses.
              */}
              <p className="text-muted-foreground text-micro">
                Anyone with this link can read these responses — a sheet can&apos;t send a
                password. Rotate it if it ends up somewhere it shouldn&apos;t.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground text-caption font-normal">
                Paste into cell A1 of a Google Sheet
              </Label>
              <div className="flex gap-2">
                <pre className="bg-muted text-caption min-w-0 flex-1 overflow-x-auto rounded-xl p-3 font-mono">
                  <code>{`=IMPORTDATA("${feed.feedUrl}")`}</code>
                </pre>
                <CopyButton
                  value={`=IMPORTDATA("${feed.feedUrl}")`}
                  label="Copy"
                  variant="outline"
                  className="self-start"
                />
              </div>
              <p className="text-muted-foreground text-micro">
                In Excel: <strong>Data → From Web</strong>, paste the same URL. Both refresh on
                their own schedule — roughly hourly in Sheets.
              </p>
            </div>

            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Label htmlFor="feed-partials" className="text-sm">
                    Include unfinished responses
                  </Label>
                  {!canPartials && <LockChip feature="export_partials" />}
                </div>
                <p className="text-muted-foreground text-micro">
                  What people told you before they left.
                </p>
              </div>
              <Switch
                id="feed-partials"
                checked={feed.includePartials ?? false}
                disabled={!canPartials || save.isPending}
                onCheckedChange={(value) => save.mutate({ includePartials: value })}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                shape="pill"
                disabled={save.isPending}
                onClick={() =>
                  save.mutate(
                    { includePartials: feed.includePartials ?? false, rotate: true },
                    {
                      onSuccess: () =>
                        toast.success("New URL issued. Update any sheet using the old one."),
                    },
                  )
                }
              >
                <RefreshCw className="size-3.5" />
                Rotate URL
              </Button>
              <Button
                variant="ghost"
                size="sm"
                shape="pill"
                className="text-destructive hover:text-destructive"
                onClick={() => setConfirmRevoke(true)}
              >
                <Trash2 className="size-3.5" />
                Revoke
              </Button>
            </div>
          </div>
        ) : (
          <div className="bg-muted/30 space-y-3 rounded-xl px-5 py-6 text-center">
            <p className="text-muted-foreground text-body text-balance">
              Create a link and paste it into Google Sheets or Excel once. It stays current
              after that.
            </p>
            <Button
              size="sm"
              shape="pill"
              disabled={save.isPending}
              onClick={() => save.mutate({ includePartials: false })}
            >
              <Link2 className="size-3.5" />
              {save.isPending ? "Creating…" : "Create feed URL"}
            </Button>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={confirmRevoke}
        onOpenChange={setConfirmRevoke}
        title="Revoke this feed?"
        description="Any spreadsheet pointing at this URL stops updating immediately and shows an error in the cell. You can create a new one, but you'll have to paste it in again."
        confirmLabel="Revoke"
        destructive
        onConfirm={() => revoke.mutate()}
      />
    </div>
  );
}
