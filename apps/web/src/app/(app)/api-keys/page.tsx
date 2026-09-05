"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetApiKeys,
  usePostApiKeys,
  useDeleteApiKeysById,
  usePostApiKeysByIdRotate,
  useGetApiKeysScopes,
  getGetApiKeysQueryKey,
} from "@/lib/api/dashboard/dashboard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CopyButton } from "@/components/ui/copy-button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LockedControl } from "@/components/billing/gate";
import { KeyRound, Plus, Trash2, RefreshCw, ShieldAlert } from "lucide-react";
import { useClientValue } from "@/hooks/use-client-value";
import { ApiError } from "@/lib/api/mutator";

/**
 * API keys.
 *
 * The backend grew four key types, real scopes, per-key rate limits, origin
 * allowlists and rotation; this page could create one thing, called it "a key",
 * and listed keys by their creator so a teammate could not revoke a colleague's.
 * Everything here is driven by the generated hooks — the old page hand-wrote its
 * own row type over raw fetches, which is how it drifted from the API in the
 * first place.
 */

type KeyType = "sk_live" | "sk_test" | "pk_live" | "pk_test";

interface KeyRow {
  id: string;
  name: string | null;
  keyType: KeyType;
  environment: "live" | "test";
  start: string | null;
  enabled: boolean;
  scopes: Record<string, string[]>;
  origins: string[];
  formIds: string[];
  rateLimitMax: number | null;
  requestCount: number;
  lastUsedAt: number | null;
  expiresAt: number | null;
  createdAt: number;
}

const KEY_TYPES: { value: KeyType; label: string; blurb: string }[] = [
  { value: "sk_live", label: "Secret · live", blurb: "Your server, real data. Never send one from a browser." },
  { value: "sk_test", label: "Secret · test", blurb: "Your server. Everything it writes is test data." },
  { value: "pk_live", label: "Publishable · live", blurb: "Safe in a page, pinned to the origins you list." },
  { value: "pk_test", label: "Publishable · test", blurb: "Safe in a page. Writes test data." },
];

/** What a publishable key may ever hold, whatever is asked for. */
const PUBLISHABLE_CEILING: Record<string, string[]> = {
  form: ["read"],
  session: ["create", "write", "read"],
  file: ["write"],
};

function isPublishable(type: KeyType) {
  return type.startsWith("pk_");
}

/**
 * Both of these take `now` rather than reading the clock.
 *
 * `Date.now()` in a render body is impure — and here it would also disagree
 * between the server render and the first client one. The clock is read once,
 * through `useClientValue`, which is the repo's shape for a browser-only value.
 */
