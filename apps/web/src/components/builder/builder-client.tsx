"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  useGetApiFormsById,
  usePutApiFormsByIdDoc,
  usePostApiFormsByIdPublish,
} from "@/lib/api/dashboard/dashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Plus, Trash2, GripVertical, Loader2, GitBranch, Link2,
} from "lucide-react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Block, FormDoc } from "@repo/form-schema";
import { Block as BlockSchema } from "@repo/form-schema";
import { ResultsClient } from "./results-client";
import { IntegrateClient } from "./integrate-client";
import { WorkflowClient } from "./workflow-client";
import { PreviewChat } from "./preview-chat";
import { Sparkles } from "lucide-react";
import { ShareClient } from "./share-client";
import { SettingsPanel } from "./settings-panel";
import { ThemePanel } from "./theme-panel";
import { BuilderHeader, type BuilderView } from "./builder-header";
import { useAutoTour } from "@/components/tour/product-tour";
import { chatThemeVars, RADIUS_PX } from "@/lib/chat-theme";

const uid = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;

const BLOCK_LIBRARY: { type: Block["type"]; label: string; group: string }[] = [
  { type: "statement", label: "Message", group: "Start" },
  { type: "short_text", label: "Short text", group: "Text" },
  { type: "long_text", label: "Long text", group: "Text" },
  { type: "email", label: "Email", group: "Contact" },
  { type: "phone", label: "Phone", group: "Contact" },
  { type: "number", label: "Number", group: "Numbers" },
  { type: "date", label: "Date", group: "Basic" },
  { type: "yes_no", label: "Yes / No", group: "Choice" },
  { type: "single_select", label: "Single select", group: "Choice" },
  { type: "multi_select", label: "Multi select", group: "Choice" },
  { type: "rating", label: "Rating", group: "Scale" },
  { type: "nps", label: "NPS", group: "Scale" },
  { type: "opinion_scale", label: "Opinion scale", group: "Scale" },
  { type: "file_upload", label: "File upload", group: "Advanced" },
  { type: "payment", label: "Payment", group: "Advanced" },
  { type: "legal_consent", label: "Consent", group: "Advanced" },
];

function defaultBlock(type: Block["type"]): Block {
  const id = uid("blk");
  const ref = `q_${type.replace(/_/g, "")}${crypto.randomUUID().slice(0, 4)}`;
  const base = { id, ref, title: "New question", required: false };
  switch (type) {
    case "statement":
      return BlockSchema.parse({ ...base, type, title: "A quick note", buttonLabel: "Continue" });
    case "short_text":
      return BlockSchema.parse({ ...base, type, title: "Your answer?", minLength: 0, maxLength: 200 });
    case "long_text":
      return BlockSchema.parse({ ...base, type, title: "Tell us more", minLength: 0, maxLength: 1000 });
    case "email":
      return BlockSchema.parse({ ...base, type, title: "What's your email?" });
    case "phone":
      return BlockSchema.parse({ ...base, type, title: "Phone number" });
    case "number":
      return BlockSchema.parse({ ...base, type, title: "Pick a number" });
    case "date":
      return BlockSchema.parse({ ...base, type, title: "Pick a date" });
    case "yes_no":
      return BlockSchema.parse({ ...base, type, title: "Yes or no?" });
    case "single_select":
    case "multi_select":
      return BlockSchema.parse({
        ...base,
        type,
        title: type === "single_select" ? "Choose an option" : "Choose options",
        options: [
          { id: uid("opt"), label: "Option 1" },
          { id: uid("opt"), label: "Option 2" },
        ],
        ...(type === "single_select"
          ? { allowOther: false }
          : { minSelections: 1, maxSelections: 10, allowOther: false }),
      });
    case "rating":
      return BlockSchema.parse({ ...base, type, title: "How would you rate it?", scale: 5, shape: "star" });
    case "nps":
      return BlockSchema.parse({ ...base, type, title: "How likely are you to recommend us?" });
    case "opinion_scale":
      return BlockSchema.parse({ ...base, type, title: "Your opinion", steps: 10, startAt: 1 });
    case "file_upload":
      return BlockSchema.parse({ ...base, type, title: "Upload a file", accept: ["image/png", "image/jpeg", "application/pdf"], maxFiles: 1, maxSizeMB: 10 });
    case "payment":
      return BlockSchema.parse({ ...base, type, title: "Complete payment", amountMode: "fixed", amount: 10, currency: "USD" });
    case "legal_consent":
      return BlockSchema.parse({ ...base, type, title: "One last thing", consentText: "I agree to the terms." });
    default:
      return BlockSchema.parse({ ...base, type: "short_text" });
  }
}

