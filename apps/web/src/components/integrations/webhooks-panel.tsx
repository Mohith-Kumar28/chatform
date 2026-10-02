"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  Trash2,
} from "lucide-react";
import type { Block } from "@repo/form-schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { CopyButton } from "@/components/ui/copy-button";
import { CodeBlock } from "@/components/ui/code-block";
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

const EVENTS: { name: string; label: string }[] = [
  { name: "response.completed", label: "Response completed" },
  { name: "response.partial", label: "Partial response" },
  { name: "response.disqualified", label: "Disqualified" },
  { name: "response.abandoned", label: "Abandoned" },
];

/**
 * Names an existing endpoint may still carry. The three events at the bottom
 * were offered here once but nothing ever sends them, so they are no longer
 * offered; the API still accepts them, so old subscriptions keep their label.
 */
const OTHER_LABELS: Record<string, string> = {
  "response.resumed": "Resumed",
  "followup.sent": "Follow-up sent",
  "submission.completed": "Response completed",
  "submission.abandoned": "Abandoned",
  "response.answer_recorded": "Each answer",
  "session.started": "Session started",
  "form.published": "Form published",
};

const eventLabel = (name: string) => EVENTS.find((e) => e.name === name)?.label ?? OTHER_LABELS[name] ?? name;

/**
 * Whether the endpoint works, as the API judges it from its last delivery.
 * `active` alone only meant "not switched off", so an endpoint that had never
 * answered once still showed green.
 */
type Health = "untested" | "healthy" | "failing" | "off";

interface WebhookRow {
  id: string;
  url: string;
  events: string[];
  formId?: string | null;
  /** The first few characters. The full secret comes from `reveal-secret`. */
  secretPreview?: string;
  active: boolean;
  health?: Health;
  lastOutcome?: { ok: boolean; status: number | null; error: string | null; at: number } | null;
}

interface Attempt {
  attempt: number;
  status: number | null;
  error: string | null;
  responseBody: string | null;
  durationMs: number | null;
  at: number;
}

interface Delivery {
  id: string;
  event: string;
  /** `pending` (queued or waiting to retry), `success`, or `failed` (out of retries). */
  status: "pending" | "success" | "failed";
  attempt: number;
  maxAttempts: number;
  responseStatus: number | null;
  lastError: string | null;
  nextAttemptAt: number | null;
  createdAt: number;
  attempts: Attempt[];
  payload?: string | null;
}

interface QueueCounts {
  pending: number;
  failed: number;
  delivered24h: number;
  lastDeliveredAt: number | null;
}

interface QueueStats {
  total: QueueCounts;
  endpoints: (QueueCounts & { webhookId: string })[];
}

/**
 * The queue's numbers for this form's endpoints. Polls while anything is
 * pending, so a retry landing shows up without a refresh.
 */
function useQueueStats(formId: string) {
  return useQuery({
    queryKey: ["webhook-stats", formId],
    queryFn: () => customFetch<QueueStats>(`/api/webhooks/stats?formId=${encodeURIComponent(formId)}`),
    refetchInterval: (q) => ((q.state.data?.total.pending ?? 0) > 0 ? 15_000 : false),
  });
}

type TestReply = { ok: boolean; status?: number | null; error?: string | null };

