"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { customFetch } from "@/lib/api/mutator";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Sparkles, Trash2, Loader2, Search, ArrowUpDown, CircleHelp, ExternalLink } from "lucide-react";
import { useSession } from "@/lib/auth/auth-client";
import { startTour, useAutoTour } from "@/components/tour/product-tour";

interface FormRow {
  id: string;
  title: string;
  slug: string;
  status: string;
  responses: number;
}

export function DashboardContent() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const { data: rawForms, isLoading } = useQuery({
    queryKey: ["forms"],
    queryFn: () => customFetch<unknown>("/api/forms"),
  });
  const allForms = (Array.isArray(rawForms) ? rawForms : []) as unknown as FormRow[];
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest" | "most">("newest");
  const forms = allForms
    .filter((f) => f.title.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => {
      if (sort === "most") return b.responses - a.responses;
      const diff = b.id.localeCompare(a.id);
      return sort === "newest" ? diff : -diff;
    });

  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [mode, setMode] = useState<"blank" | "ai">("blank");
  const [aiError, setAiError] = useState<string | null>(null);

  const createBlank = useMutation({
    mutationFn: (body: { title: string }) => customFetch<{ id: string }>("/api/forms", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["forms"] }),
  });
  const createAi = useMutation({
    mutationFn: async (body: { prompt: string; questionCount: number }) => {
      const gen = await customFetch<{ doc: unknown; issues: unknown[] }>("/api/ai/generate-form", {
        method: "POST",
        body: JSON.stringify(body),
      });
      const created = await customFetch<{ id: string }>("/api/forms", {
        method: "POST",
        body: JSON.stringify({ title: gen.doc && (gen.doc as { title?: string }).title || "AI Form" }),
      });
      await customFetch(`/api/forms/${created.id}/doc`, {
        method: "PUT",
        body: JSON.stringify({ doc: gen.doc }),
      });
      await customFetch(`/api/forms/${created.id}/publish`, { method: "POST" });
      return created;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["forms"] });
      setCreateOpen(false);
      setAiPrompt("");
    },
    onError: (err) => setAiError(err instanceof Error ? err.message : "Generation failed"),
  });
  const deleteForm = useMutation({
    mutationFn: (id: string) => customFetch(`/api/forms/${id}`, { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["forms"] }),
  });

  const busy = createBlank.isPending || createAi.isPending;
  useAutoTour("dashboard", true);

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10">
      <header className="mb-10 flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Forms</h1>
          <p className="text-muted-foreground mt-1 text-sm">{session?.user?.email ?? "My Workspace"}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            asChild
            variant="ghost"
            size="sm"
          >
            <Link href="/api-keys">API keys</Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 rounded-full"
            aria-label="Replay product tour"
            data-tour="help-tour"
            onClick={() => startTour("dashboard")}
          >
            <CircleHelp className="size-4" />
          </Button>
          <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); setAiError(null); }}>
            <DialogTrigger asChild>
              <Button className="rounded-full" data-tour="new-form"><Plus className="size-4" /> New form</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-display">Create a form</DialogTitle>
              </DialogHeader>
              <div className="mb-2 flex rounded-full bg-muted p-1 text-sm">
                <button
                  type="button"
                  className={`flex-1 rounded-full py-1.5 ${mode === "blank" ? "bg-background font-medium shadow-sm" : "text-muted-foreground"}`}
                  onClick={() => setMode("blank")}
                >
                  Start blank
                </button>
                <button
                  type="button"
                  className={`flex-1 rounded-full py-1.5 ${mode === "ai" ? "bg-background font-medium shadow-sm" : "text-muted-foreground"}`}
                  onClick={() => setMode("ai")}
                >
                  <Sparkles className="mr-1 inline size-3.5 text-[var(--primary)]" /> Generate with AI
                </button>
              </div>
              {mode === "blank" ? (
                <form
                  className="space-y-4"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!title.trim()) return;
                    await createBlank.mutateAsync({ title: title.trim() });
                    setTitle("");
                    setCreateOpen(false);
                  }}
                >
                  <div className="space-y-1.5">
                    <Label>Form name</Label>
                    <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Customer Feedback" autoFocus />
                  </div>
                  <Button type="submit" disabled={busy || !title.trim()} className="w-full rounded-full">
                    {createBlank.isPending ? "Creating…" : "Create form"}
                  </Button>
                </form>
              ) : (
                <form
                  className="space-y-4"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setAiError(null);
                    await createAi.mutateAsync({ prompt: aiPrompt, questionCount: 6 });
                  }}
                >
                  <div className="space-y-1.5">
                    <Label>Describe your form</Label>
                    <Textarea
                      rows={3}
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      placeholder="e.g. A job application form for a barista role — contact info, experience, availability, and a cover note"
                      autoFocus
                    />
                  </div>
                  {aiError && <p className="text-destructive text-sm">{aiError}</p>}
                  <Button type="submit" disabled={busy || aiPrompt.trim().length < 5} className="w-full rounded-full">
                    {createAi.isPending ? (
                      <><Loader2 className="mr-1.5 size-3.5 animate-spin" /> Generating…</>
                    ) : (
                      <><Sparkles className="mr-1.5 size-3.5" /> Generate form</>
                    )}
                  </Button>
                </form>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </header>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : forms.length === 0 ? (
        <Card data-tour="form-grid" className="border-dashed">
          <CardHeader className="items-center pt-12 text-center">
            <CardTitle className="font-display text-xl">No forms yet</CardTitle>
            <CardDescription>Create your first agentic form — it takes 30 seconds.</CardDescription>
          </CardHeader>
          <CardFooter className="justify-center pb-10">
            <Button className="rounded-full" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" /> Create form
            </Button>
          </CardFooter>
        </Card>
      ) : (
        <div data-tour="form-grid" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {forms.map((f) => (
            <Link
              key={f.id}
              href={`/forms/${f.id}`}
              className="group bg-card rounded-xl border transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex h-24 items-end rounded-t-xl bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-3">
                <span className="font-display text-lg font-semibold leading-tight">{f.title}</span>
              </div>
              <div className="space-y-2 p-3">
                <p className="text-muted-foreground truncate text-xs">/f/{f.slug}</p>
                <div className="flex items-center gap-2">
                  <Badge variant={f.status === "published" ? "default" : "secondary"}>{f.status}</Badge>
                  <span className="text-muted-foreground text-xs">{f.responses} responses</span>
                  <span className="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <span
                      role="button"
                      aria-label={`Preview ${f.title}`}
                      className="hover:bg-accent hover:text-foreground rounded-md p-1.5"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        window.open(`/f/${f.slug}`, "_blank");
                      }}
                    >
                      <ExternalLink className="size-3.5" />
                    </span>
                    <span
                      role="button"
                      aria-label={`Delete ${f.title}`}
                      className="hover:bg-accent hover:text-destructive rounded-md p-1.5"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (confirm(`Delete "${f.title}"? This cannot be undone.`)) deleteForm.mutate(f.id);
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </span>
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