function relative(ts: number | null, now: number): string {
  if (!ts) return "never";
  const days = Math.floor((now - ts) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

function hoursUntil(ts: number, now: number): number {
  return Math.max(1, Math.round((ts - now) / 3_600_000));
}

export default function ApiKeysPage() {
  const queryClient = useQueryClient();
  // Read once per mount, so the server and first client renders agree.
  const now = useClientValue(() => Date.now(), 0);
  const { data: rawKeys, isLoading } = useGetApiKeys();
  const keys = (Array.isArray(rawKeys) ? rawKeys : []) as unknown as KeyRow[];
  const { data: rawVocab } = useGetApiKeysScopes();
  const vocab = (rawVocab ?? {}) as { scopes?: Record<string, string[]> };

  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<{ key: string; keyType: KeyType } | null>(null);
  const [revoking, setRevoking] = useState<KeyRow | null>(null);
  const [rotating, setRotating] = useState<KeyRow | null>(null);
  const [rotated, setRotated] = useState<{ key: string; oldKeyExpiresAt: number | null } | null>(null);
  /**
   * Refusals, shown where they happened.
   *
   * A 402 opens the global paywall, but a 403 (your role cannot mint keys) and
   * a 422 (that origin is not a URL) deliberately fall through to the caller —
   * and nothing here was catching them, so those clicks did nothing at all and
   * said nothing about why.
   */
  const [formError, setFormError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const [name, setName] = useState("Production key");
  const [keyType, setKeyType] = useState<KeyType>("sk_live");
  const [origins, setOrigins] = useState("");
  const [scopes, setScopes] = useState<Record<string, string[]>>({
    form: ["read"],
    response: ["read"],
    session: ["create", "write", "read"],
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: getGetApiKeysQueryKey() });
  const createKey = usePostApiKeys({ mutation: { onSuccess: invalidate } });
  const revokeKey = useDeleteApiKeysById({ mutation: { onSuccess: invalidate } });
  const rotateKey = usePostApiKeysByIdRotate({ mutation: { onSuccess: invalidate } });

  /**
   * The vocabulary comes from the API rather than a copy of it here — a scope
   * added server-side should appear without a frontend release.
   */
  const allScopes = useMemo(
    () => vocab.scopes ?? { form: ["read"], response: ["read"], session: ["create", "write", "read"] },
    [vocab.scopes],
  );

  const availableScopes = isPublishable(keyType) ? PUBLISHABLE_CEILING : allScopes;

  function toggleScope(resource: string, action: string) {
    setScopes((prev) => {
      const current = prev[resource] ?? [];
      const next = current.includes(action) ? current.filter((a) => a !== action) : [...current, action];
      const out = { ...prev, [resource]: next };
      if (next.length === 0) delete out[resource];
      return out;
    });
  }

  function messageFor(err: unknown): string {
    return err instanceof ApiError ? err.message : "Something went wrong. Please try again.";
  }

  async function submit() {
    setFormError(null);
    const parsedOrigins = origins
      .split(/[\n,]/)
      .map((o) => o.trim())
      .filter(Boolean);
    try {
      const result = (await createKey.mutateAsync({
        data: {
          name,
          keyType,
          scopes: isPublishable(keyType) ? PUBLISHABLE_CEILING : scopes,
          ...(parsedOrigins.length ? { origins: parsedOrigins } : {}),
        } as never,
      })) as unknown as { key: string };
      setCreated({ key: result.key, keyType });
    } catch (err) {
      setFormError(messageFor(err));
    }
  }

  async function rotate(row: KeyRow) {
    setListError(null);
    try {
      const res = (await rotateKey.mutateAsync({
        id: row.id,
        data: { graceHours: 24 } as never,
      })) as unknown as { key: string; oldKeyExpiresAt: number | null };
      setRotated(res);
    } catch (err) {
      setListError(messageFor(err));
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <PageHeader
        title="API keys"
        description="Drive chatform from your own products — a server integration, a custom interface, or a page that embeds a form."
        actions={
          /**
           * Gated in the UI as well as the API. The server refuses on a plan
           * without api_access, but discovering that after filling in a form is
           * a worse way to find out.
           */
          <LockedControl feature="api_access">
            <Button shape="pill" onClick={() => setOpen(true)}>
              <Plus className="size-4" /> Create key
            </Button>
          </LockedControl>
        }
      />

      {listError && (
        <p className="text-destructive mb-4 rounded-xl bg-[var(--destructive-soft)] px-4 py-3 text-sm" role="alert">
          {listError}
        </p>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="bg-muted h-20 animate-pulse rounded-xl" />
          ))}
        </div>
      ) : keys.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title="No API keys yet"
          description="A key lets your own code create responses, read them back, or run a conversation from your product."
          action={
            <LockedControl feature="api_access">
              <Button shape="pill" onClick={() => setOpen(true)}>
                <Plus className="size-4" /> Create your first key
              </Button>
            </LockedControl>
          }
          hint="Read the quickstart at chatform.in/docs/quickstart"
        />
      ) : (
        <Card className="overflow-hidden">
          {/* A key is a row of comparable facts — prefix, scopes, last used —
              and the stack of cards this was made it impossible to scan any
              one of them down the list. */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Key</TableHead>
                <TableHead>Scopes</TableHead>
                <TableHead className="hidden sm:table-cell">Last used</TableHead>
                <TableHead className="pr-4 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((k) => {
                const scopes = Object.entries(k.scopes ?? {}).flatMap(([resource, actions]) =>
                  actions.map((a) => `${resource}:${a}`),
                );
                return (
                  <TableRow key={k.id} className={k.enabled ? undefined : "opacity-60"}>
                    <TableCell className="h-auto py-3 pl-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{k.name ?? "Untitled key"}</span>
                        <Badge variant={isPublishable(k.keyType) ? "secondary" : "default"}>
                          {isPublishable(k.keyType) ? "Publishable" : "Secret"}
                        </Badge>
                        {k.environment === "test" && <Badge variant="outline">Test</Badge>}
                        {!k.enabled && <Badge variant="destructive">Revoked</Badge>}
                        {k.expiresAt && now > 0 && k.expiresAt > now && (
                          <Badge variant="outline">expires in {hoursUntil(k.expiresAt, now)}h</Badge>
                        )}
                      </div>
                      <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        <code className="font-mono">{k.start ?? "—"}…</code>
                        {k.rateLimitMax && <span>{k.rateLimitMax}/min</span>}
                        {k.origins.length > 0 && (
                          <span>
                            {k.origins.length} origin{k.origins.length === 1 ? "" : "s"}
                          </span>
                        )}
                        <span className="sm:hidden">last used {relative(k.lastUsedAt, now)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="h-auto max-w-64 py-3">
                      <div className="flex flex-wrap gap-1">
                        {scopes.length === 0 ? (
                          <span className="text-muted-foreground text-xs">—</span>
                        ) : (
                          scopes.map((scope) => (
                            <span
                              key={scope}
                              className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-mono text-[11px]"
                            >
                              {scope}
                            </span>
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden py-3 text-xs sm:table-cell">
                      {relative(k.lastUsedAt, now)}
                    </TableCell>
                    <TableCell className="py-3 pr-4 text-right">
                      {k.enabled && (
                        <div className="flex items-center justify-end gap-1">
                          {/*
                            Rotation is confirmed like revocation is. It reads as
                            the safe sibling of the two, but it starts a 24-hour
                            clock on a key that is in production right now — a
                            misclick here is a deploy deadline nobody agreed to.
                          */}
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={rotateKey.isPending}
                            onClick={() => setRotating(k)}
                          >
                            <RefreshCw className="size-3.5" /> Rotate
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Revoke ${k.name ?? "this key"}`}
                            onClick={() => setRevoking(k)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <Card className="mt-8">
        <CardContent className="py-5">
          <h2 className="font-display mb-1 text-base font-medium">Rate limits</h2>
          <p className="text-muted-foreground text-sm">
            Secret keys are limited per key, per minute; publishable keys get more headroom because one page can
            hold many respondents at once. Every response carries <code>RateLimit-Remaining</code>, so you can slow
            down before you are told to.
          </p>
          <p className="text-muted-foreground mt-2 text-sm">
            A 429 means slow down. A 402 means your monthly quota is spent and retrying will not help.
          </p>
        </CardContent>
      </Card>

      {/* ── create ─────────────────────────────────────────────────────── */}
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) {
            setCreated(null);
            setFormError(null);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          {created ? (
            <>
              <DialogHeader>
                <DialogTitle className="font-display">Copy your key now</DialogTitle>
                <DialogDescription>
                  This is the only time it is shown. We store a hash, so we cannot show it again.
                </DialogDescription>
              </DialogHeader>
              <div className="bg-muted flex items-center gap-2 rounded-lg p-3">
                <code className="min-w-0 flex-1 break-all font-mono text-xs">{created.key}</code>
                <CopyButton value={created.key} toastMessage="Key copied" variant="outline" size="sm" />
              </div>
              {!isPublishable(created.keyType) && (
                <p className="text-muted-foreground flex items-start gap-2 text-xs">
                  <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
                  Keep this on a server. A request carrying a secret key from a browser is refused, because by then
                  the key is readable by everyone who loaded the page.
                </p>
              )}
              <Button className="rounded-full" onClick={() => setOpen(false)}>
                Done
              </Button>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="font-display">Create API key</DialogTitle>
                <DialogDescription>{KEY_TYPES.find((t) => t.value === keyType)?.blurb}</DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="key-name">Name</Label>
                  <Input id="key-name" value={name} onChange={(e) => setName(e.target.value)} />
                </div>

                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <SegmentedControl
                    options={KEY_TYPES.map((t) => ({ value: t.value, label: t.label }))}
                    value={keyType}
                    onChange={setKeyType}
                    size="sm"
                    ariaLabel="Key type"
                  />
                </div>

                {isPublishable(keyType) ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="key-origins">Allowed origins</Label>
                    <textarea
                      id="key-origins"
                      value={origins}
                      onChange={(e) => setOrigins(e.target.value)}
                      rows={3}
                      placeholder={"https://acme.example\nhttps://*.preview.acme.example"}
                      className="border-input bg-background w-full rounded-lg border px-3 py-2 font-mono text-xs"
                    />
                    <p className="text-muted-foreground text-xs">
                      Required. A publishable key with no allowlist is not publishable, it is just public — so the
                      API refuses to create one.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label>Scopes</Label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {Object.entries(availableScopes).map(([resource, actions]) =>
                        (actions as string[]).map((action) => {
                          const checked = (scopes[resource] ?? []).includes(action);
                          return (
                            <label
                              key={`${resource}:${action}`}
                              className="hover:bg-muted flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleScope(resource, action)}
                                className="accent-primary"
                              />
                              <code className="font-mono">
                                {resource}:{action}
                              </code>
                            </label>
                          );
                        }),
                      )}
                    </div>
                    <p className="text-muted-foreground text-xs">
                      Give a key the least it needs. No key can mint another key or change your plan, whatever is
                      selected here.
                    </p>
                  </div>
                )}
              </div>

              {formError && (
                <p className="text-destructive rounded-lg bg-[var(--destructive-soft)] px-3 py-2 text-sm" role="alert">
                  {formError}
                </p>
              )}

              <Button
                className="rounded-full"
                onClick={submit}
                disabled={createKey.isPending || (isPublishable(keyType) && origins.trim() === "")}
              >
                {createKey.isPending ? "Creating…" : "Create key"}
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── rotation result ────────────────────────────────────────────── */}
      <Dialog open={rotated !== null} onOpenChange={(o) => !o && setRotated(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">Rotated</DialogTitle>
            <DialogDescription>
              The old key keeps working for 24 hours. Deploy this one, then revoke the old one — a deploy is not
              atomic, and revoking first would mean downtime in between.
            </DialogDescription>
          </DialogHeader>
          <div className="bg-muted flex items-center gap-2 rounded-lg p-3">
            <code className="min-w-0 flex-1 break-all font-mono text-xs">{rotated?.key}</code>
            <CopyButton value={rotated?.key ?? ""} toastMessage="Key copied" variant="outline" size="sm" />
          </div>
          <Button className="rounded-full" onClick={() => setRotated(null)}>
            Done
          </Button>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={rotating !== null}
        onOpenChange={(o) => !o && setRotating(null)}
        title="Rotate this key?"
        description={`A replacement is issued now and ${rotating?.name ?? "this key"} keeps working for 24 hours, then stops. Deploy the new one within that window — after it, anything still using the old key starts failing.`}
        confirmLabel="Rotate"
        onConfirm={() => {
          const row = rotating;
          setRotating(null);
          if (row) void rotate(row);
        }}
      />

      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(o) => !o && setRevoking(null)}
        title="Revoke this key?"
        description={`Anything using ${revoking?.name ?? "this key"} stops working immediately. This cannot be undone — create a new key instead if you are rotating.`}
        confirmLabel="Revoke"
        onConfirm={() => {
          if (revoking) revokeKey.mutate({ id: revoking.id });
          setRevoking(null);
        }}
      />
    </div>
  );
}
