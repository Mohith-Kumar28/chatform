"use client";

import { useCallback, useEffect, useState } from "react";
import { FormDoc, toPublicConfig } from "@repo/form-schema";
import { ChatClient } from "@/components/chat/chat-client";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

const API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN ?? "http://localhost:8787";

/** Live chat preview — runs the real interview runtime against the working draft. */
export function PreviewChat({ formId, doc, refreshKey }: { formId: string; doc: FormDoc; refreshKey: number }) {
  const [session, setSession] = useState<{ sessionId: string; token: string; eventsUrl: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSession(null);
    try {
      const res = await fetch(`${API_ORIGIN}/api/forms/${formId}/preview/sessions`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Could not start preview");
      const data = (await res.json()) as { sessionId: string; respondentToken: string; sseUrl: string };
      setSession({ sessionId: data.sessionId, token: data.respondentToken, eventsUrl: data.sseUrl });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setLoading(false);
    }
  }, [formId]);

  useEffect(() => {
    const t = setTimeout(() => void start(), 0);
    return () => clearTimeout(t);
  }, [start, refreshKey]);

  const config = toPublicConfig(doc, { slug: doc.title.toLowerCase().replace(/\s+/g, "-"), brandingHidden: true });

  return (
    <div className="flex h-full w-full flex-col items-center">
      <div className="flex w-full items-center justify-between px-2 pb-2.5">
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <span className="inline-block size-1.5 animate-pulse rounded-full bg-green-500" />
          Live preview — talks to your working draft
        </p>
        <Button variant="outline" size="sm" className="h-7 rounded-full px-3 text-xs" onClick={() => void start()} disabled={loading}>
          <RefreshCw className="size-3" /> Restart
        </Button>
      </div>
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-2xl border bg-[var(--card)] shadow-md">
        {loading && (
          <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">Starting preview…</div>
        )}
        {error && (
          <div className="text-destructive flex flex-1 flex-col items-center justify-center gap-2 text-sm">
            {error}
            <Button variant="outline" size="sm" onClick={() => void start()}>Retry</Button>
          </div>
        )}
        {session && (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ChatClient config={config} existingSession={session} previewMode />
          </div>
        )}
      </div>
    </div>
  );
}
