"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@/lib/api/mutator";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Trash2, Webhook, Send } from "lucide-react";
import { embedSnippet } from "@/lib/embed-snippet";

/**
 * The canonical names, with the newest events included.
 *
 * `response.partial` is the one worth offering: until it existed, a
 * half-finished response was invisible until it timed out, which is exactly as
 * long as it was worth following up on.
 */
const EVENTS = [
  "response.completed",
  "response.abandoned",
  "response.partial",
  "session.started",
  "form.published",
] as const;

interface WebhookRow {
  id: string;
  url: string;
  events: string[];
  /**
   * The first few characters, for telling two endpoints apart. The full secret
   * is returned once, at creation, and never again — so reading `secret` here
   * threw on every webhook that already existed.
   */
  secretPreview?: string;
  active: boolean;
}

export function IntegrateClient({ formId, slug }: { formId: string; slug: string }) {
  const queryClient = useQueryClient();
  const { data: rawHooks } = useQuery({
    // Keyed by form: every webhook created here carries this form's id, so
    // listing every endpoint in the organization showed people other forms'
    // integrations on this one's page.
    queryKey: ["webhooks", formId],
    queryFn: () => customFetch<(WebhookRow & { formId?: string | null })[]>("/api/webhooks"),
  });
  const hooks = (Array.isArray(rawHooks) ? rawHooks : []).filter(
    (h) => !h.formId || h.formId === formId,
  ) as unknown as WebhookRow[];

  const [url, setUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>(["response.completed"]);
  const [testResult, setTestResult] = useState<Record<string, string>>({});

  const create = useMutation({
    mutationFn: (body: { url: string; events: string[]; formId: string }) =>
      customFetch("/api/webhooks", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      setUrl("");
      void queryClient.invalidateQueries({ queryKey: ["webhooks", formId] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => customFetch(`/api/webhooks/${id}`, { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["webhooks"] }),
  });
  const test = useMutation({
    mutationFn: async (id: string) => {
      const res = await customFetch<{ ok: boolean }>(`/api/webhooks/${id}/test`, { method: "POST" });
      return res;
    },
    onSuccess: (res, id) => {
      setTestResult((prev) => ({ ...prev, [id]: res.ok ? "delivered ✓" : "failed ✕" }));
    },
  });

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-6">
      <div>
        <h2 className="font-display text-xl font-semibold">Integrations</h2>
        <p className="text-muted-foreground mt-1 text-sm">Push submissions to your systems in real time.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2 text-base">
            <Webhook className="size-4" /> Webhooks
          </CardTitle>
          <CardDescription>
            Signed with <code className="rounded bg-muted px-1">x-chatform-signature: t=…, v1=…</code> (HMAC-SHA256 of <code className="rounded bg-muted px-1">timestamp.body</code>).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!url) return;
              create.mutate({ url, events: selectedEvents, formId });
            }}
          >
            <div className="space-y-1.5">
              <Label>Payload URL (HTTPS)</Label>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://yourapp.com/hooks/chatform" />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {EVENTS.map((ev) => {
                const on = selectedEvents.includes(ev);
                return (
                  <button
                    key={ev}
                    type="button"
                    onClick={() => setSelectedEvents((prev) => (on ? prev.filter((x) => x !== ev) : [...prev, ev]))}
                    className={`rounded-full border px-3 py-1 text-xs ${on ? "bg-primary text-primary-foreground" : "hover:border-primary"}`}
                  >
                    {ev}
                  </button>
                );
              })}
            </div>
            <Button type="submit" size="sm" className="rounded-full" disabled={!url || create.isPending}>
              {create.isPending ? "Adding…" : "Add webhook"}
            </Button>
          </form>

          <div className="space-y-2">
            {hooks.map((h) => (
              <div key={h.id} className="rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{h.events.length} events</Badge>
                  <span className="min-w-0 flex-1 truncate text-sm">{h.url}</span>
                  <Button variant="ghost" size="icon" className="size-7" onClick={() => test.mutate(h.id)}>
                    <Send className="size-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="size-7" onClick={() => remove.mutate(h.id)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <code className="text-muted-foreground text-xs">{h.secretPreview ?? "whsec_…"}</code>
                  {testResult[h.id] && <Badge variant={testResult[h.id].includes("✓") ? "default" : "destructive"}>{testResult[h.id]}</Badge>}
                </div>
              </div>
            ))}
            {hooks.length === 0 && <p className="text-muted-foreground text-sm">No webhooks yet.</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-base">Embed this form</CardTitle>
          <CardDescription>Drop this into any page — renders a launcher bubble + chat panel.</CardDescription>
        </CardHeader>
        <CardContent>
          {/* One generator, shared with the Share view. The hardcoded snippet
              that used to live here pointed at a hostname that has not existed
              since the domain changed, so anyone who copied it got a form that
              never loaded. */}
          <pre className="bg-muted overflow-x-auto rounded-lg p-4 text-xs">
            {embedSnippet({
              slug,
              mode: "popup",
              origin: typeof window === "undefined" ? "https://chatform.in" : window.location.origin,
            })}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
