"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Send, Trash2, Webhook } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { customFetch } from "@/lib/api/mutator";
import { cn } from "@/lib/utils";

/**
 * Webhook endpoints for one form.
 *
 * The events offered here are the canonical `response.*` names. They already
 * were — but the API's create validator accepted only the legacy `submission.*`
 * pair, so every endpoint added from this panel was refused with a 422 that the
 * old UI did not render. Both sides now derive from the dispatcher's alias
 * table; see `apps/api/src/routes/webhook-admin.ts`.
 */

const EVENTS: { name: string; blurb: string }[] = [
  { name: "response.completed", blurb: "Someone finished the whole conversation." },
  { name: "response.partial", blurb: "Someone stopped part-way, with answers worth keeping." },
  { name: "response.abandoned", blurb: "A session timed out with nothing more coming." },
  { name: "response.answer_recorded", blurb: "Each individual answer, as it lands." },
  { name: "session.started", blurb: "Someone opened the form and began." },
  { name: "form.published", blurb: "A new version of this form went live." },
];

interface WebhookRow {
  id: string;
  url: string;
  events: string[];
  formId?: string | null;
  /**
   * The first few characters, for telling two endpoints apart. The full secret
   * is returned once, at creation, and never again — so reading `secret` here
   * threw on every webhook that already existed.
   */
  secretPreview?: string;
  active: boolean;
}

interface Delivery {
  id: string;
  event_type: string;
  status: string;
  response_status: number | null;
  last_error: string | null;
  attempt: number;
  created_at: number;
}

