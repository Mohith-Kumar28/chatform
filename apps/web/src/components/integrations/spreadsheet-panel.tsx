"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Download, FileSpreadsheet, Link2, RefreshCw, Sheet, Trash2 } from "lucide-react";
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
 * Spreadsheets: three ways to get responses into one, each named for what it does.
 *
 * Send to Google Sheets is the one most people want: one Connect button, and a sheet in the
 * author's Drive that every response is written to as it arrives. Download is a copy taken
 * once. The Excel link is for Excel, which has no Connect button, and re-reads a URL instead.
 *
 * The titles carry the meaning and each section's (i) carries the detail, so there is no
 * paragraph to read before finding the button.
 */

interface IntegrationRow {
  id: string;
  provider: string;
  status: string;
  feedUrl?: string;
  includePartials?: boolean;
  spreadsheetUrl?: string;
  spreadsheetTitle?: string | null;
  email?: string | null;
  lastSyncedAt?: number | null;
  lastError?: string | null;
  partialsLocked?: boolean;
}

function SectionTitle({ children, hint, status }: { children: string; hint: React.ReactNode; status?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <h3 className="text-h3">{children}</h3>
      <InfoHint label={`About: ${children}`} align="start">
        {hint}
      </InfoHint>
      {status}
    </div>
  );
}

/** A labelled fact. Every value in this panel sits beside the word that says what it is. */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 items-center gap-1">{children}</dd>
    </>
  );
}

/**
 * The Google Sheets connection: connect, open, sync, disconnect.
 *
 * Connecting leaves this page for Google and comes back to it with `?sheets=…`,
 * which `IntegrationsWorkspace` reads. A second form of the same person skips
 * Google entirely, so the answer can also be "connected" straight away.
 */
