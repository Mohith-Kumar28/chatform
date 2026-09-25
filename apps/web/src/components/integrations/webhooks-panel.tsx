"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Webhook,
} from "lucide-react";
import type { Block } from "@repo/form-schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { CopyButton } from "@/components/ui/copy-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Textarea } from "@/components/ui/textarea";
import { customFetch } from "@/lib/api/mutator";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import { aiSetupPrompt, samplePayload } from "./webhook-payload";

/**
 * Webhook endpoints for one form.
 *
 * The events offered here are the canonical `response.*` names. They already
 * were — but the API's create validator accepted only the legacy `submission.*`
 * pair, so every endpoint added from this panel was refused with a 422 that the
 * old UI did not render. Both sides now derive from the dispatcher's alias
 * table; see `apps/api/src/routes/webhook-admin.ts`.
 */

const EVENTS: { name: string; label: string; blurb: string }[] = [
  { name: "response.completed", label: "Response completed", blurb: "Someone finished the whole form." },
  { name: "response.partial", label: "Partial response", blurb: "Someone stopped part-way, with answers worth keeping." },
  { name: "response.disqualified", label: "Disqualified", blurb: "Someone reached a “can’t submit” ending." },
  { name: "response.abandoned", label: "Abandoned", blurb: "A session timed out with nothing more coming." },
  { name: "response.answer_recorded", label: "Each answer", blurb: "Every individual answer, as it lands." },
  { name: "session.started", label: "Session started", blurb: "Someone opened the form and began." },
  { name: "form.published", label: "Form published", blurb: "A new version of this form went live." },
];

const eventLabel = (name: string) => EVENTS.find((e) => e.name === name)?.label ?? name;

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
  /** `success`, `failed` (retry pending) or `dead`. */
  status: string;
  response_status: number | null;
  last_error: string | null;
  attempt: number;
  created_at: number;
  payload?: string | null;
}

type TestResult = { ok: boolean; text: string };

