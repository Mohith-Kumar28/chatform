"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { FormDoc, migrateFormDoc } from "@repo/form-schema";
import {
  useGetApiFormsById,
  usePostApiFormsByIdPublish,
} from "@/lib/api/dashboard/dashboard";
import { AuthGuard } from "@/components/dashboard/auth-guard";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useBuilderStore } from "@/stores/builder-store";
import { useAutosave } from "@/hooks/use-autosave";
import { BuilderHeader } from "./builder-header";
import { PreviewDialog } from "./preview-dialog";
import { PublishStrippedDialog, type StrippedSetting } from "./publish-stripped-dialog";

/**
 * Owns everything shared by the builder tabs: document loading, store
 * hydration, autosave, publish, and the keyboard shortcuts. Tabs render as
 * children and read the document from the store rather than through props.
 */
export function BuilderShell({
  formId,
  children,
}: {
  formId: string;
  children: React.ReactNode;
}) {
  const { data: form, isLoading, error } = useGetApiFormsById(formId as never);
  const publish = usePostApiFormsByIdPublish();

  const doc = useBuilderStore((s) => s.doc);
  const hydrate = useBuilderStore((s) => s.hydrate);
  const loadedId = useBuilderStore((s) => s.formId);
  const undo = useBuilderStore((s) => s.undo);
  const redo = useBuilderStore((s) => s.redo);

  const { flush } = useAutosave(formId);
  const [publishing, setPublishing] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  /**
   * What the publish dropped because the plan does not include it.
   *
   * Shown rather than swallowed. This is the highest-intent moment in the product: they
   * have just built the thing, they can see it, and the only thing between them and
   * shipping it as authored is the price.
   */
  const [stripped, setStripped] = useState<StrippedSetting[]>([]);

  const row = form as
    | { id: string; title: string; slug: string; status: string; workingSchema: unknown; activeVersion: number | null }
    | undefined;

  // Hydrate once per form. The doc is migrated client-side too so a tab opened
  // against a stale cache still sees the current shape.
  useEffect(() => {
    if (!row || loadedId === row.id) return;
    const parsed = FormDoc.safeParse(migrateFormDoc(row.workingSchema));
    if (!parsed.success) {
      toast.error("This form's document could not be read.");
      return;
    }
    hydrate(row.id, parsed.data, row.activeVersion);
  }, [row, loadedId, hydrate]);

  // ⌘Z / ⇧⌘Z anywhere that isn't a text field.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if (typing) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  async function onPublish() {
    setPublishing(true);
    try {
      // Flush first: Publish used to be disabled while the doc was dirty, so a
      // user who had just typed had to wait out the autosave debounce.
      await flush();
      const result = (await publish.mutateAsync({ id: formId as never })) as unknown as {
        stripped?: StrippedSetting[];
      };
      if (result?.stripped?.length) setStripped(result.stripped);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Publish failed";
      toast.error("Could not publish", { description: message });
      throw err;
    } finally {
      setPublishing(false);
    }
  }

  return (
    <AuthGuard>
      <div className="bg-background flex min-h-svh flex-col">
        {isLoading || !row ? (
          <HeaderSkeleton />
        ) : (
          <BuilderHeader
            formId={formId}
            title={row.title}
            slug={row.slug}
            status={row.status}
            activeVersion={row.activeVersion}
            onPublish={onPublish}
            publishing={publishing}
            onPreview={() => setPreviewOpen(true)}
          />
        )}

        <div className="min-h-0 flex-1">
          {error ? (
            <div className="mx-auto max-w-md px-6 py-24">
              <EmptyState
                icon={AlertTriangle}
                title="We couldn't open this form"
                description="It may have been deleted, or you may not have access to it."
                action={
                  <Button asChild shape="pill">
                    <a href="/dashboard">Back to forms</a>
                  </Button>
                }
              />
            </div>
          ) : isLoading || !doc ? (
            <div className="text-muted-foreground flex min-h-[60vh] items-center justify-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin" />
              Loading your form…
            </div>
          ) : (
            children
          )}
        </div>

        {doc && row && (
          <PreviewDialog
            open={previewOpen}
            onOpenChange={setPreviewOpen}
            formId={formId}
            doc={doc}
            slug={row.slug}
            published={row.status === "published"}
          />
        )}

        <PublishStrippedDialog stripped={stripped} onClose={() => setStripped([])} />
      </div>
    </AuthGuard>
  );
}

/** Matches the real header's geometry so the page doesn't jump on load. */
function HeaderSkeleton() {
  return (
    <div className="bg-card flex h-14 items-center gap-3 px-4">
      <div className="shimmer size-8 rounded-md" />
      <div className="shimmer h-4 w-40 rounded" />
      <div className="ml-auto flex gap-2">
        <div className="shimmer h-8 w-24 rounded-full" />
      </div>
    </div>
  );
}