export function WebhooksPanel({ formId }: { formId: string }) {
  const queryClient = useQueryClient();
  // Keyed by form: every webhook created here carries this form's id, so
  // listing every endpoint in the organization showed people other forms'
  // integrations on this one's page.
  const queryKey = ["webhooks", formId];
  const { data: raw, isLoading } = useQuery({
    queryKey,
    queryFn: () => customFetch<WebhookRow[]>("/api/webhooks"),
  });
  const hooks = (Array.isArray(raw) ? raw : []).filter((h) => !h.formId || h.formId === formId);

  const [url, setUrl] = useState("");
  const [selected, setSelected] = useState<string[]>(["response.completed"]);
  const [created, setCreated] = useState<{ url: string; secret: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey });

  const create = useMutation({
    mutationFn: (body: { url: string; events: string[]; formId: string }) =>
      customFetch<WebhookRow & { secret: string }>("/api/webhooks", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (row) => {
      setUrl("");
      setError(null);
      // Shown once, here, because the API will never return it again.
      setCreated({ url: row.url, secret: row.secret });
      invalidate();
    },
    // A refusal used to fall on the floor: the button did nothing and said
    // nothing about why.
    onError: (err: Error) => setError(err.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => customFetch(`/api/webhooks/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  const test = useMutation({
    mutationFn: (id: string) =>
      customFetch<{ ok: boolean }>(`/api/webhooks/${id}/test`, { method: "POST" }),
    onSuccess: (res) =>
      res.ok
        ? toast.success("Test event delivered.")
        : toast.error("Your endpoint didn't accept the test event."),
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-5">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!url || selected.length === 0) return;
          create.mutate({ url, events: selected, formId });
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="webhook-url">Payload URL</Label>
          <Input
            id="webhook-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://yourapp.com/hooks/chatform"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Events</Label>
          <div className="flex flex-wrap gap-1.5">
            {EVENTS.map((event) => {
              const on = selected.includes(event.name);
              return (
                <button
                  key={event.name}
                  type="button"
                  title={event.blurb}
                  aria-pressed={on}
                  onClick={() =>
                    setSelected((prev) =>
                      on ? prev.filter((x) => x !== event.name) : [...prev, event.name],
                    )
                  }
                  className={cn(
                    "rounded-full border px-3 py-1 font-mono text-xs",
                    "transition-colors duration-[var(--duration-micro)]",
                    on
                      ? "border-primary bg-primary-soft text-primary"
                      : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
                  )}
                >
                  {event.name}
                </button>
              );
            })}
          </div>
        </div>

        {error && <p className="text-caption text-destructive">{error}</p>}

        <Button
          type="submit"
          size="sm"
          shape="pill"
          disabled={!url || selected.length === 0 || create.isPending}
        >
          {create.isPending ? "Adding…" : "Add endpoint"}
        </Button>
      </form>

      {created && (
        <div className="border-primary/30 bg-primary-soft/40 space-y-2 rounded-xl border p-4">
          <p className="text-h3">Signing secret</p>
          <p className="text-muted-foreground text-caption">
            Shown once. Verify every delivery against it — the signature header is{" "}
            <code className="bg-muted rounded px-1">x-chatform-signature: t=…, v1=…</code>, an
            HMAC-SHA256 of <code className="bg-muted rounded px-1">timestamp.body</code>.
          </p>
          <div className="flex gap-2">
            <Input readOnly value={created.secret} className="font-mono text-xs" />
            <CopyButton value={created.secret} label="Copy" variant="outline" />
          </div>
          <Button variant="ghost" size="sm" onClick={() => setCreated(null)}>
            I&apos;ve saved it
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="bg-muted h-16 animate-pulse rounded-xl" />
      ) : hooks.length === 0 ? (
        <EmptyState
          compact
          icon={Webhook}
          title="No endpoints yet"
          description="Add one and every matching event is delivered, signed, with retries for two hours."
        />
      ) : (
        <div className="space-y-2">
          {hooks.map((hook) => (
            <div key={hook.id} className="bg-muted/30 rounded-xl p-3">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-mono text-sm">{hook.url}</span>
                {!hook.active && <Badge variant="destructive">off</Badge>}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Send a test event"
                  disabled={test.isPending}
                  onClick={() => test.mutate(hook.id)}
                >
                  <Send className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Delete this endpoint"
                  onClick={() => remove.mutate(hook.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {hook.events.map((event) => (
                  <Badge key={event} variant="secondary" className="font-mono text-[0.6875rem]">
                    {event}
                  </Badge>
                ))}
                <code className="text-muted-foreground ml-auto text-xs">
                  {hook.secretPreview ?? "whsec_…"}
                </code>
              </div>
              <button
                type="button"
                onClick={() => setExpanded(expanded === hook.id ? null : hook.id)}
                className="text-muted-foreground hover:text-foreground text-micro mt-2 inline-flex items-center gap-1"
              >
                <ChevronDown
                  className={cn(
                    "size-3 transition-transform duration-[var(--duration-micro)]",
                    expanded === hook.id && "rotate-180",
                  )}
                />
                Recent deliveries
              </button>
              {expanded === hook.id && <Deliveries webhookId={hook.id} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The delivery log.
 *
 * The endpoint has existed since webhooks shipped and nothing ever called it,
 * which meant "my webhook isn't firing" had no answer inside the product.
 */
function Deliveries({ webhookId }: { webhookId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["webhook-deliveries", webhookId],
    queryFn: () => customFetch<Delivery[]>(`/api/webhooks/${webhookId}/deliveries`),
  });
  const rows = Array.isArray(data) ? data : [];

  if (isLoading) return <div className="bg-muted mt-2 h-10 animate-pulse rounded-lg" />;
  if (rows.length === 0) {
    return <p className="text-muted-foreground text-micro mt-2">Nothing delivered yet.</p>;
  }

  return (
    <ul className="mt-2 space-y-1">
      {rows.slice(0, 10).map((row) => (
        <li key={row.id} className="text-micro flex items-center gap-2">
          <span
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              row.status === "delivered"
                ? "bg-[var(--success)]"
                : row.status === "pending"
                  ? "bg-[var(--warning)]"
                  : "bg-destructive",
            )}
          />
          <span className="text-muted-foreground font-mono">{row.event_type}</span>
          <span className="text-muted-foreground">
            {row.response_status ?? row.status}
            {row.attempt > 0 && ` · attempt ${row.attempt + 1}`}
          </span>
          <span className="text-muted-foreground ml-auto shrink-0">
            {new Date(row.created_at).toLocaleString()}
          </span>
        </li>
      ))}
    </ul>
  );
}