function GoogleSheetsSection({ formId, row, loading }: { formId: string; row?: IntegrationRow; loading: boolean }) {
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
    mutationFn: () => customFetch<IntegrationRow>(`${base}/sync`, { method: "POST" }),
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
      <SectionTitle
        hint={
          <>
            Each new response is added to a sheet in your Google Drive on its own: finished ones on the
            Completed tab, unfinished ones on the Partial tab. Chatform can only open the sheets it
            created. Sync now rewrites both tabs, so keep your own notes on a separate tab.
          </>
        }
        status={
          row &&
          (broken ? (
            <span className="ml-1 inline-flex items-center gap-1 text-[0.6875rem] font-medium text-[var(--warning-soft-foreground)]">
              <span className="size-1.5 rounded-full bg-[var(--warning)]" />
              Needs reconnect
            </span>
          ) : (
            <span className="ml-1 inline-flex items-center gap-1 text-[0.6875rem] font-medium text-[var(--success)]">
              <span className="size-1.5 rounded-full bg-[var(--success)]" />
              Connected
            </span>
          ))
        }
      >
        Send to Google Sheets
      </SectionTitle>

      {loading ? (
        <div className="bg-muted h-10 animate-pulse rounded-xl" />
      ) : !row ? (
        <Button size="sm" shape="pill" disabled={connect.isPending} onClick={() => connect.mutate()}>
          <Sheet className="size-3.5" />
          {connect.isPending ? "Connecting…" : "Connect Google Sheets"}
        </Button>
      ) : (
        <div className="space-y-3">
          <dl className="text-caption grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1.5">
            {row.spreadsheetUrl && (
              <Fact label="Your sheet">
                <a
                  href={row.spreadsheetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary inline-flex min-w-0 items-center gap-0.5 underline underline-offset-4"
                >
                  <span className="truncate">{row.spreadsheetTitle ?? "Open in Google Sheets"}</span>
                  <ArrowUpRight className="size-3.5 shrink-0" />
                </a>
                <CopyButton value={row.spreadsheetUrl} />
              </Fact>
            )}
            {row.email && (
              <Fact label="Google account">
                <span className="truncate">{row.email}</span>
              </Fact>
            )}
            {!broken && <Fact label="New responses">Added automatically</Fact>}
            <Fact label="Last updated">{row.lastSyncedAt ? new Date(row.lastSyncedAt).toLocaleString() : "Not yet"}</Fact>
            {row.partialsLocked && !broken && (
              <Fact label="Unfinished responses">
                <LockChip reason={{ feature: "export_partials" }} />
              </Fact>
            )}
            {broken && <Fact label="Problem">{row.lastError ?? "Google access was removed."}</Fact>}
          </dl>

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
                    <Sheet className="size-3.5" />
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
    queryFn: () => customFetch<IntegrationRow[]>(`/api/forms/${formId}/integrations`),
  });
  const rows = Array.isArray(data) ? data : [];
  const feed = rows.find((row) => row.provider === "spreadsheet_feed");
  const sheets = rows.find((row) => row.provider === "google_sheets");

  const save = useMutation({
    mutationFn: (body: { includePartials?: boolean; rotate?: boolean }) =>
      customFetch<IntegrationRow>(`/api/forms/${formId}/integrations/spreadsheet`, {
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
      toast.success("Link deleted. Any Excel file using it will stop updating.");
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const exportBase = `${API_ORIGIN}/api/forms/${formId}/submissions/export`;

  return (
    <div className="space-y-6">
      <GoogleSheetsSection formId={formId} row={sheets} loading={isLoading} />

      <hr className="border-border" />

      <section className="space-y-3">
        <SectionTitle
          hint={
            <>
              A copy of the responses collected so far, saved to your computer. It does not update:
              download again for newer responses. The Excel file keeps the leading zeros on phone
              numbers, which a CSV opened in Excel does not.
            </>
          }
        >
          Download once
        </SectionTitle>
        <div className="flex flex-wrap gap-2">
          {/* Through the browser so the session cookie rides along. */}
          <Button variant="outline" size="sm" shape="pill" asChild>
            <a href={`${exportBase}.xlsx`} download onClick={apiDownloadClick(`${exportBase}.xlsx`)}>
              <FileSpreadsheet className="size-3.5" />
              Excel file (.xlsx)
            </a>
          </Button>
          <Button variant="outline" size="sm" shape="pill" asChild>
            <a href={exportBase} download onClick={apiDownloadClick(exportBase)}>
              <Download className="size-3.5" />
              CSV file (.csv)
            </a>
          </Button>
        </div>
      </section>

      <hr className="border-border" />

      <section className="space-y-3">
        <SectionTitle
          hint={
            <>
              For Excel, which has no Connect button. Create a link, then in Excel choose Data, From Web
              and paste it. Excel re-reads the link on its own, so the file fills with new responses.
              Anyone who has the link can read the responses, so treat it like a password.
            </>
          }
        >
          Keep an Excel file updated
        </SectionTitle>

        {isLoading ? (
          <div className="bg-muted h-10 animate-pulse rounded-xl" />
        ) : feed?.feedUrl ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-caption font-normal">Link to paste into Excel</Label>
              <div className="flex gap-2">
                <Input readOnly value={feed.feedUrl} className="font-mono text-xs" />
                <CopyButton value={feed.feedUrl} label="Copy" variant="outline" />
              </div>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Label htmlFor="feed-partials" className="text-sm">
                  Include unfinished responses
                </Label>
                {!canPartials && <LockChip reason={{ feature: "export_partials" }} />}
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
                    { onSuccess: () => toast.success("New link created. Update any Excel file using the old one.") },
                  )
                }
              >
                <RefreshCw className="size-3.5" />
                Replace link
              </Button>
              <Button
                variant="ghost"
                size="sm"
                shape="pill"
                className="text-destructive hover:text-destructive"
                onClick={() => setConfirmRevoke(true)}
              >
                <Trash2 className="size-3.5" />
                Delete link
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            shape="pill"
            disabled={save.isPending}
            onClick={() => save.mutate({ includePartials: false })}
          >
            <Link2 className="size-3.5" />
            {save.isPending ? "Creating…" : "Create Excel link"}
          </Button>
        )}
      </section>

      <ConfirmDialog
        open={confirmRevoke}
        onOpenChange={setConfirmRevoke}
        title="Delete this link?"
        description="Any Excel file using it stops updating straight away. You can create a new link, but you'll have to paste it in again."
        confirmLabel="Delete link"
        destructive
        onConfirm={() => revoke.mutate()}
      />
    </div>
  );
}
