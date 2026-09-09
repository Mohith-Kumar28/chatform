"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  BookOpen,
  FileText,
  Globe,
  ImageIcon,
  Link2,
  Loader2,
  Mic,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/ui/empty-state";
import { MeterBar } from "@/components/ui/usage-meter";
import { Spinner } from "@/components/ui/spinner";
import type { GetApiFormsByIdKnowledge200 } from "@/lib/api/generated.schemas";
import {
  useGetApiFormsByIdKnowledge,
  getGetApiFormsByIdKnowledgeQueryKey,
  usePostApiFormsByIdKnowledgeText,
  usePostApiFormsByIdKnowledgeLink,
  useDeleteApiFormsByIdKnowledgeBySourceId,
} from "@/lib/api/dashboard/dashboard";
import { isPlanDenial } from "@/lib/api/mutator";
import { uploadKnowledgeFile } from "./upload-knowledge";
import { cn } from "@/lib/utils";

/**
 * The knowledge base, as one component.
 *
 * Mounted in two places that have nothing else in common — the builder's Agent
 * tab and a dialog in the create-form flow — so it takes a form id and owns
 * everything else itself. Anything it needed from a parent would have to be
 * threaded through both.
 *
 * ## Why status is the centre of the design
 *
 * Ingestion is asynchronous and can take a minute: a PDF is extracted, maybe
 * OCR'd, chunked and embedded. The failure that matters is not an upload that
 * errors — it is a scanned document that yields no text and is quietly indexed
 * as nothing, leaving an author certain the agent knows something it does not.
 * So every row shows where it is, and a source that could not be read says so
 * in words, in place.
 */

type Mode = "idle" | "text" | "link";

/** The list endpoint's body. `customFetch` resolves to it directly. */
type KnowledgeList = GetApiFormsByIdKnowledge200;

const KIND_ICON: Record<string, typeof FileText> = {
  file: FileText,
  text: BookOpen,
  link: Link2,
  crawl: Globe,
  image: ImageIcon,
  audio: Mic,
};

/** Statuses that are still moving, and therefore worth polling for. */
const PENDING_STATUSES = new Set(["pending", "extracting", "indexing"]);

const STATUS_LABEL: Record<string, string> = {
  pending: "Queued",
  extracting: "Reading",
  indexing: "Indexing",
  ready: "Ready",
  failed: "Couldn't read",
};

