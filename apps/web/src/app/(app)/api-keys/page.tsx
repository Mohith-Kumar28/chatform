"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LockedControl } from "@/components/billing/gate";
import { ArrowUpRight, ExternalLink, KeyRound, Plus, Trash2, ShieldAlert } from "lucide-react";
import { useClientValue } from "@/hooks/use-client-value";
import { API_ORIGIN, ApiError } from "@/lib/api/mutator";

/**
 * API keys.
 *
 * Two things this page owes a developer: the keys themselves, and the way in.
 * It shipped with only the first — no base URL, no first request, no link to
 * the docs or to the two packages we publish — so a key was a string with
 * nowhere to go. The rest of the page had drifted the other way: a per-row
 * rate-limit figure and a paragraph about 429s and 24-hour grace windows, all
 * of it reference material that belongs in /docs/rate-limits and nowhere near
 * a list of keys.
 *
 * Rotation is gone too. It read as the mild sibling of revoke and was in fact
 * the sharper one — a click started a 24-hour clock on a key serving
 * production traffic. Nobody else offers it on this screen: you create a
 * second key, deploy it, then revoke the first, which is the same rotation
 * with each step under your control.
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

/** Enough to see the shape of a key's access; the rest is a hover away. */
const SCOPES_SHOWN = 3;

const FIRST_REQUEST = `curl ${API_ORIGIN}/v1/me \\
  -H "x-api-key: $CHATFORM_SECRET_KEY"`;

const SDKS = [
  { pkg: "@chatformhq/js", blurb: "Typed client" },
  { pkg: "@chatformhq/react", blurb: "Hooks & embed" },
];

const DOC_LINKS = [
  { href: "/docs/quickstart", title: "Quickstart", blurb: "A key to a stored answer in five minutes." },
  { href: "/docs/authentication", title: "Authentication", blurb: "Key types, headers, and what a 401 means." },
  { href: "/docs/scopes", title: "Scopes", blurb: "What each scope grants — and never grants." },
  { href: "/docs/rate-limits", title: "Rate limits", blurb: "Per-key limits, quotas, and the headers to watch." },
];

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
              <Link href="/docs/quickstart" className="underline underline-offset-2">
                Read the quickstart
              </Link>
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
                  const scopes = Object.entries(k.scopes ?? {}).flatMap(([resource, actions]) =>
                    actions.map((a) => `${resource}:${a}`),
                  );
                  // Three chips read as a summary; five wrap to three lines and
                  // read as a wall. The full list is on the row's title.
                  const shown = scopes.slice(0, SCOPES_SHOWN);
                  const overflow = scopes.length - shown.length;
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
                          <span>created {relative(k.createdAt, now)}</span>
                          {k.origins.length > 0 && (
                            <span>
                              {k.origins.length} origin{k.origins.length === 1 ? "" : "s"}
                            </span>
                          )}
                          <span className="sm:hidden">last used {relative(k.lastUsedAt, now)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="h-auto max-w-64 py-3">
                        <div className="flex flex-wrap items-center gap-1" title={scopes.join(" ")}>
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
                            onClick={() => setRevoking(k)}
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

      {/* ── the way in ─────────────────────────────────────────────────── */}
      <section className="mt-12">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-h3">Start building</h2>
          <Link
            href="/docs"
            className="text-muted-foreground hover:text-foreground text-xs transition-colors"
          >
            All documentation →
          </Link>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {/* The one request that proves the key works, ready to paste. */}
          <Card className="gap-0 overflow-hidden py-0">
            <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
              <span className="text-muted-foreground text-xs font-medium">Your first request</span>
              <CopyButton value={FIRST_REQUEST} toastMessage="Snippet copied" />
            </div>
            <pre className="overflow-x-auto px-4 py-3 text-xs leading-relaxed">
              <code className="font-mono">{FIRST_REQUEST}</code>
            </pre>
          </Card>

          <Card className="gap-0 overflow-hidden py-0">
            <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
              <span className="text-muted-foreground text-xs font-medium">Official SDKs</span>
              <Link
                href="/docs/sdk"
                className="text-muted-foreground hover:text-foreground text-xs transition-colors"
              >
                Guide →
              </Link>
            </div>
            <ul className="divide-y">
              {SDKS.map((s) => (
                <li key={s.pkg} className="flex items-center gap-2 py-1.5 pr-3 pl-4">
                  <code className="min-w-0 flex-1 truncate font-mono text-xs">npm i {s.pkg}</code>
                  <span className="text-muted-foreground hidden text-xs sm:inline">{s.blurb}</span>
                  <CopyButton value={`npm i ${s.pkg}`} toastMessage="Command copied" />
                  <a
                    href={`https://www.npmjs.com/package/${s.pkg}`}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`${s.pkg} on npm`}
                    title="View on npm"
                    className="text-muted-foreground hover:text-foreground p-1 transition-colors"
                  >
                    <ExternalLink className="size-3.5" />
                  </a>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {DOC_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="group bg-card hover:border-ring rounded-xl border p-3.5 transition-colors"
            >
              <span className="flex items-center gap-1 text-sm font-medium">
                {l.title}
                <ArrowUpRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
              </span>
              <span className="text-muted-foreground mt-0.5 block text-xs text-pretty">{l.blurb}</span>
            </Link>
          ))}
        </div>

        {/*
          The reference facts, one line, at the bottom — the page used to give
          rate limiting a card of its own between the keys and nothing at all,
          which put a paragraph about 429s in front of everyone who came here
          to copy a key.
        */}
        <p className="text-muted-foreground mt-4 text-xs">
          Base URL <code className="font-mono">{API_ORIGIN}/v1</code> · authenticate with the{" "}
          <code className="font-mono">x-api-key</code> header · requests are limited per key,{" "}
          <Link href="/docs/rate-limits" className="underline underline-offset-2">
            see rate limits
          </Link>
          .
        </p>
      </section>

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
