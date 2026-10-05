"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, ExternalLink, FileSpreadsheet, Link2, RefreshCw, Sheet, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CopyButton } from "@/components/ui/copy-button";
import { InfoHint } from "@/components/ui/info-hint";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { LockChip } from "@/components/billing/gate";
import { useEntitlements } from "@/hooks/use-entitlements";
import { API_ORIGIN, customFetch } from "@/lib/api/mutator";
import { apiDownloadClick } from "@/lib/api/download";

/**
 * Spreadsheets.
 *
 * Google Sheets first: one Connect button, Google's own consent screen, and a
 * sheet in the author's Drive that every response is written to as it arrives.
 * Completed responses on one tab, unfinished ones on another.
 *
 * Under it, what serves everything else: real `.xlsx` and `.csv` downloads, and
 * a feed URL that Excel refreshes on its own.
 */

interface FeedRow {
  id: string;
  provider: string;
  status: string;
  feedUrl?: string;
  includePartials?: boolean;
  spreadsheetUrl?: string;
  email?: string | null;
  lastSyncedAt?: number | null;
  lastError?: string | null;
  partialsLocked?: boolean;
}

/**
 * The Google Sheets connection: connect, open, sync, disconnect.
 *
 * Connecting leaves this page for Google and comes back to it with `?sheets=…`,
 * which `IntegrationsWorkspace` reads. A second form of the same person skips
 * Google entirely, so the answer can also be "connected" straight away.
 */
function GoogleSheetsSection({ formId, row, loading }: { formId: string; row?: FeedRow; loading: boolean }) {
  const queryClient = useQueryClient();
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const queryKey = ["integrations", formId];
  const base = `/api/forms/${formId}/integrations/google-sheets`;

  const connect = useMutation({
    mutationFn: () =>
      customFetch<{ url?: string; connected?: boolean }>(`${base}/start`, {
        method: "POST",
        body: JSON.stringify({ returnTo: `${window.location.origin}/forms/${formId}/integrate` }),
      }),
    onSuccess: (res) => {
      if (res.url) {
        window.location.assign(res.url);
        return;
      }
      toast.success("Google Sheet created. New responses will appear in it.");
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const sync = useMutation({
    mutationFn: () => customFetch<FeedRow>(`${base}/sync`, { method: "POST" }),
    onSuccess: () => toast.success("Sheet updated."),
    onError: (err: Error) => toast.error(err.message),
    onSettled: () => void queryClient.invalidateQueries({ queryKey }),
  });

  const disconnect = useMutation({
    mutationFn: () => customFetch(base, { method: "DELETE" }),
    onSuccess: () => {
      setConfirmDisconnect(false);
      toast.success("Disconnected. The sheet stays in your Google Drive.");
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const broken = row?.status === "needs_reconnect";

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-1.5">
        <h3 className="text-h3">Google Sheets</h3>
        <InfoHint label="About Google Sheets" align="start">
          Every response is added to a sheet in your Google Drive as it arrives: finished ones on the
          Completed tab, unfinished ones on the Partial tab. Chatform can only open sheets it created.
          Sync now rewrites both tabs, so keep your own notes on a separate tab.
        </InfoHint>
      </div>

      {loading ? (
        <div className="bg-muted h-10 animate-pulse rounded-xl" />
      ) : !row ? (
        <Button size="sm" shape="pill" disabled={connect.isPending} onClick={() => connect.mutate()}>
          <Sheet className="size-3.5" />
          {connect.isPending ? "Connecting…" : "Connect Google Sheets"}
        </Button>
      ) : (
        <div className="space-y-3">
          <dl className="text-caption grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
            {row.email && (
              <>
                <dt className="text-muted-foreground">Google account</dt>
                <dd className="truncate">{row.email}</dd>
              </>
            )}
            <dt className="text-muted-foreground">Last updated</dt>
            <dd>{row.lastSyncedAt ? new Date(row.lastSyncedAt).toLocaleString() : "Not yet"}</dd>
            {row.partialsLocked && !broken && (
              <>
                <dt className="text-muted-foreground">Partial responses</dt>
                <dd>
                  <LockChip reason={{ feature: "export_partials" }} />
                </dd>
              </>
            )}
          </dl>

          {broken && (
            <p className="text-caption text-[var(--warning-soft-foreground)]">
              {row.lastError ?? "Google access was removed."} Reconnect to keep the sheet updating.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {broken ? (
              <Button size="sm" shape="pill" disabled={connect.isPending} onClick={() => connect.mutate()}>
                <RefreshCw className="size-3.5" />
                {connect.isPending ? "Connecting…" : "Reconnect"}
              </Button>
            ) : (
              <>
                <Button size="sm" shape="pill" asChild>
                  <a href={row.spreadsheetUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="size-3.5" />
                    Open sheet
                  </a>
                </Button>
                <Button variant="outline" size="sm" shape="pill" disabled={sync.isPending} onClick={() => sync.mutate()}>
                  <RefreshCw className={sync.isPending ? "size-3.5 animate-spin" : "size-3.5"} />
                  {sync.isPending ? "Syncing…" : "Sync now"}
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="sm"
              shape="pill"
              className="text-destructive hover:text-destructive"
              onClick={() => setConfirmDisconnect(true)}
            >
              <Trash2 className="size-3.5" />
              Disconnect
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDisconnect}
        onOpenChange={setConfirmDisconnect}
        title="Disconnect Google Sheets?"
        description="New responses stop being added. The sheet and everything in it stays in your Google Drive."
        confirmLabel="Disconnect"
        destructive
        onConfirm={() => disconnect.mutate()}
      />
    </section>
  );
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
  const rows = Array.isArray(data) ? data : [];
  const feed = rows.find((row) => row.provider === "spreadsheet_feed");
  const sheets = rows.find((row) => row.provider === "google_sheets");

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
      <GoogleSheetsSection formId={formId} row={sheets} loading={isLoading} />

      <hr className="border-border" />

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
            <a href={`${exportBase}.xlsx`} download onClick={apiDownloadClick(`${exportBase}.xlsx`)}>
              <FileSpreadsheet className="size-3.5" />
              Excel workbook
            </a>
          </Button>
          <Button variant="outline" size="sm" shape="pill" asChild>
            <a href={exportBase} download onClick={apiDownloadClick(exportBase)}>
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
          <h3 className="text-h3">Live link for Excel</h3>
          <p className="text-muted-foreground text-caption">
            One URL Excel re-reads on its own.
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

            <p className="text-muted-foreground text-micro">
              In Excel: <strong>Data → From Web</strong>, then paste the URL.
            </p>

            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Label htmlFor="feed-partials" className="text-sm">
                    Include unfinished responses
                  </Label>
                  {!canPartials && <LockChip reason={{ feature: "export_partials" }} />}
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
              Create a link and paste it into Excel once. It stays current after that.
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
