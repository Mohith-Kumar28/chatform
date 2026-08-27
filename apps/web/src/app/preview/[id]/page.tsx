"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw, TriangleAlert } from "lucide-react";
import { FormDoc } from "@repo/form-schema";
import { PreviewChat } from "@/components/builder/preview-chat";
import { Button } from "@/components/ui/button";
import { customFetch } from "@/lib/api/mutator";

/**
 * The draft preview, in a window of its own.
 *
 * Deliberately outside the `(builder)` group, so it inherits neither the
 * builder's top bar nor its tab strip: the point of opening a preview in a new
 * tab is to see the conversation the way a respondent will, at the size they
 * will see it, without the editor around it. The modal in the builder is for
 * glancing; this is for walking the whole thing.
 *
 * It runs against the working document rather than the published version — a
 * draft is exactly what you need a full window for, and the old "Open live"
 * button only appeared once the form was published, which is after the point
 * where this is useful.
 */
export default function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [doc, setDoc] = useState<FormDoc | null>(null);
  const [title, setTitle] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let live = true;
    customFetch<{ title: string; workingSchema: unknown }>(`/api/forms/${id}`)
      .then((row) => {
        if (!live) return;
        const parsed = FormDoc.safeParse(row.workingSchema);
        if (!parsed.success) {
          setError("This form's document could not be read.");
          return;
        }
        setTitle(row.title);
        setDoc(parsed.data);
      })
      .catch((err: unknown) => {
        if (live) setError(err instanceof Error ? err.message : "Could not load the form.");
      });
    return () => {
      live = false;
    };
  }, [id]);

  return (
    <div className="flex h-svh flex-col">
      <header className="flex items-center gap-3 border-b px-4 py-2.5">
        <Button variant="ghost" size="sm" shape="pill" asChild>
          <Link href={`/forms/${id}/build`}>
            <ArrowLeft className="size-3.5" />
            Back to editor
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{title || "Preview"}</p>
          <p className="text-muted-foreground text-xs">
            Previewing the draft — answers here are not saved as responses.
          </p>
        </div>
        <Button variant="ghost" size="sm" shape="pill" onClick={() => setNonce((n) => n + 1)}>
          <RefreshCw className="size-3.5" />
          Restart
        </Button>
      </header>

      <main className="bg-muted/40 flex min-h-0 flex-1 justify-center overflow-hidden p-4">
        {error ? (
          <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 text-sm">
            <TriangleAlert className="size-5" />
            <p>{error}</p>
          </div>
        ) : doc ? (
          <div className="flex min-h-0 w-full max-w-2xl flex-col">
            <PreviewChat key={nonce} formId={id} doc={doc} chromeless />
          </div>
        ) : (
          <div className="text-muted-foreground flex items-center justify-center text-sm">
            Starting the preview…
          </div>
        )}
      </main>
    </div>
  );
}