export function WebhooksPanel({
  formId,
  formTitle,
  blocks,
}: {
  formId: string;
  formTitle: string;
  blocks: Block[];
}) {
  // Keyed by form: every webhook created here carries this form's id, so
  // listing every endpoint in the organization showed people other forms'
  // integrations on this one's page.
  const queryKey = ["webhooks", formId];
  const { data: raw, isLoading } = useQuery({
    queryKey,
    queryFn: () => customFetch<WebhookRow[]>("/api/webhooks"),
  });
  const hooks = (Array.isArray(raw) ? raw : []).filter((h) => !h.formId || h.formId === formId);

  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [created, setCreated] = useState<{ url: string; secret: string } | null>(null);
  const [events, setEvents] = useState<string[]>(["response.completed"]);

  const open = hooks.find((h) => h.id === openId);
  if (open) {
    return <EndpointDetail hook={open} formId={formId} onBack={() => setOpenId(null)} />;
  }

  const showForm = adding || (!isLoading && hooks.length === 0);

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="text-h3 flex-1">Endpoints</h3>
          {!showForm && (
            <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
              <Plus className="size-3.5" />
              Add endpoint
            </Button>
          )}
        </div>

        {created && (
          <div className="border-primary/30 bg-primary-soft/40 space-y-2 rounded-xl border p-4">
            <p className="text-sm font-medium">Endpoint added. Save the signing secret</p>
            <p className="text-muted-foreground text-caption">
              It is shown once. Your server uses it to check that each request really came from
              ChatForm.
            </p>
            <div className="flex gap-2">
              <Input readOnly value={created.secret} className="font-mono text-xs" />
              <CopyButton value={created.secret} label="Copy" variant="outline" size="sm" />
            </div>
            <Button variant="ghost" size="sm" onClick={() => setCreated(null)}>
              I&apos;ve saved it
            </Button>
          </div>
        )}

        {showForm && (
          <AddEndpointForm
            formId={formId}
            queryKey={queryKey}
            events={events}
            onEventsChange={setEvents}
            canCancel={hooks.length > 0}
            onCancel={() => setAdding(false)}
            onCreated={(row) => {
              setCreated(row);
              setAdding(false);
            }}
          />
        )}

        {isLoading ? (
          <div className="bg-muted h-16 animate-pulse rounded-xl" />
        ) : hooks.length === 0 ? (
          !showForm && (
            <EmptyState
              compact
              icon={Webhook}
              title="No endpoints yet"
              description="Add one and every matching event is sent to it, signed, with retries for two hours."
            />
          )
        ) : (
          <ul className="divide-y overflow-hidden rounded-xl border">
            {hooks.map((hook) => (
              <li key={hook.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(hook.id)}
                  className="hover:bg-muted/50 flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-[var(--duration-micro)]"
                >
                  <StatusDot active={hook.active} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{hook.url}</span>
                    <span className="text-muted-foreground text-caption block truncate">
                      {hook.events.map(eventLabel).join(", ")}
                    </span>
                  </span>
                  <ChevronRight className="text-muted-foreground size-4 shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <DeveloperSection
        formId={formId}
        formTitle={formTitle}
        blocks={blocks}
        events={hooks[0]?.events ?? events}
      />
    </div>
  );
}

function StatusDot({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "size-2 shrink-0 rounded-full",
        active ? "bg-[var(--success)]" : "bg-muted-foreground/40",
      )}
      aria-label={active ? "Active" : "Off"}
    />
  );
}

function AddEndpointForm({
  formId,
  queryKey,
  events,
  onEventsChange,
  canCancel,
  onCancel,
  onCreated,
}: {
  formId: string;
  queryKey: string[];
  events: string[];
  onEventsChange: (events: string[]) => void;
  canCancel: boolean;
  onCancel: () => void;
  onCreated: (row: { url: string; secret: string }) => void;
}) {
  const queryClient = useQueryClient();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

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
      onCreated({ url: row.url, secret: row.secret });
      void queryClient.invalidateQueries({ queryKey });
    },
    // A refusal used to fall on the floor: the button did nothing and said
    // nothing about why.
    onError: (err: Error) => setError(err.message),
  });

  return (
    <form
      className="bg-muted/30 space-y-4 rounded-xl border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!url || events.length === 0) return;
        create.mutate({ url, events, formId });
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="webhook-url">Endpoint URL</Label>
        <Input
          id="webhook-url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://yourapp.com/api/webhooks/chatform"
        />
        <p className="text-muted-foreground text-caption">
          A public https URL on your server. We send a POST here.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Send me</Label>
        <div className="space-y-2">
          {EVENTS.map((event) => {
            const id = `evt-${event.name}`;
            const on = events.includes(event.name);
            return (
              <label key={event.name} htmlFor={id} className="flex cursor-pointer items-start gap-2.5">
                <Checkbox
                  id={id}
                  checked={on}
                  onCheckedChange={(checked) =>
                    onEventsChange(
                      checked ? [...events, event.name] : events.filter((x) => x !== event.name),
                    )
                  }
                  className="mt-0.5"
                />
                <span className="min-w-0">
                  <span className="block text-sm">{event.label}</span>
                  <span className="text-muted-foreground text-caption block">{event.blurb}</span>
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {error && <p className="text-caption text-destructive">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!url || events.length === 0 || create.isPending}>
          {create.isPending ? "Adding…" : "Add endpoint"}
        </Button>
        {canCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

/** One endpoint: what it is, a test button, and every delivery made to it. */
function EndpointDetail({
  hook,
  formId,
  onBack,
}: {
  hook: WebhookRow;
  formId: string;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [result, setResult] = useState<TestResult | null>(null);
  const deliveriesKey = ["webhook-deliveries", hook.id];

  const test = useMutation({
    mutationFn: () =>
      customFetch<{ ok: boolean; status?: number | null; error?: string | null }>(
        `/api/webhooks/${hook.id}/test`,
        { method: "POST" },
      ),
    onSuccess: (res) => {
      setResult({
        ok: res.ok,
        text: res.ok
          ? `Connected. Your endpoint replied ${res.status ?? "OK"}.`
          : res.status
            ? `Failed. Your endpoint replied HTTP ${res.status}.`
            : `Failed. ${res.error ?? "Could not reach the URL"}.`,
      });
      void queryClient.invalidateQueries({ queryKey: deliveriesKey });
    },
    onError: (err: Error) => setResult({ ok: false, text: err.message }),
  });

  const remove = useMutation({
    mutationFn: () => customFetch(`/api/webhooks/${hook.id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["webhooks", formId] });
      onBack();
    },
  });

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-3.5" />
        All endpoints
      </button>

      <section className="space-y-4">
        <div className="space-y-1.5">
          <Label>Endpoint URL</Label>
          <div className="flex items-start gap-2">
            <p className="bg-muted/40 min-w-0 flex-1 rounded-lg px-3 py-2 font-mono text-xs break-all">
              {hook.url}
            </p>
            <CopyButton value={hook.url} />
          </div>
        </div>

        <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-3 text-sm">
          <dt className="text-muted-foreground">Status</dt>
          <dd className="flex items-center gap-2">
            <StatusDot active={hook.active} />
            {hook.active ? "Active" : "Off after repeated failures"}
          </dd>
          <dt className="text-muted-foreground">Events</dt>
          <dd className="flex flex-wrap gap-1.5">
            {hook.events.map((event) => (
              <Badge key={event} variant="secondary" title={event}>
                {eventLabel(event)}
              </Badge>
            ))}
          </dd>
          <dt className="text-muted-foreground">Signing secret</dt>
          <dd className="font-mono text-xs">{hook.secretPreview ?? "whsec_…"}</dd>
        </dl>

        <div className="space-y-2">
          <div className="flex gap-2">
            <Button size="sm" disabled={test.isPending} onClick={() => test.mutate()}>
              <Send className="size-3.5" />
              {test.isPending ? "Testing…" : "Test connection"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() =>
                confirm({
                  title: "Delete this endpoint?",
                  description: "ChatForm stops sending events to it right away.",
                  onConfirm: () => remove.mutateAsync().then(() => undefined),
                })
              }
            >
              <Trash2 className="size-3.5" />
              Delete
            </Button>
          </div>
          {result && (
            <p
              className={cn(
                "text-caption",
                result.ok ? "text-[var(--success)]" : "text-destructive",
              )}
            >
              {result.text}
            </p>
          )}
        </div>
      </section>

      <Deliveries webhookId={hook.id} queryKey={deliveriesKey} />
      {dialog}
    </div>
  );
}

/**
 * The delivery log.
 *
 * The endpoint has existed since webhooks shipped and nothing ever called it,
 * which meant "my webhook isn't firing" had no answer inside the product.
 */
function Deliveries({ webhookId, queryKey }: { webhookId: string; queryKey: string[] }) {
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey,
    queryFn: () => customFetch<Delivery[]>(`/api/webhooks/${webhookId}/deliveries`),
  });
  const rows = Array.isArray(data) ? data : [];
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="text-h3 flex-1">Deliveries</h3>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Refresh deliveries"
          disabled={isFetching}
          onClick={() => void refetch()}
        >
          <RefreshCw className={cn("size-3.5", isFetching && "animate-spin")} />
        </Button>
      </div>

      {isLoading ? (
        <div className="bg-muted h-12 animate-pulse rounded-xl" />
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground text-caption rounded-xl border border-dashed p-4">
          Nothing sent yet. Press Test connection, or submit a response to this form.
        </p>
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border">
          {rows.map((row) => {
            const ok = row.status === "success";
            const isOpen = expanded === row.id;
            return (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : row.id)}
                  className="hover:bg-muted/50 flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm"
                >
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      ok
                        ? "bg-[var(--success)]"
                        : row.status === "failed"
                          ? "bg-[var(--warning)]"
                          : "bg-destructive",
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {row.event_type === "test" ? "Test" : eventLabel(row.event_type)}
                  </span>
                  <span
                    className={cn(
                      "text-caption shrink-0",
                      ok ? "text-muted-foreground" : "text-destructive",
                    )}
                  >
                    {row.response_status ?? (ok ? "OK" : "Error")}
                  </span>
                  <span className="text-muted-foreground text-caption shrink-0">
                    {formatDateTime(row.created_at)}
                  </span>
                  <ChevronDown
                    className={cn(
                      "text-muted-foreground size-3.5 shrink-0 transition-transform duration-[var(--duration-micro)]",
                      isOpen && "rotate-180",
                    )}
                  />
                </button>
                {isOpen && (
                  <div className="space-y-2 px-3 pb-3">
                    <p className="text-caption text-muted-foreground">
                      {ok
                        ? "Delivered."
                        : row.status === "failed"
                          ? `Failed (${row.last_error ?? "error"}). Attempt ${row.attempt}, retrying.`
                          : `Failed (${row.last_error ?? "error"}). Gave up after ${row.attempt} attempts.`}
                    </p>
                    {row.payload && <JsonBlock json={prettyJson(row.payload)} />}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function prettyJson(raw: string) {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function JsonBlock({ json }: { json: string }) {
  return (
    <div className="relative">
      <pre className="bg-muted/50 max-h-96 overflow-auto rounded-xl p-3 pr-10 font-mono text-xs leading-relaxed">
        {json}
      </pre>
      <CopyButton value={json} className="absolute top-2 right-2" toastMessage="Copied" />
    </div>
  );
}

/**
 * What the endpoint will receive, and a prompt that has an AI agent build it.
 *
 * Without this the panel asked for a URL and never said what would arrive at
 * it, so nobody could write the receiving side.
 */
function DeveloperSection({
  formId,
  formTitle,
  blocks,
  events,
}: {
  formId: string;
  formTitle: string;
  blocks: Block[];
  events: string[];
}) {
  const [view, setView] = useState<"prompt" | "payload">("prompt");
  const payload = JSON.stringify(samplePayload(formId, blocks, events[0]), null, 2);
  const prompt = aiSetupPrompt({ formId, formTitle, blocks, events });

  return (
    <section className="space-y-3 border-t pt-6">
      <div className="flex items-center gap-2">
        <h3 className="text-h3 flex-1">Build the receiving side</h3>
        <SegmentedControl
          options={[
            { value: "prompt", label: "AI prompt" },
            { value: "payload", label: "Payload" },
          ]}
          value={view}
          onChange={setView}
          size="sm"
          ariaLabel="Show"
        />
      </div>

      {view === "prompt" ? (
        <div className="space-y-2">
          <p className="text-muted-foreground text-caption">
            Paste into Claude Code, Cursor or any AI coding tool, inside your project. It adds
            the endpoint, checks the signature and maps every question on this form.
          </p>
          <Textarea
            readOnly
            value={prompt}
            rows={12}
            className="font-mono text-xs leading-relaxed"
            onFocus={(e) => e.currentTarget.select()}
          />
          <CopyButton
            value={prompt}
            label="Copy AI prompt"
            toastMessage="AI prompt copied"
            variant="default"
            size="sm"
          />
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-muted-foreground text-caption">
            Each event is a POST with this JSON body. Every answer carries its question, type,
            options, the raw value and a readable version. Values here are samples.
          </p>
          <JsonBlock json={payload} />
          <dl className="text-caption grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="font-mono">x-chatform-event</dt>
            <dd className="text-muted-foreground">The event name</dd>
            <dt className="font-mono">x-chatform-delivery</dt>
            <dd className="text-muted-foreground">Unique id, for skipping repeats</dd>
            <dt className="font-mono">x-chatform-signature</dt>
            <dd className="text-muted-foreground">
              <code>t=…, v1=…</code>, HMAC-SHA256 of <code>t.body</code> with your secret
            </dd>
          </dl>
        </div>
      )}
    </section>
  );
}
