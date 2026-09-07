"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetApiKeys,
  usePostApiKeys,
  useDeleteApiKeysById,
  useGetApiKeysScopes,
  getGetApiKeysQueryKey,
} from "@/lib/api/dashboard/dashboard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LockedControl } from "@/components/billing/gate";
import { BookOpen, Eye, EyeOff, KeyRound, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { useClientValue } from "@/hooks/use-client-value";
import { ApiError } from "@/lib/api/mutator";

/**
 * API keys.
 *
 * The page's whole job is the keys. It had grown a documentation site inside
 * itself — a first-request snippet, an SDK card, four doc tiles and a footnote
 * carrying the base URL — all of it a worse copy of pages that already exist
 * under /docs, and all of it in front of someone who came here to mint a key
 * or read a prefix. One "Docs" button in the header replaces the lot: the
 * reference lives in one place, and this screen stops pretending to be it.
 *
 * What was missing is the opposite problem. A key's scopes are the entire
 * reason a key is dangerous or safe, and the list showed three of them with a
 * "+2" and no way to see the rest — the rows were not even clickable. A row
 * now opens a panel with every scope, every allowed origin, the rate limit and
 * the usage, which is the one screen you actually want when asking "what can
 * this key do?".
 *
 * Rotation is gone, deliberately. It read as the mild sibling of revoke and
 * was the sharper one — a click started a 24-hour clock on a key serving
 * production traffic. Create a second key, deploy it, revoke the first: the
 * same rotation with each step under your control.
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

/** Enough to see the shape of a key's access; the row opens for the rest. */
const SCOPES_SHOWN = 3;

function isPublishable(type: KeyType) {
  return type.startsWith("pk_");
}

function scopeList(scopes: Record<string, string[]> | undefined): string[] {
  return Object.entries(scopes ?? {}).flatMap(([resource, actions]) =>
    actions.map((a) => `${resource}:${a}`),
  );
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

/**
 * The eye, and what it can honestly reveal.
 *
 * We store an Argon2 hash and the first few characters, so the secret itself is
 * unrecoverable the moment the create dialog closes — an eye that promised the
 * whole key would be a lie the backend cannot keep. What it hides and shows is
 * the prefix, which is the part that identifies a key on a screen someone else
 * might be looking at.
 */
function KeyPrefix({ start, keyType }: { start: string | null; keyType: KeyType }) {
  const [shown, setShown] = useState(false);
  const visible = start ? `${start}${"•".repeat(8)}` : "—";
  const masked = `${keyType}_${"•".repeat(10)}`;
  return (
    <span className="inline-flex items-center gap-1">
      <code className="font-mono">{shown ? visible : masked}</code>
      <button
        type="button"
        // The row is a button too; without this the eye would also open the panel.
        onClick={(e) => {
          e.stopPropagation();
          setShown((s) => !s);
        }}
        aria-label={shown ? "Hide key prefix" : "Show key prefix"}
        title={shown ? "Hide key prefix" : "Show key prefix"}
        className="text-muted-foreground hover:text-foreground rounded p-0.5 transition-colors"
      >
        {shown ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
      </button>
    </span>
  );
}

/** A small labelled fact. The detail panel is a stack of these. */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted-foreground shrink-0 text-xs">{label}</span>
      <span className="min-w-0 text-right">{children}</span>
    </div>
  );
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
  const [revealCreated, setRevealCreated] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<KeyRow | null>(null);
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

  // Tracked by id, not by object, so the panel keeps showing live data after a
  // revoke invalidates the list rather than a frozen copy of the old row.
  const detail = keys.find((k) => k.id === detailId) ?? null;

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
      setRevealCreated(false);
      setCreated({ key: result.key, keyType });
    } catch (err) {
      setFormError(messageFor(err));
    }
  }

  async function revoke(row: KeyRow) {
    setListError(null);
    try {
      await revokeKey.mutateAsync({ id: row.id });
    } catch (err) {
      setListError(messageFor(err));
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <PageHeader
        title="API keys"
        description="Drive chatform from your own code."
        actions={
          <>
            {/* Everything this page used to explain, in one link. New tab: you
                open the reference to keep it beside the key, not instead of it. */}
            <Button variant="outline" shape="pill" asChild>
              <a href="/docs" target="_blank" rel="noreferrer">
                <BookOpen className="size-4" /> Docs
              </a>
            </Button>
            {/*
             * Gated in the UI as well as the API. The server refuses on a plan
             * without api_access, but discovering that after filling in a form
             * is a worse way to find out.
             */}
            <LockedControl feature="api_access">
              <Button shape="pill" onClick={() => setOpen(true)}>
                <Plus className="size-4" /> Create key
              </Button>
            </LockedControl>
          </>
        }
      />

      {listError && (
        <p className="text-destructive mt-6 rounded-xl bg-[var(--destructive-soft)] px-4 py-3 text-sm" role="alert">
          {listError}
        </p>
      )}

      <div className="mt-6">
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
            hint={
              <a href="/docs/quickstart" target="_blank" rel="noreferrer" className="underline underline-offset-2">
                Read the quickstart
              </a>
            }
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
                  <TableHead className="pr-4 text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((k) => {
                  const scopes = scopeList(k.scopes);
                  // Three chips read as a summary; five wrap to three lines and
                  // read as a wall. The panel has the full list.
                  const shown = scopes.slice(0, SCOPES_SHOWN);
                  const overflow = scopes.length - shown.length;
                  return (
                    <TableRow
                      key={k.id}
                      // A row of facts with more facts behind it should say so
                      // by being pressable. Keyboard reachable, because the
                      // panel is the only way to read a key's full access.
                      role="button"
                      tabIndex={0}
                      onClick={() => setDetailId(k.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setDetailId(k.id);
                        }
                      }}
                      className={`hover:bg-muted/50 focus-visible:ring-ring/50 cursor-pointer outline-none focus-visible:ring-2 ${k.enabled ? "" : "opacity-60"}`}
                    >
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
                          <KeyPrefix start={k.start} keyType={k.keyType} />
                          <span>created {relative(k.createdAt, now)}</span>
                          <span className="sm:hidden">last used {relative(k.lastUsedAt, now)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="h-auto max-w-64 py-3">
                        <div className="flex flex-wrap items-center gap-1">
                          {scopes.length === 0 ? (
                            <span className="text-muted-foreground text-xs">—</span>
                          ) : (
                            <>
                              {shown.map((scope) => (
                                <span
                                  key={scope}
                                  className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-mono text-[11px]"
                                >
                                  {scope}
                                </span>
                              ))}
                              {overflow > 0 && (
                                <span className="text-muted-foreground text-[11px]">+{overflow}</span>
                              )}
                            </>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden py-3 text-xs sm:table-cell">
                        {relative(k.lastUsedAt, now)}
                      </TableCell>
                      <TableCell className="py-3 pr-4 text-right">
                        {k.enabled && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="Revoke key"
                            aria-label={`Revoke ${k.name ?? "this key"}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setRevoking(k);
                            }}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      {/* ── one key, in full ───────────────────────────────────────────── */}
      <Sheet open={detail !== null} onOpenChange={(o) => !o && setDetailId(null)}>
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md">
          {detail && (
            <>
              {/* `pr-10` clears the sheet's own absolute close button, which a
                  long key name would otherwise run underneath. */}
              <SheetHeader className="border-b pr-10">
                <SheetTitle className="font-display">{detail.name ?? "Untitled key"}</SheetTitle>
                <SheetDescription>
                  {KEY_TYPES.find((t) => t.value === detail.keyType)?.blurb}
                </SheetDescription>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Badge variant={isPublishable(detail.keyType) ? "secondary" : "default"}>
                    {isPublishable(detail.keyType) ? "Publishable" : "Secret"}
                  </Badge>
                  <Badge variant="outline">{detail.environment}</Badge>
                  {!detail.enabled && <Badge variant="destructive">Revoked</Badge>}
                </div>
              </SheetHeader>

              <div className="space-y-6 p-4">
                <div>
                  <h3 className="mb-1.5 text-xs font-medium">Scopes</h3>
                  {/*
                    Every one of them, grouped by the resource they act on.
                    "+2 more" on the list row was the whole problem: the answer
                    to "can this key read responses?" was hidden behind a number.
                  */}
                  {Object.keys(detail.scopes ?? {}).length === 0 ? (
                    <p className="text-muted-foreground text-xs">
                      No scopes. This key can authenticate and nothing else.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {Object.entries(detail.scopes).map(([resource, actions]) => (
                        <div key={resource} className="flex flex-wrap items-center gap-1.5">
                          <span className="text-muted-foreground w-20 shrink-0 text-xs">{resource}</span>
                          {actions.map((action) => (
                            <span
                              key={action}
                              className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-mono text-[11px]"
                            >
                              {resource}:{action}
                            </span>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-muted-foreground mt-2 text-xs">
                    No key can mint another key or change your plan.{" "}
                    <a
                      href="/docs/scopes"
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-2"
                    >
                      Scope reference
                    </a>
                  </p>
                </div>

                {/* Origins only exist on publishable keys, and there they are
                    the entire security model, so they are not a footnote. */}
                {isPublishable(detail.keyType) && (
                  <div>
                    <h3 className="mb-1.5 text-xs font-medium">Allowed origins</h3>
                    {detail.origins.length === 0 ? (
                      <p className="text-muted-foreground text-xs">None.</p>
                    ) : (
                      <ul className="space-y-1">
                        {detail.origins.map((o) => (
                          <li key={o} className="bg-muted rounded px-2 py-1 font-mono text-[11px] break-all">
                            {o}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                <div className="divide-y">
                  <Fact label="Key">
                    <KeyPrefix start={detail.start} keyType={detail.keyType} />
                  </Fact>
                  <Fact label="Requests">{detail.requestCount.toLocaleString()}</Fact>
                  <Fact label="Rate limit">
                    {detail.rateLimitMax ? `${detail.rateLimitMax}/min` : "default"}
                  </Fact>
                  <Fact label="Last used">{relative(detail.lastUsedAt, now)}</Fact>
                  <Fact label="Created">{relative(detail.createdAt, now)}</Fact>
                  {detail.expiresAt && (
                    <Fact label="Expires">{new Date(detail.expiresAt).toLocaleString()}</Fact>
                  )}
                  {detail.formIds.length > 0 && (
                    <Fact label="Forms">{detail.formIds.length} form(s)</Fact>
                  )}
                </div>

                <p className="text-muted-foreground text-xs">
                  The secret is stored as a hash and cannot be shown again.
                </p>

                {detail.enabled && (
                  <Button
                    variant="outline"
                    className="text-destructive w-full rounded-full"
                    onClick={() => {
                      const row = detail;
                      setDetailId(null);
                      setRevoking(row);
                    }}
                  >
                    <Trash2 className="size-3.5" /> Revoke key
                  </Button>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ── create ─────────────────────────────────────────────────────── */}
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) {
            setCreated(null);
            setRevealCreated(false);
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
              {/* Hidden by default: the moment a key is minted is also the
                  moment it is most likely on a shared screen or a recording. */}
              <div className="bg-muted flex items-center gap-2 rounded-lg p-3">
                <code className="min-w-0 flex-1 break-all font-mono text-xs">
                  {revealCreated ? created.key : "•".repeat(Math.min(created.key.length, 44))}
                </code>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={revealCreated ? "Hide key" : "Show key"}
                  onClick={() => setRevealCreated((s) => !s)}
                >
                  {revealCreated ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </Button>
                <CopyButton value={created.key} toastMessage="Key copied" variant="outline" size="sm" />
              </div>
              {!isPublishable(created.keyType) && (
                <p className="text-muted-foreground flex items-start gap-2 text-xs">
                  <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
                  Keep this on a server. A request carrying a secret key from a browser is refused, because by then
                  the key is readable by everyone who loaded the page.
                </p>
              )}
              <div className="flex items-center gap-2">
                <Button className="flex-1 rounded-full" onClick={() => setOpen(false)}>
                  Done
                </Button>
                <Button variant="outline" className="rounded-full" asChild>
                  <a href="/docs/quickstart" target="_blank" rel="noreferrer">
                    <BookOpen className="size-4" /> Docs
                  </a>
                </Button>
              </div>
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
                      Required — a publishable key with no allowlist is just public.
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
                      Give a key the least it needs.{" "}
                      <a
                        href="/docs/scopes"
                        target="_blank"
                        rel="noreferrer"
                        className="underline underline-offset-2"
                      >
                        Scope reference
                      </a>
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

      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(o) => !o && setRevoking(null)}
        title="Revoke this key?"
        description={`Anything using ${revoking?.name ?? "this key"} stops working immediately, and this cannot be undone. To replace a key without downtime, create the new one first, deploy it, then revoke this one.`}
        confirmLabel="Revoke"
        onConfirm={() => {
          const row = revoking;
          setRevoking(null);
          if (row) void revoke(row);
        }}
      />
    </div>
  );
}