function SortableBlockRow({
  block,
  index,
  active,
  onSelect,
  onRemove,
}: {
  block: Block;
  index: number;
  active: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.ref });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm ${
        isDragging ? "bg-accent opacity-60 shadow-md" : ""
      } ${active && !isDragging ? "bg-primary/10 text-primary" : active ? "" : "hover:bg-accent"}`}
    >
      <button
        type="button"
        className="text-muted-foreground touch-none shrink-0 cursor-grab active:cursor-grabbing"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-3.5 opacity-40 group-hover:opacity-80" />
      </button>
      <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-2">
        <span className="text-muted-foreground w-4 shrink-0 text-xs">{index + 1}</span>
        <span className="truncate">{block.title}</span>
        {block.required && <span className="text-destructive ml-auto text-xs">*</span>}
      </button>
      {block.type !== "welcome" && block.type !== "statement" && (
        <Trash2
          className="ml-1 size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-60 hover:!opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        />
      )}
    </div>
  );
}

export function BuilderClient() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { data: raw, isLoading } = useGetApiFormsById(id);
  const saveDoc = usePutApiFormsByIdDoc();
  const publish = usePostApiFormsByIdPublish();

  const form = raw as unknown as
    | { id: string; title: string; slug: string; status: string; workingSchema: FormDoc; activeVersion: number | null }
    | undefined;

  const [doc, setDoc] = useState<FormDoc | null>(null);
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [saveCount, setSaveCount] = useState(0);
  const [aiBar, setAiBar] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMsg, setAiMsg] = useState<string | null>(null);
  const [view, setView] = useState<BuilderView>("build");

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // hydrate doc once per form (render-phase state adjustment pattern)
  if (form && form.id !== loadedId) {
    setLoadedId(form.id);
    setDoc(form.workingSchema);
  }

  // debounced autosave
  useEffect(() => {
    if (!doc || !dirty) return;
    const t = setTimeout(async () => {
      try {
        await saveDoc.mutateAsync({ id, data: { doc } });
        setDirty(false);
        setSaveError(null);
        setSaveCount((n) => n + 1);
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : "Save failed");
      }
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, dirty]);

  const update = (next: FormDoc) => {
    setDoc(next);
    setDirty(true);
  };

  const updateBlock = (ref: string, patch: Partial<Block>) => {
    if (!doc) return;
    update({
      ...doc,
      blocks: doc.blocks.map((b) => (b.ref === ref ? ({ ...b, ...patch } as Block) : b)),
    });
  };

  const addBlock = (type: Block["type"]) => {
    if (!doc) return;
    const b = defaultBlock(type);
    // insert before endings — blocks array only
    update({ ...doc, blocks: [...doc.blocks, b] });
    setSelectedRef(b.ref);
  };

  const removeBlock = (ref: string) => {
    if (!doc) return;
    update({ ...doc, blocks: doc.blocks.filter((b) => b.ref !== ref) });
    if (selectedRef === ref) setSelectedRef(null);
  };

  const onDragEnd = (e: DragEndEvent) => {
    if (!doc || !e.over || e.active.id === e.over.id) return;
    const from = doc.blocks.findIndex((b) => b.ref === e.active.id);
    const to = doc.blocks.findIndex((b) => b.ref === e.over!.id);
    if (from < 0 || to < 0) return;
    update({ ...doc, blocks: arrayMove(doc.blocks, from, to) });
  };

  const runAiBar = async () => {
    if (!doc || !aiBar.trim() || !form) return;
    setAiBusy(true);
    setAiMsg(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_ORIGIN ?? "http://localhost:8787"}/api/ai/add-blocks`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ formId: form.id, prompt: aiBar.trim(), count: 3 }),
      });
      const body = (await res.json()) as { added?: number; error?: { message?: string } };
      if (!res.ok) throw new Error(body.error?.message ?? "AI failed");
      setAiMsg(`Added ${body.added} question${(body.added ?? 0) > 1 ? "s" : ""} ✓`);
      setAiBar("");
      setSaveCount((n) => n + 1);
      // reload doc from server (AI wrote it there)
      setTimeout(() => window.location.reload(), 600);
    } catch (err) {
      setAiMsg(err instanceof Error ? err.message : "AI failed");
    } finally {
      setAiBusy(false);
    }
  };

  const selected = useMemo(() => doc?.blocks.find((b) => b.ref === selectedRef) ?? null, [doc, selectedRef]);
  useAutoTour("builder", !!doc && view === "build");

  if (isLoading || !doc) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-svh flex-col">
      <BuilderHeader
        title={doc.title}
        formId={id}
        slug={form?.slug ?? null}
        status={form?.status}
        activeVersion={form?.activeVersion ?? null}
        view={view}
        onViewChange={setView}
        saveState={saveDoc.isPending ? "saving" : dirty ? "dirty" : "saved"}
        saveError={saveError}
        publishPending={publish.isPending}
        dirty={dirty}
        onPublish={async () => {
          await publish.mutateAsync({ id });
          window.location.reload();
        }}
      />

      <div className="flex min-h-0 flex-1">
        {view === "workflow" && (
          <div className="min-h-0 flex-1">
            <WorkflowClient doc={doc} onChange={update} />
          </div>
        )}

        {view === "results" && <ResultsClient formId={id} config={{ title: doc.title }} />}

        {view === "share" && (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ShareClient slug={form?.slug ?? ""} appOrigin={typeof window !== "undefined" ? window.location.origin : ""} status={form?.status} />
          </div>
        )}

        {view === "integrate" && <IntegrateClient formId={id} />}

        {view === "settings" && (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <SettingsPanel
              settings={doc.settings}
              onChange={(next) => update({ ...doc, settings: next })}
              formTitle={doc.title}
              hiddenFields={doc.hiddenFields}
              onHiddenFieldsChange={(fields) => update({ ...doc, hiddenFields: fields })}
              variables={doc.variables}
              onVariablesChange={(variables) => update({ ...doc, variables })}
            />
          </div>
        )}

        {view === "design" && (
          <div className="mx-auto flex w-full max-w-4xl items-start gap-8 p-6">
            <div className="min-w-0 flex-1">
              <ThemePanel
                theme={doc.theme}
                onChange={(next) => update({ ...doc, theme: next })}
              />
            </div>
            <ThemePreview theme={doc.theme} />
          </div>
        )}

        {view === "build" && (
        <>
        {/* left: blocks (build view only) */}
        <aside data-tour="builder-blocks" className="bg-sidebar flex w-72 shrink-0 flex-col border-r">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-muted-foreground text-xs font-medium uppercase">Blocks · {doc.blocks.length}</span>
          </div>
          <div className="flex-1 space-y-1 overflow-y-auto px-2 pb-2">
            <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={doc.blocks.map((b) => b.ref)} strategy={verticalListSortingStrategy}>
                {doc.blocks.map((b, i) => (
                  <SortableBlockRow
                    key={b.id}
                    block={b}
                    index={i}
                    active={selectedRef === b.ref}
                    onSelect={() => setSelectedRef(b.ref)}
                    onRemove={() => removeBlock(b.ref)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>
          <Separator />
          <div data-tour="builder-add" className="max-h-56 overflow-y-auto p-2">
            <p className="text-muted-foreground mb-1.5 px-2 text-xs font-medium uppercase">Add block</p>
            <div className="grid grid-cols-2 gap-1">
              {BLOCK_LIBRARY.map((b) => (
                <button
                  key={b.type}
                  onClick={() => addBlock(b.type)}
                  className="hover:border-primary hover:text-primary rounded-md border px-2 py-1.5 text-left text-xs"
                >
                  <Plus className="mr-1 inline size-3" />
                  {b.label}
                </button>
              ))}
             </div>
          </div>
        </aside>

        {/* center: AI bar + live preview */}
        <main className="flex min-w-0 flex-1 items-stretch justify-center overflow-y-auto bg-[var(--background)] p-6">
          <div className="flex h-full min-h-0 w-full max-w-xl flex-col gap-3">
            <form
              data-tour="builder-ask"
              className="flex items-center gap-2 rounded-full border bg-[var(--card)] px-4 py-2.5 shadow-sm"
              onSubmit={(e) => {
                e.preventDefault();
                void runAiBar();
              }}
            >
              <Sparkles className="text-primary size-4 shrink-0" />
              <input
                value={aiBar}
                onChange={(e) => setAiBar(e.target.value)}
                placeholder="Ask AI to add questions or logic…"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                disabled={aiBusy}
              />
              <Button type="submit" size="sm" className="rounded-full" disabled={aiBusy || !aiBar.trim()}>
                {aiBusy ? <Loader2 className="size-3.5 animate-spin" /> : "Ask"}
              </Button>
            </form>
            {aiMsg && <p className="text-muted-foreground text-center text-xs">{aiMsg}</p>}
            <div data-tour="builder-preview" className="min-h-0 flex-1">
              <PreviewChat formId={id} doc={doc!} refreshKey={saveCount} />
            </div>
          </div>
        </main>
        {/* right: inspector (build view only) */}
        <aside className="bg-sidebar w-80 shrink-0 overflow-y-auto border-l p-4">
          {selected ? (
            <div className="space-y-4">
              <p className="text-muted-foreground text-xs font-medium uppercase">
                {selected.type}
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="b-title">Question</Label>
                <Textarea
                  id="b-title"
                  rows={2}
                  value={selected.title}
                  onChange={(e) => updateBlock(selected.ref, { title: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="b-desc">Description</Label>
                <Input
                  id="b-desc"
                  value={selected.description ?? ""}
                  onChange={(e) => updateBlock(selected.ref, { description: e.target.value || undefined })}
                  placeholder="Optional hint"
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="b-req">Required</Label>
                <Switch
                  id="b-req"
                  checked={selected.required}
                  onCheckedChange={(v) => updateBlock(selected.ref, { required: v })}
                />
              </div>

              {"options" in selected && selected.options && (
                <div className="space-y-1.5">
                  <Label>Options</Label>
                  {selected.options.map((o, i) => (
                    <div key={o.id} className="flex items-center gap-1.5">
                      <Input
                        value={o.label}
                        onChange={(e) => {
                          const opts = [...(selected as { options: { id: string; label: string }[] }).options];
                          opts[i] = { ...o, label: e.target.value };
                          updateBlock(selected.ref, { options: opts } as Partial<Block>);
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 shrink-0"
                        onClick={() =>
                          updateBlock(selected.ref, {
                            options: selected.options!.filter((x) => x.id !== o.id),
                          } as Partial<Block>)
                        }
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() =>
                      updateBlock(selected.ref, {
                        options: [...selected.options!, { id: uid("opt"), label: `Option ${selected.options!.length + 1}` }],
                      } as Partial<Block>)
                    }
                  >
                    <Plus className="size-3.5" /> Add option
                  </Button>
                </div>
              )}

              {selected.type === "rating" && (
                <div className="flex items-center justify-between">
                  <Label>Scale</Label>
                  <select
                    className="rounded-md border px-2 py-1 text-sm"
                    value={selected.scale ?? 5}
                    onChange={(e) => updateBlock(selected.ref, { scale: Number(e.target.value) } as Partial<Block>)}
                  >
                    {[3, 4, 5, 7, 10].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
              )}

              {selected.type !== "welcome" && (
                <div className="rounded-xl border border-dashed p-3">
                  <p className="text-muted-foreground mb-2 text-xs leading-relaxed">
                    Branch this question conditionally — e.g. jump somewhere if the answer is Yes or below 3.
                  </p>
                  <Button variant="outline" size="sm" className="w-full" onClick={() => setView("workflow")}>
                    <GitBranch className="size-3.5" /> Add branching logic
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">Select a block to edit it.</p>
          )}
        </aside>
        </>
        )}
      </div>
    </div>
  );
}

function ThemePreview({ theme }: { theme: FormDoc["theme"] }) {
  const r = `var(--cf-radius)`;
  return (
    <aside className="hidden w-80 shrink-0 lg:block" aria-label="Theme preview">
      <div
        className="sticky top-0 overflow-hidden rounded-2xl border shadow-sm"
        style={{ background: "var(--cf-bg)", color: theme.text, ...chatThemeVars(theme) }}
      >
        <div className="flex items-center gap-2.5 px-4 py-3">
          <div
            className="flex size-8 items-center justify-center rounded-lg text-sm font-bold text-white"
            style={{ background: "var(--cf-accent)", borderRadius: r }}
          >
            C
          </div>
          <div>
            <p className="text-sm font-semibold">{theme.fontHeading}</p>
            <p className="text-muted-foreground text-[11px]">48% complete</p>
          </div>
        </div>
        <div className="space-y-3 px-4 pb-5">
          <div className="mr-8 px-3.5 py-2.5 text-sm leading-relaxed" style={{ background: "var(--cf-bot-bubble)", borderRadius: r, border: "1px solid rgb(0 0 0 / 0.06)" }}>
            What&apos;s your email?
          </div>
          <div className="ml-8 inline-block px-3.5 py-2.5 text-sm leading-relaxed text-white" style={{ background: "var(--cf-user-bubble)", color: "var(--cf-user-bubble-text)", borderRadius: r }}>
            grace@hopper.dev
          </div>
          <div className="mr-8 px-3.5 py-2.5 text-sm leading-relaxed" style={{ background: "var(--cf-bot-bubble)", borderRadius: r, border: "1px solid rgb(0 0 0 / 0.06)" }}>
            How would you rate your experience?
          </div>
          <div className="flex flex-wrap gap-1.5">
            {["1", "2", "3", "4", "5"].map((n) => (
              <span
                key={n}
                className="px-3 py-1.5 text-xs font-medium"
                style={{
                  borderRadius: theme.radius === "full" ? "9999px" : `calc(${r} * 0.7)`,
                  background: n === "5" ? "var(--cf-accent)" : "var(--cf-bot-bubble)",
                  color: n === "5" ? "#fff" : theme.text,
                  border: "1px solid rgb(0 0 0 / 0.08)",
                }}
              >
                {n}
              </span>
            ))}
          </div>
        </div>
      </div>
      <p className="text-muted-foreground mt-3 text-center text-xs">
        Live preview — exactly what respondents see
      </p>
    </aside>
  );
}
