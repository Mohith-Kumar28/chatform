"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@/lib/api/mutator";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Key, Plus, Trash2, Copy, Check } from "lucide-react";

interface KeyRow {
  id: string;
  name: string | null;
  start: string | null;
  enabled: boolean;
  lastUsedAt: number | null;
  createdAt: number;
}

export default function ApiKeysPage() {
  const queryClient = useQueryClient();
  const { data: rawKeys } = useQuery({
    queryKey: ["keys"],
    queryFn: () => customFetch<KeyRow[]>("/api/keys"),
  });
  const keys = (Array.isArray(rawKeys) ? rawKeys : []) as unknown as KeyRow[];
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("Production key");
  const [createdRaw, setCreatedRaw] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const createKey = useMutation({
    mutationFn: (body: { name: string }) => customFetch<{ key: string }>("/api/keys", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (data) => {
      setCreatedRaw(data.key);
      void queryClient.invalidateQueries({ queryKey: ["keys"] });
    },
  });
  const revokeKey = useMutation({
    mutationFn: (id: string) => customFetch(`/api/keys/${id}`, { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["keys"] }),
  });

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">API keys</h1>
          <p className="text-muted-foreground mt-1 text-sm">Drive chatform headlessly from your own products.</p>
        </div>
        <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) setCreatedRaw(null); }}>
          <DialogTrigger asChild>
            <Button className="rounded-full"><Plus className="size-4" /> Create key</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-display">Create API key</DialogTitle>
            </DialogHeader>
            {createdRaw ? (
              <div className="space-y-3">
                <p className="text-sm font-medium">Copy your key now — it won&apos;t be shown again.</p>
                <div className="flex items-center gap-2 rounded-lg border bg-muted p-3">
                  <code className="min-w-0 flex-1 truncate font-mono text-xs">{createdRaw}</code>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0"
                    onClick={async () => {
                      await navigator.clipboard.writeText(createdRaw);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }}
                  >
                    {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                  </Button>
                </div>
                <Button className="w-full rounded-full" onClick={() => { setCreateOpen(false); setCreatedRaw(null); }}>
                  Done
                </Button>
              </div>
            ) : (
              <form
                className="space-y-4"
                onSubmit={async (e) => {
                  e.preventDefault();
                  await createKey.mutateAsync({ name });
                }}
              >
                <div className="space-y-1.5">
                  <Label htmlFor="key-name">Key name</Label>
                  <Input id="key-name" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <Button type="submit" disabled={createKey.isPending} className="w-full rounded-full">
                  {createKey.isPending ? "Creating…" : "Create key"}
                </Button>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2 text-base"><Key className="size-4" /> Your keys</CardTitle>
          <CardDescription>Send as <code className="rounded bg-muted px-1">Authorization: Bearer sk_live_…</code></CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {keys.length === 0 && <p className="text-muted-foreground text-sm">No keys yet.</p>}
          {keys.map((k) => (
            <div key={k.id} className="flex items-center gap-3 rounded-lg border px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{k.name}</p>
                <code className="text-muted-foreground text-xs">{k.start}…</code>
              </div>
              <Badge variant={k.enabled ? "default" : "secondary"}>{k.enabled ? "active" : "revoked"}</Badge>
              <span className="text-muted-foreground text-xs">
                {k.lastUsedAt ? `used ${new Date(k.lastUsedAt).toLocaleDateString()}` : "never used"}
              </span>
              {k.enabled && (
                <Button variant="ghost" size="icon" className="size-8" onClick={() => revokeKey.mutate(k.id)}>
                  <Trash2 className="size-3.5" />
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="font-display text-base">Quick start</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="bg-muted overflow-x-auto rounded-lg p-4 text-xs leading-relaxed">{`curl -X POST \\
  http://localhost:8787/v1/forms/FORM_ID/chat/sessions \\
  -H "Authorization: Bearer sk_live_..." \\
  -d '{}'`}</pre>
        </CardContent>
      </Card>
    </div>
  );
}
