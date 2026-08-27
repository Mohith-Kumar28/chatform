"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpDown,
  Copy,
  ExternalLink,
  LayoutGrid,
  Loader2,
  MessageSquarePlus,
  MoreHorizontal,
  Plus,
  Rows3,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { customFetch } from "@/lib/api/mutator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { AiCapBanner } from "@/components/billing/ai-cap-banner";

interface FormRow {
  id: string;
  title: string;
  slug: string;
  status: string;
  responses: number;
  updatedAt: number;
}

type Sort = "newest" | "oldest" | "responses" | "alpha";

export function DashboardContent() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();

  const { data, isLoading } = useQuery({
    queryKey: ["forms"],
    queryFn: () => customFetch<unknown>("/api/forms"),
  });
  const allForms = (Array.isArray(data) ? data : []) as FormRow[];

  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  // ?new=1 lets the command palette open the create dialog.
  const [createOpen, setCreateOpen] = useState(searchParams.get("new") === "1");
  const [pendingDelete, setPendingDelete] = useState<FormRow | null>(null);

  const forms = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allForms
      .filter((f) => !q || f.title.toLowerCase().includes(q) || f.slug.includes(q))
      .sort((a, b) => {
        switch (sort) {
          case "responses":
            return b.responses - a.responses;
          case "alpha":
            return a.title.localeCompare(b.title);
          case "oldest":
            // Sort on the real timestamp. This used to compare ids as a proxy
            // for recency, which is only accidentally correct.
            return a.updatedAt - b.updatedAt;
          default:
            return b.updatedAt - a.updatedAt;
        }
      });
  }, [allForms, query, sort]);

  const remove = useMutation({
    mutationFn: (id: string) => customFetch(`/api/forms/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["forms"] });
      toast.success("Form deleted");
    },
    onError: (e) => toast.error("Couldn't delete", { description: (e as Error).message }),
  });

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <PageHeader
        title="Forms"
        description="Conversations that collect what you need."
        actions={
          <Button shape="pill" onClick={() => setCreateOpen(true)} data-tour="new-form">
            <Plus className="size-4" />
            New form
          </Button>
        }
      />

      {/* Only renders past 80% of the AI cap, and only for someone with forms — the rule is
          never to sell before there is data. */}
      {allForms.length > 0 && (
        <div className="mt-6">
          <AiCapBanner />
        </div>
      )}

      {allForms.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search forms…"
              className="h-9 rounded-full pl-8"
            />
          </div>

          {/* Both of these were declared as state and never rendered, so the
              imported Search and ArrowUpDown icons sat unused. */}
          <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
            <SelectTrigger className="h-9 w-auto gap-1.5 rounded-full">
              <ArrowUpDown className="size-3.5 opacity-60" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Recently updated</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
              <SelectItem value="responses">Most responses</SelectItem>
              <SelectItem value="alpha">Name A–Z</SelectItem>
            </SelectContent>
          </Select>

          <SegmentedControl
            size="sm"
            ariaLabel="Layout"
            options={[
              { value: "grid", label: "", icon: LayoutGrid },
              { value: "list", label: "", icon: Rows3 },
            ]}
            value={layout}
            onChange={setLayout}
            className="ml-auto hidden sm:inline-flex"
          />
        </div>
      )}

      <div className="mt-6">
        {isLoading ? (
          <div className={cn(layout === "grid" ? GRID : "space-y-2")}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="shimmer h-44 rounded-xl" />
            ))}
          </div>
        ) : allForms.length === 0 ? (
          <EmptyState
            icon={MessageSquarePlus}
            title="No forms yet"
            description="Create your first conversational form. Describe it in a sentence and the AI will draft it for you."
            action={
              <Button shape="pill" onClick={() => setCreateOpen(true)}>
                <Sparkles className="size-4" />
                Create your first form
              </Button>
            }
            hint="Or start from a template."
          />
        ) : forms.length === 0 ? (
          <EmptyState
            compact
            icon={Search}
            title={`Nothing matches “${query}”`}
            description="Try a different search."
            action={
              <Button variant="ghost" size="sm" onClick={() => setQuery("")}>
                Clear search
              </Button>
            }
          />
        ) : (
          <ul className={cn(layout === "grid" ? GRID : "space-y-2")} data-tour="form-list">
            {forms.map((form) => (
              <li key={form.id}>
                <FormCard
                  form={form}
                  layout={layout}
                  onDelete={() => setPendingDelete(form)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <CreateFormDialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open && searchParams.get("new")) router.replace("/dashboard");
        }}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={`Delete “${pendingDelete?.title}”?`}
        description="Responses already collected stay in your account, but the form stops accepting new ones and disappears from this list."
        confirmLabel="Delete form"
        onConfirm={async () => {
          if (pendingDelete) await remove.mutateAsync(pendingDelete.id);
        }}
      />
    </div>
  );
}

const GRID = "grid gap-4 sm:grid-cols-2 lg:grid-cols-3";

function FormCard({
  form,
  layout,
  onDelete,
}: {
  form: FormRow;
  layout: "grid" | "list";
  onDelete: () => void;
}) {
  const published = form.status === "published";
  const publicUrl = typeof window !== "undefined" ? `${window.location.origin}/f/${form.slug}` : "";

  const meta = (
    <>
      <Badge variant={published ? "secondary" : "outline"} className={cn(published && "text-[var(--success)]")}>
        {published ? "Live" : "Draft"}
      </Badge>
      <span className="text-muted-foreground tabular text-xs">
        {form.responses} response{form.responses === 1 ? "" : "s"}
      </span>
      <span className="text-muted-foreground text-xs">{relativeTime(form.updatedAt)}</span>
    </>
  );

  const actions = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Actions for ${form.title}`}
          onClick={(e) => e.preventDefault()}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem asChild>
          <Link href={`/forms/${form.id}/results`}>Results</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/forms/${form.id}/share`}>Share</Link>
        </DropdownMenuItem>
        {published && (
          <>
            <DropdownMenuItem
              onSelect={async () => {
                await navigator.clipboard.writeText(publicUrl);
                toast.success("Link copied");
              }}
            >
              <Copy className="size-3.5" />
              Copy link
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={`/f/${form.slug}`} target="_blank" rel="noreferrer">
                <ExternalLink className="size-3.5" />
                Open live form
              </a>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2 className="size-3.5" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (layout === "list") {
    return (
      <div className="bg-card hover:bg-muted/40 flex items-center gap-3 rounded-xl px-4 py-3 transition-colors">
        <Link href={`/forms/${form.id}/build`} className="min-w-0 flex-1">
          <p className="truncate font-medium">{form.title}</p>
          <div className="mt-0.5 flex items-center gap-2">{meta}</div>
        </Link>
        {actions}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "bg-card group relative overflow-hidden rounded-2xl",
        "shadow-xs hover:shadow-md transition-[box-shadow,border-color] duration-[var(--duration-standard)] ease-[var(--ease-out)]",
        ""
      )}
    >
      {/* The whole card is the target — it used to be a plain div with a tiny
          hover-revealed icon as the only way in. */}
      <Link href={`/forms/${form.id}/build`} className="block">
        <div className="from-primary-soft to-accent/40 relative h-24 bg-gradient-to-br">
          <div className="absolute inset-0 grid place-items-center">
            <span className="font-display text-primary/40 text-2xl">{form.title.charAt(0).toUpperCase()}</span>
          </div>
        </div>
        <div className="space-y-2 p-4">
          <p className="truncate font-medium">{form.title}</p>
          <div className="flex flex-wrap items-center gap-2">{meta}</div>
        </div>
      </Link>
      <div className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        {actions}
      </div>
    </div>
  );
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function CreateFormDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"ai" | "blank">("ai");
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      if (mode === "blank") {
        return customFetch<{ id: string }>("/api/forms", {
          method: "POST",
          body: JSON.stringify({ title: title.trim() || "Untitled form" }),
        });
      }
      const gen = await customFetch<{ doc: { title?: string } }>("/api/ai/generate-form", {
        method: "POST",
        body: JSON.stringify({ prompt: prompt.trim(), questionCount: 6 }),
      });
      const created = await customFetch<{ id: string }>("/api/forms", {
        method: "POST",
        body: JSON.stringify({ title: gen.doc?.title || "AI form" }),
      });
      await customFetch(`/api/forms/${created.id}/doc`, {
        method: "PUT",
        body: JSON.stringify({ doc: gen.doc }),
      });
      return created;
    },
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ["forms"] });
      onOpenChange(false);
      setTitle("");
      setPrompt("");
      // Land in the builder, not back on the grid.
      router.push(`/forms/${created.id}/build`);
    },
    onError: (e) =>
      toast.error("Couldn't create the form", { description: (e as Error).message }),
  });

  const canSubmit = mode === "blank" ? title.trim().length > 0 : prompt.trim().length > 5;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New form</DialogTitle>
          <DialogDescription>
            Describe what you want to find out and the AI drafts the conversation.
          </DialogDescription>
        </DialogHeader>

        <SegmentedControl
          options={[
            { value: "ai", label: "Describe it", icon: Sparkles },
            { value: "blank", label: "Start blank", icon: Plus },
          ]}
          value={mode}
          onChange={setMode}
        />

        {mode === "ai" ? (
          <div className="space-y-1.5">
            <Label htmlFor="ai-prompt">What should it find out?</Label>
            <Textarea
              id="ai-prompt"
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="A waitlist form for our launch — collect email, company size, and what problem they're hoping we solve."
            />
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="form-title">Form name</Label>
            <Input
              id="form-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Customer feedback"
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSubmit) void create.mutateAsync();
              }}
            />
          </div>
        )}

        <Button
          shape="pill"
          disabled={!canSubmit || create.isPending}
          onClick={() => void create.mutateAsync()}
        >
          {create.isPending && <Loader2 className="size-3.5 animate-spin" />}
          {create.isPending
            ? mode === "ai"
              ? "Drafting your form…"
              : "Creating…"
            : "Create form"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