const sendTest = (id: string) => customFetch<TestReply>(`/api/webhooks/${id}/test`, { method: "POST" });

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
  const { data: stats } = useQueueStats(formId);

  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  /** The secret from the create response, so the new endpoint's page shows it without a round trip. */
  const [fresh, setFresh] = useState<{ id: string; secret: string } | null>(null);
  const [events, setEvents] = useState<string[]>(["response.completed"]);

  const open = hooks.find((h) => h.id === openId);
  if (open) {
    return (
      <EndpointDetail
        hook={open}
        formId={formId}
        counts={stats?.endpoints.find((e) => e.webhookId === open.id)}
        initialSecret={fresh?.id === open.id ? fresh.secret : null}
        onBack={() => setOpenId(null)}
      />
    );
  }

  const showForm = adding || (!isLoading && hooks.length === 0);

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <h3 className="text-h3 flex-1">Endpoints</h3>
          {!showForm && (
            <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
              <Plus className="size-3.5" />
              Add endpoint
            </Button>
          )}
        </div>

        {showForm && (
          <AddEndpointForm
            formId={formId}
            queryKey={queryKey}
            events={events}
            onEventsChange={setEvents}
            canCancel={hooks.length > 0}
            onCancel={() => setAdding(false)}
            onCreated={(row) => {
              // Straight to the new endpoint: its secret, its test result, its log.
              setFresh(row);
              setAdding(false);
              setOpenId(row.id);
            }}
          />
        )}

        {isLoading ? (
          <div className="bg-muted h-14 animate-pulse rounded-xl" />
        ) : (
          hooks.length > 0 && (
            <ul className="divide-y overflow-hidden rounded-xl border">
              {hooks.map((hook) => (
                <li key={hook.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(hook.id)}
                    className="hover:bg-muted/50 flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors duration-[var(--duration-micro)]"
                  >
                    <span className="min-w-0 flex-1 truncate font-mono text-xs">{hook.url}</span>
                    <HealthLabel health={healthOf(hook)} />
                    <ChevronRight className="text-muted-foreground size-4 shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          )
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

const healthOf = (hook: WebhookRow): Health => hook.health ?? (hook.active ? "untested" : "off");

const HEALTH: Record<Health, { label: string; dot: string; text: string }> = {
  healthy: { label: "Working", dot: "bg-[var(--success)]", text: "text-[var(--success)]" },
  failing: { label: "Failing", dot: "bg-destructive", text: "text-destructive" },
  untested: { label: "Not tested", dot: "bg-muted-foreground/40", text: "text-muted-foreground" },
  off: { label: "Off", dot: "bg-muted-foreground/40", text: "text-muted-foreground" },
};

function HealthLabel({ health }: { health: Health }) {
  const h = HEALTH[health];
  return (
    <span className={cn("text-caption inline-flex shrink-0 items-center gap-1.5 font-medium", h.text)}>
      <span className={cn("size-1.5 rounded-full", h.dot)} aria-hidden />
      {h.label}
    </span>
  );
}

/** Pending, failed and delivered, each labelled. */
function QueueStrip({ counts }: { counts: QueueCounts }) {
  const items = [
    { label: "Pending", value: counts.pending, hint: "Queued or waiting for a retry" },
    { label: "Failed", value: counts.failed, hint: "Out of retries. Retry them from the list below" },
    { label: "Delivered (24h)", value: counts.delivered24h, hint: "Accepted by your server in the last 24 hours" },
  ];
  return (
    <dl className="grid grid-cols-3 divide-x overflow-hidden rounded-xl border">
      {items.map((item) => (
        <div key={item.label} className="px-3 py-2.5" title={item.hint}>
          <dt className="text-muted-foreground text-caption">{item.label}</dt>
          <dd
            className={cn(
              "text-sm font-medium tabular-nums",
              item.label === "Failed" && item.value > 0 && "text-destructive",
            )}
          >
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
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
  onCreated: (row: { id: string; secret: string }) => void;
}) {
  const queryClient = useQueryClient();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"idle" | "adding" | "testing">("idle");

  /**
   * Add, then test at once. An endpoint used to land in the list with a green
   * dot and nothing ever sent to it, so a URL that 404'd looked connected until
   * the first real response went missing.
   */
  const create = useMutation({
    mutationFn: async (body: { url: string; events: string[]; formId: string }) => {
      setStep("adding");
      const row = await customFetch<WebhookRow & { secret: string }>("/api/webhooks", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setStep("testing");
      // A test that cannot reach the server is a result to show, not a failed add.
      await sendTest(row.id).catch(() => undefined);
      return row;
    },
    onSuccess: async (row) => {
      setUrl("");
      setError(null);
      await queryClient.invalidateQueries({ queryKey });
      onCreated({ id: row.id, secret: row.secret });
    },
    // A refusal used to fall on the floor: the button did nothing and said
    // nothing about why.
    onError: (err: Error) => setError(err.message),
    onSettled: () => setStep("idle"),
  });

  return (
    <form
      className="space-y-5 rounded-xl border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!url || events.length === 0) return;
        create.mutate({ url, events, formId });
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="webhook-url">Endpoint URL</Label>
        <Input
          id="webhook-url"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://yourapp.com/api/webhooks/chatform"
          className="font-mono text-xs"
        />
      </div>

      <div className="space-y-2.5">
        <Label>Events</Label>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {EVENTS.map((event) => {
            const id = `evt-${event.name}`;
            return (
              <label key={event.name} htmlFor={id} className="flex cursor-pointer items-center gap-2.5 text-sm">
                <Checkbox
                  id={id}
                  checked={events.includes(event.name)}
                  onCheckedChange={(checked) =>
                    onEventsChange(
                      checked ? [...events, event.name] : events.filter((x) => x !== event.name),
                    )
                  }
                />
                {event.label}
              </label>
            );
          })}
        </div>
      </div>

      {error && <p className="text-caption text-destructive">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!url || events.length === 0 || create.isPending}>
          {step === "adding" ? "Adding…" : step === "testing" ? "Testing…" : "Add endpoint"}
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

/** What the last delivery or test got back, in a few words. */
function outcomeText(hook: WebhookRow): string | null {
  const last = hook.lastOutcome;
  if (!last || last.ok) return null;
  return last.status != null ? `Replied HTTP ${last.status}` : (last.error ?? "No response");
}

/** One endpoint: its health, secret, a test button, and every delivery made to it. */
function EndpointDetail({
  hook,
  formId,
  counts,
  initialSecret,
  onBack,
}: {
  hook: WebhookRow;
  formId: string;
  counts: QueueCounts | undefined;
  initialSecret: string | null;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const deliveriesKey = ["webhook-deliveries", hook.id];
  const health = healthOf(hook);
  const failure = health === "failing" ? outcomeText(hook) : null;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["webhooks", formId] });
    void queryClient.invalidateQueries({ queryKey: deliveriesKey });
  };

  const turnOn = useMutation({
    mutationFn: () =>
      customFetch(`/api/webhooks/${hook.id}`, { method: "PATCH", body: JSON.stringify({ active: true }) }),
    onSuccess: refresh,
  });

  const test = useMutation({ mutationFn: () => sendTest(hook.id), onSettled: refresh });

  const remove = useMutation({
    mutationFn: () => customFetch(`/api/webhooks/${hook.id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["webhooks", formId] });
      onBack();
    },
  });

  return (
    <div className="space-y-8">
      <button
        type="button"
        onClick={onBack}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-3.5" />
        Endpoints
      </button>

      <section className="space-y-5">
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <p className="min-w-0 flex-1 pt-1.5 font-mono text-sm break-all">{hook.url}</p>
            <CopyButton value={hook.url} />
          </div>
          <HealthLabel health={health} />
        </div>

        {health === "failing" && (
          <div className="border-destructive/30 bg-destructive/5 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3">
            <p className="text-destructive min-w-0 flex-1 text-sm">{failure}</p>
            <Button size="sm" variant="outline" disabled={test.isPending} onClick={() => test.mutate()}>
              <Send className="size-3.5" />
              {test.isPending ? "Testing…" : "Test again"}
            </Button>
          </div>
        )}

        <dl className="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-x-3 gap-y-4 text-sm">
          <dt className="text-muted-foreground">Events</dt>
          <dd className="flex flex-wrap gap-1.5">
            {hook.events.map((event) => (
              <Badge key={event} variant="secondary" title={event}>
                {eventLabel(event)}
              </Badge>
            ))}
          </dd>
          <dt className="text-muted-foreground">Signing secret</dt>
          <dd>
            <SigningSecret hookId={hook.id} preview={hook.secretPreview} initial={initialSecret} />
          </dd>
        </dl>

        <div className="flex flex-wrap gap-2">
          {hook.active ? (
            health !== "failing" && (
              <Button size="sm" variant={health === "untested" ? "default" : "outline"} disabled={test.isPending} onClick={() => test.mutate()}>
                <Send className="size-3.5" />
                {test.isPending ? "Testing…" : "Send test event"}
              </Button>
            )
          ) : (
            <Button size="sm" disabled={turnOn.isPending} onClick={() => turnOn.mutate()}>
              {turnOn.isPending ? "Turning on…" : "Turn back on"}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive ml-auto"
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
        {test.error && <p className="text-caption text-destructive">{test.error.message}</p>}
      </section>

      {counts && <QueueStrip counts={counts} />}

      <Deliveries webhookId={hook.id} formId={formId} queryKey={deliveriesKey} />
      {dialog}
    </div>
  );
}

/** Masked until asked for, then copyable, the way Stripe and Svix show theirs. */
function SigningSecret({ hookId, preview, initial }: { hookId: string; preview?: string; initial: string | null }) {
  const [secret, setSecret] = useState<string | null>(initial);
  const reveal = useMutation({
    mutationFn: () =>
      customFetch<{ secret: string }>(`/api/webhooks/${hookId}/reveal-secret`, { method: "POST" }),
    onSuccess: (res) => setSecret(res.secret),
  });

  return (
    <div className="flex items-center gap-1">
      <code className="bg-muted/50 min-w-0 flex-1 truncate rounded-md px-2 py-1.5 font-mono text-xs">
        {secret ?? `${(preview ?? "whsec_").replace(/…$/, "")}••••••••••••`}
      </code>
      {secret ? (
        <>
          <Button variant="ghost" size="icon-sm" aria-label="Hide secret" onClick={() => setSecret(null)}>
            <EyeOff className="size-3.5" />
          </Button>
          <CopyButton value={secret} toastMessage="Signing secret copied" />
        </>
      ) : (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Reveal secret"
          disabled={reveal.isPending}
          onClick={() => reveal.mutate()}
        >
          <Eye className="size-3.5" />
        </Button>
      )}
    </div>
  );
}

type Filter = "all" | "pending" | "failed";

/**
 * The delivery log: every event sent to this endpoint, each with its attempts.
 *
 * "Failed" is the dead-letter list: deliveries that ran out of retries. They
 * stay there until someone retries them or they age out after 30 days.
 */
function Deliveries({ webhookId, formId, queryKey }: { webhookId: string; formId: string; queryKey: string[] }) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: [...queryKey, filter],
    queryFn: () =>
      customFetch<Delivery[]>(
        `/api/webhooks/${webhookId}/deliveries${filter === "all" ? "" : `?status=${filter}`}`,
      ),
    refetchInterval: (q) => (q.state.data?.some((d) => d.status === "pending") ? 15_000 : false),
  });
  const rows = Array.isArray(data) ? data : [];
  const [expanded, setExpanded] = useState<string | null>(null);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey });
    void queryClient.invalidateQueries({ queryKey: ["webhook-stats", formId] });
  };
  const retryOne = useMutation({
    mutationFn: (deliveryId: string) =>
      customFetch(`/api/webhooks/${webhookId}/deliveries/${deliveryId}/retry`, { method: "POST" }),
    onSuccess: refresh,
  });
  const retryAll = useMutation({
    mutationFn: () => customFetch<{ queued: number }>(`/api/webhooks/${webhookId}/retry-failed`, { method: "POST" }),
    onSuccess: refresh,
  });

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-h3 flex-1">Deliveries</h3>
        <SegmentedControl
          options={[
            { value: "all", label: "All" },
            { value: "pending", label: "Pending" },
            { value: "failed", label: "Failed" },
          ]}
          value={filter}
          onChange={setFilter}
          size="sm"
          ariaLabel="Show"
        />
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

      {filter === "failed" && rows.some((r) => r.event !== "test") && (
        <Button variant="outline" size="sm" disabled={retryAll.isPending} onClick={() => retryAll.mutate()}>
          <RotateCcw className="size-3.5" />
          {retryAll.isPending ? "Retrying…" : "Retry all failed"}
        </Button>
      )}

      {isLoading ? (
        <div className="bg-muted h-12 animate-pulse rounded-xl" />
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground text-caption rounded-xl border border-dashed p-4">
          {filter === "failed"
            ? "Nothing failed."
            : filter === "pending"
              ? "Nothing waiting to be sent."
              : "Nothing sent yet."}
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
                  className="hover:bg-muted/50 flex w-full flex-wrap items-center gap-x-2.5 gap-y-1 px-3 py-2.5 text-left text-sm"
                >
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      ok
                        ? "bg-[var(--success)]"
                        : row.status === "pending"
                          ? "bg-[var(--warning)]"
                          : "bg-destructive",
                    )}
                  />
                  <span className="min-w-[8rem] flex-1">
                    {row.event === "test" ? "Test" : eventLabel(row.event)}
                  </span>
                  <span
                    className={cn(
                      "text-caption shrink-0",
                      ok ? "text-muted-foreground" : row.status === "pending" ? "text-[var(--warning)]" : "text-destructive",
                    )}
                  >
                    {ok ? "Delivered" : row.status === "pending" ? "Pending" : "Failed"}
                  </span>
                  <span className="text-muted-foreground text-caption shrink-0">
                    {formatDateTime(row.createdAt)}
                  </span>
                  <ChevronDown
                    className={cn(
                      "text-muted-foreground size-3.5 shrink-0 transition-transform duration-[var(--duration-micro)]",
                      isOpen && "rotate-180",
                    )}
                  />
                </button>
                {isOpen && (
                  <div className="space-y-3 px-3 pb-3">
                    <p className="text-caption text-muted-foreground">
                      {ok
                        ? "Delivered."
                        : row.status === "pending"
                          ? row.attempt === 0
                            ? "Queued."
                            : `Attempt ${row.attempt} of ${row.maxAttempts} failed (${row.lastError ?? "error"}).${
                                row.nextAttemptAt ? ` Next try ${formatDateTime(row.nextAttemptAt)}.` : ""
                              }`
                          : `Failed (${row.lastError ?? "error"}). Gave up after ${row.attempt} ${
                              row.attempt === 1 ? "attempt" : "attempts"
                            }.`}
                    </p>
                    {row.attempts.length > 0 && <Attempts attempts={row.attempts} />}
                    {row.event !== "test" && row.status !== "pending" && (
                      <Button
                        variant="outline"
                        size="xs"
                        disabled={retryOne.isPending && retryOne.variables === row.id}
                        onClick={() => retryOne.mutate(row.id)}
                      >
                        <RotateCcw className="size-3" />
                        {ok ? "Send again" : "Retry"}
                      </Button>
                    )}
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

/** Each attempt: when, what the endpoint said, how long it took. */
function Attempts({ attempts }: { attempts: Attempt[] }) {
  return (
    <ol className="text-caption space-y-1.5">
      {attempts.map((a, i) => {
        const ok = a.status != null && a.status >= 200 && a.status < 300;
        return (
          <li key={i} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-2">
            <span className="text-muted-foreground">Attempt {a.attempt}</span>
            <span className="min-w-0">
              <span className={cn(ok ? "text-foreground" : "text-destructive")}>
                {a.status != null ? `HTTP ${a.status}` : (a.error ?? "No response")}
              </span>
              <span className="text-muted-foreground">
                {" · "}
                {formatDateTime(a.at)}
                {a.durationMs != null && ` · ${a.durationMs} ms`}
              </span>
              {a.responseBody && !ok && (
                <span className="text-muted-foreground block truncate font-mono" title={a.responseBody}>
                  {a.responseBody}
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ol>
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
    <CodeBlock code={json} className="bg-muted/50 text-xs leading-relaxed" />
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
    <section className="space-y-5 border-t pt-8">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-h3 flex-1 whitespace-nowrap">Build the receiving side</h3>
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
        <div className="space-y-3">
          <Textarea
            readOnly
            value={prompt}
            rows={12}
            aria-label="AI prompt"
            className="h-80 resize-none overflow-y-auto font-mono text-xs leading-relaxed [field-sizing:fixed]"
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
        <div className="space-y-5">
          <JsonBlock json={payload} />
          <dl className="text-caption grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-[auto_1fr]">
            <dt className="font-mono">x-chatform-event</dt>
            <dd className="text-muted-foreground">Event name</dd>
            <dt className="font-mono">webhook-id</dt>
            <dd className="text-muted-foreground">Event id, the same on every retry</dd>
            <dt className="font-mono">webhook-signature</dt>
            <dd className="text-muted-foreground">
              Standard Webhooks signature of <code>id.timestamp.body</code>
            </dd>
            <dt className="font-mono">x-chatform-signature</dt>
            <dd className="text-muted-foreground">
              <code>t=…, v1=…</code>, HMAC-SHA256 of <code>t.body</code>
            </dd>
          </dl>
        </div>
      )}
    </section>
  );
}
