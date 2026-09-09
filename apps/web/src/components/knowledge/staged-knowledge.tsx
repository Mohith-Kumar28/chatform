"use client";

import { useRef, useState } from "react";
import { BookOpen, FileText, Link2, Loader2, Plus, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { uploadKnowledgeFile } from "./upload-knowledge";
import { postApiFormsByIdKnowledgeText, postApiFormsByIdKnowledgeLink } from "@/lib/api/dashboard/dashboard";
import { cn } from "@/lib/utils";

/**
 * Knowledge collected before the form exists.
 *
 * The create dialog generates a form from a brief, and the form id only exists
 * once that returns — so knowledge added on this screen cannot be uploaded when
 * it is chosen. It is held here and flushed by `flushStagedKnowledge` after
 * generation, which is the only reason this is a separate component from
 * `KnowledgePanel` rather than a mode of it: that one is a view onto rows that
 * already exist, this one is a shopping basket.
 */

export type StagedItem =
  | { kind: "file"; id: string; file: File }
  | { kind: "text"; id: string; title: string; body: string }
  | { kind: "link"; id: string; url: string };

const uid = () => crypto.randomUUID().slice(0, 8);

/**
 * Push everything staged at a form that now exists.
 *
 * Failures are swallowed on purpose. The author is being routed into the
 * builder as this runs, and a toast about the third of four uploads would land
 * on a screen they have already left — the Knowledge tab shows the same failure
 * in place, attached to the source it belongs to, which is where they can
 * actually act on it.
 */
export async function flushStagedKnowledge(formId: string, items: StagedItem[]): Promise<void> {
  for (const item of items) {
    try {
      if (item.kind === "file") await uploadKnowledgeFile(formId, item.file);
      else if (item.kind === "text") {
        await postApiFormsByIdKnowledgeText(formId, { title: item.title, body: item.body });
      } else await postApiFormsByIdKnowledgeLink(formId, { url: item.url });
    } catch (err) {
      console.error("staged_knowledge_failed", item.kind, err);
    }
  }
}

export function StagedKnowledgeDialog({
  open,
  onOpenChange,
  items,
  onChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  items: StagedItem[];
  onChange: (items: StagedItem[]) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"idle" | "text" | "link">("idle");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [dragging, setDragging] = useState(false);

  const addFiles = (files: FileList | null) => {
    if (!files?.length) return;
    onChange([...items, ...Array.from(files).map((file) => ({ kind: "file" as const, id: uid(), file }))]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add knowledge</DialogTitle>
          <DialogDescription>
            Anything here is indexed once the form is created, and the agent answers respondents from it.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              addFiles(e.dataTransfer.files);
            }}
            className={cn(
              "border-border rounded-xl border border-dashed px-4 py-6 text-center",
              "transition-[border-color,background-color] duration-[var(--duration-standard)] ease-[var(--ease-out)]",
              dragging && "border-primary bg-primary/5",
            )}
          >
            <Upload className="text-muted-foreground/60 mx-auto size-5" strokeWidth={1.75} />
            <p className="text-body mt-2">Drop files here</p>
            <p className="text-muted-foreground text-caption mt-0.5">
              PDFs, Word, Excel, CSV, images and voice notes
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <Button size="sm" variant="outline" shape="pill" onClick={() => fileInput.current?.click()}>
                Choose files
              </Button>
              <Button size="sm" variant="ghost" shape="pill" onClick={() => setMode(mode === "text" ? "idle" : "text")}>
                <Plus className="size-3.5" />
                Paste text
              </Button>
              <Button size="sm" variant="ghost" shape="pill" onClick={() => setMode(mode === "link" ? "idle" : "link")}>
                <Link2 className="size-3.5" />
                Add a link
              </Button>
            </div>
          </div>
          <input
            ref={fileInput}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />

          {mode === "text" && (
            <div className="border-border bg-card space-y-2 rounded-xl border p-3">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Pricing" className="h-8" autoFocus />
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="Paste anything…" />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  shape="pill"
                  disabled={!title.trim() || !body.trim()}
                  onClick={() => {
                    onChange([...items, { kind: "text", id: uid(), title: title.trim(), body: body.trim() }]);
                    setTitle("");
                    setBody("");
                    setMode("idle");
                  }}
                >
                  Add
                </Button>
              </div>
            </div>
          )}

          {mode === "link" && (
            <div className="border-border bg-card flex items-center gap-2 rounded-xl border p-3">
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://yoursite.com/pricing"
                className="h-8 min-w-0 flex-1"
                autoFocus
              />
              <Button
                size="sm"
                shape="pill"
                disabled={!/^https?:\/\/\S+\.\S+/.test(url.trim())}
                onClick={() => {
                  onChange([...items, { kind: "link", id: uid(), url: url.trim() }]);
                  setUrl("");
                  setMode("idle");
                }}
              >
                Add
              </Button>
            </div>
          )}

          {items.length > 0 && (
            <ul className="space-y-2">
              {items.map((item) => (
                <li key={item.id} className="border-border bg-card flex items-center gap-3 rounded-xl border p-2.5">
                  {item.kind === "link" ? (
                    <Link2 className="text-muted-foreground size-4 shrink-0" strokeWidth={1.75} />
                  ) : item.kind === "text" ? (
                    <BookOpen className="text-muted-foreground size-4 shrink-0" strokeWidth={1.75} />
                  ) : (
                    <FileText className="text-muted-foreground size-4 shrink-0" strokeWidth={1.75} />
                  )}
                  <span className="text-body min-w-0 flex-1 truncate">
                    {item.kind === "file" ? item.file.name : item.kind === "text" ? item.title : item.url}
                  </span>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Remove"
                    className="text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => onChange(items.filter((i) => i.id !== item.id))}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex justify-end">
            <Button shape="pill" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

/** The trigger, sized for the composer toolbar it sits in. */
export function AddKnowledgeButton({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <Button size="sm" variant="ghost" shape="pill" onClick={onClick} className="text-muted-foreground">
      <BookOpen className="size-3.5" />
      {count > 0 ? `Knowledge · ${count}` : "Add knowledge"}
    </Button>
  );
}

export { Loader2 };