export function KnowledgePanel({ formId, className }: { formId: string; className?: string }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>("idle");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: getGetApiFormsByIdKnowledgeQueryKey(formId) });
  }, [queryClient, formId]);

  const { data, isLoading, error: listError } = useGetApiFormsByIdKnowledge(formId, {
    query: {
      queryKey: getGetApiFormsByIdKnowledgeQueryKey(formId),
      /**
       * Poll only while something is actually moving.
       *
       * A knowledge base that has settled is static until the author touches
       * it, and a builder tab left open all afternoon should not be asking a
       * question whose answer cannot change.
       */
      refetchInterval: (query) => {
        const sources = (query.state.data as KnowledgeList | undefined)?.sources ?? [];
        return sources.some((s) => PENDING_STATUSES.has(s.status)) ? 2000 : false;
      },
    },
  });

  const addText = usePostApiFormsByIdKnowledgeText({ mutation: { onSuccess: invalidate } });
  const addLink = usePostApiFormsByIdKnowledgeLink({ mutation: { onSuccess: invalidate } });
  const remove = useDeleteApiFormsByIdKnowledgeBySourceId({ mutation: { onSuccess: invalidate } });

  /**
   * `customFetch` resolves to the response body itself, so the payload is the
   * list — not a `{ data }` envelope around it. Reading a level too deep left
   * every field undefined, which is indistinguishable from an empty knowledge
   * base: a source added successfully never appeared, and the usage meter never
   * rendered at all.
   */
  const list = data as KnowledgeList | undefined;
  const sources = list?.sources ?? [];
  const usage = list?.usage;
  const enabled = list?.enabled ?? true;

  const onFiles = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;
      setBusy(true);
      setUploadError(null);
      try {
        // Sequential on purpose: each upload is metered against the plan, and
        // firing ten at once would race the cap check and admit more than the
        // allowance.
        for (const file of Array.from(files)) {
          await uploadKnowledgeFile(formId, file);
        }
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "That upload didn't work.");
      } finally {
        setBusy(false);
        invalidate();
      }
    },
    [formId, invalidate],
  );

  const addError = errorText(uploadError, addText.error, addLink.error, remove.error);

  const overBudget = useMemo(
    () => usage?.maxBytes != null && usage.bytes > usage.maxBytes,
    [usage],
  );

  if (!enabled) {
    return (
      <EmptyState
        compact
        icon={BookOpen}
        title="Knowledge is a Pro feature"
        description="Upgrade to let the interviewer answer questions mid-form."
        className={className}
      />
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {usage && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-caption text-muted-foreground tabular">
              {formatBytes(usage.bytes)}
              {usage.maxBytes != null && ` / ${formatBytes(usage.maxBytes)}`}
              {usage.maxCount != null && ` · ${usage.count} of ${usage.maxCount} sources`}
            </span>
          </div>
          <MeterBar
            value={usage.bytes}
            max={usage.maxBytes}
            tone={overBudget ? "danger" : "neutral"}
            label="Knowledge storage used"
          />
        </div>
      )}

      <DropZone
        dragging={dragging}
        busy={busy}
        onDragStateChange={setDragging}
        onFiles={onFiles}
        onBrowse={() => fileInput.current?.click()}
        onPaste={() => setMode(mode === "text" ? "idle" : "text")}
        onLink={() => setMode(mode === "link" ? "idle" : "link")}
      />
      <input
        ref={fileInput}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          void onFiles(e.target.files);
          // Reset so re-picking the same file fires change again.
          e.target.value = "";
        }}
      />

      {/*
        Every way of adding fails in the same place, in words.
        A plan denial raises the paywall from the mutator, but a bad URL, an
        unreachable page or a server fault used to leave the button clicked and
        nothing on screen — the author had no way to tell a silent failure from
        a slow success.
      */}
      {addError && (
        <p className="text-destructive text-caption flex items-center gap-1.5">
          <AlertCircle className="size-3.5 shrink-0" />
          {addError}
        </p>
      )}

      {mode === "text" && (
        <PasteForm
          busy={addText.isPending}
          onCancel={() => setMode("idle")}
          onSubmit={(title, body) => {
            addText.mutate({ id: formId, data: { title, body } }, { onSuccess: () => setMode("idle") });
          }}
        />
      )}

      {mode === "link" && (
        <LinkForm
          busy={addLink.isPending}
          onCancel={() => setMode("idle")}
          onSubmit={(url) => {
            addLink.mutate({ id: formId, data: { url } }, { onSuccess: () => setMode("idle") });
          }}
        />
      )}

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : listError && !list ? (
        /*
          A list that could not be loaded must not render as a list that is
          empty. The two look identical and mean opposite things — one says
          you have added nothing, the other hides everything you have.
        */
        <EmptyState
          compact
          icon={AlertCircle}
          title="Couldn't load your knowledge"
          description={listError instanceof Error ? listError.message : "Reload to try again."}
        />
      ) : sources.length === 0 ? (
        <EmptyState
          compact
          icon={BookOpen}
          title="Nothing added yet"
          description="Pricing, an FAQ, a link — whatever the agent should be able to answer from."
        />
      ) : (
        <ul className="space-y-2">
          {sources.map((source) => (
            <SourceRow
              key={source.id}
              source={source}
              onDelete={() => remove.mutate({ id: formId, sourceId: source.id })}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function DropZone({
  dragging,
  busy,
  onDragStateChange,
  onFiles,
  onBrowse,
  onPaste,
  onLink,
}: {
  dragging: boolean;
  busy: boolean;
  onDragStateChange: (v: boolean) => void;
  onFiles: (files: FileList | null) => void;
  onBrowse: () => void;
  onPaste: () => void;
  onLink: () => void;
}) {
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        onDragStateChange(true);
      }}
      onDragLeave={() => onDragStateChange(false)}
      onDrop={(e) => {
        e.preventDefault();
        onDragStateChange(false);
        onFiles(e.dataTransfer.files);
      }}
      className={cn(
        "border-border rounded-xl border border-dashed px-4 py-6 text-center",
        "transition-[border-color,background-color] duration-[var(--duration-standard)] ease-[var(--ease-out)]",
        dragging && "border-primary bg-primary/5",
      )}
    >
      {busy ? (
        <div className="text-muted-foreground flex items-center justify-center gap-2 text-caption">
          <Loader2 className="size-4 animate-spin" />
          Uploading…
        </div>
      ) : (
        <>
          <Upload className="text-muted-foreground/60 mx-auto size-5" strokeWidth={1.75} />
          <p className="text-body mt-2">Drop files here</p>
          <p className="text-muted-foreground text-caption mt-0.5">
            Documents, images and audio · 25MB each
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <Button size="sm" variant="outline" shape="pill" onClick={onBrowse}>
              Choose files
            </Button>
            <Button size="sm" variant="ghost" shape="pill" onClick={onPaste}>
              <Plus className="size-3.5" />
              Paste text
            </Button>
            <Button size="sm" variant="ghost" shape="pill" onClick={onLink}>
              <Link2 className="size-3.5" />
              Add a link
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function PasteForm({
  busy,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (title: string, body: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const canSave = title.trim().length > 0 && body.trim().length > 0 && !busy;

  return (
    <div className="border-border bg-card space-y-2 rounded-xl border p-3">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Pricing"
        className="h-8 font-medium"
        autoFocus
      />
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={5}
        placeholder="Paste anything the agent should know…"
      />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" shape="pill" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" shape="pill" disabled={!canSave} onClick={() => onSubmit(title.trim(), body.trim())}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
          Add
        </Button>
      </div>
    </div>
  );
}

function LinkForm({
  busy,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (url: string) => void;
}) {
  const [url, setUrl] = useState("");
  const valid = /^https?:\/\/\S+\.\S+/.test(url.trim());

  return (
    <div className="border-border bg-card flex flex-wrap items-center gap-2 rounded-xl border p-3">
      <Input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://yoursite.com/pricing"
        className="h-8 min-w-0 flex-1"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter" && valid && !busy) onSubmit(url.trim());
        }}
      />
      <Button size="sm" variant="ghost" shape="pill" onClick={onCancel}>
        Cancel
      </Button>
      <Button size="sm" shape="pill" disabled={!valid || busy} onClick={() => onSubmit(url.trim())}>
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
        Add
      </Button>
    </div>
  );
}

function SourceRow({
  source,
  onDelete,
}: {
  source: {
    id: string;
    kind: string;
    title: string;
    origin: string | null;
    status: string;
    error: string | null;
    bytes: number;
  };
  onDelete: () => void;
}) {
  const Icon = KIND_ICON[source.kind] ?? FileText;
  const pending = PENDING_STATUSES.has(source.status);
  const failed = source.status === "failed";

  return (
    <li className="border-border bg-card flex items-start gap-3 rounded-xl border p-3">
      <Icon className={cn("mt-0.5 size-4 shrink-0", failed ? "text-destructive" : "text-muted-foreground")} strokeWidth={1.75} />
      <div className="min-w-0 flex-1">
        <p className="text-body truncate font-medium">{source.title}</p>
        <p className={cn("text-caption mt-0.5 flex items-center gap-1.5", failed ? "text-destructive" : "text-muted-foreground")}>
          {pending && <Loader2 className="size-3 animate-spin" />}
          <span>{STATUS_LABEL[source.status] ?? source.status}</span>
          {source.status === "ready" && source.bytes > 0 && <span>· {formatBytes(source.bytes)}</span>}
        </p>
        {/*
          The reason, in place, in the author's words rather than a log line.
          A source that could not be read is the one state where saying nothing
          would leave someone believing the agent knows something it does not.
        */}
        {failed && source.error && <p className="text-destructive text-caption mt-1">{source.error}</p>}
      </div>
      <Button
        size="icon-sm"
        variant="ghost"
        onClick={onDelete}
        aria-label={`Remove ${source.title}`}
        className="text-muted-foreground hover:text-destructive shrink-0"
      >
        <Trash2 className="size-3.5" />
      </Button>
    </li>
  );
}

/**
 * The first failure worth showing, as a sentence.
 *
 * Plan denials are dropped: `mutator.ts` has already raised the paywall dialog
 * for those, and repeating them in red under the drop zone reads as a second,
 * unrelated fault.
 */
function errorText(...errors: unknown[]): string | null {
  for (const err of errors) {
    if (typeof err === "string") return err;
    if (isPlanDenial(err)) continue;
    if (err instanceof Error) return err.message;
  }
  return null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
