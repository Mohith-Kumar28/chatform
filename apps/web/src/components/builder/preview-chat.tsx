"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { FormDoc, toPublicConfig } from "@repo/form-schema";
import { ChatClient } from "@/components/chat/chat-client";
import { Button } from "@/components/ui/button";
import { API_ORIGIN } from "@/lib/api/mutator";
import { useEntitlements } from "@/hooks/use-entitlements";


/**
 * Live preview — the real interview runtime against the working draft, so the
 * builder and a respondent see the same thing.
 *
 * It used to restart on every `refreshKey` change, which was wired to the
 * autosave counter: the conversation reset itself every time you typed a
 * character into a question. Now it restarts only when the *structure* changes
 * (blocks added, removed, reordered or retyped) or when you ask it to. Editing
 * a title mid-conversation leaves the conversation alone.
 */
export function PreviewChat({
  formId,
  doc,
  chromeless = false,
}: {
  formId: string;
  doc: FormDoc;
  /** Hide the label strip — the preview dialog supplies its own controls. */
  chromeless?: boolean;
}) {
  const [session, setSession] = useState<{ sessionId: string; token: string; eventsUrl: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  // Identity of the conversation's shape. Titles and descriptions are excluded
  // deliberately — they change on every keystroke.
  const structureKey = useMemo(
    () => doc.blocks.map((b) => `${b.ref}:${b.type}:${b.required ? 1 : 0}`).join("|"),
    [doc.blocks],
  );

  const start = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSession(null);
    try {
      const res = await fetch(`${API_ORIGIN}/api/forms/${formId}/preview/sessions`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error(res.status === 404 ? "Form not found" : "Could not start preview");
      const data = (await res.json()) as { sessionId: string; respondentToken: string; sseUrl: string };
      setSession({ sessionId: data.sessionId, token: data.respondentToken, eventsUrl: data.sseUrl });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setLoading(false);
    }
  }, [formId]);

  // React strict mode double-mounts effects in dev; guard so we don't open two
  // sessions and then race their SSE streams.
  const pending = useRef(false);
  useEffect(() => {
    if (pending.current) return;
    pending.current = true;
    void start().finally(() => {
      pending.current = false;
    });
  }, [start, structureKey, nonce]);

  // `toPublicConfig` here runs on the working draft, not a published version,
  // so nothing has stripped a Pro-only brand logo/name yet the way publish
  // does (see `stripForPublish`). Mirror that here so this preview shows the
  // chrome a respondent will actually get rather than what publish would undo.
  const { can } = useEntitlements();
  const branded = can("brand_logo");
  const config = useMemo(() => {
    const c = toPublicConfig(doc, {
      slug: doc.title.toLowerCase().replace(/\s+/g, "-"),
      brandingHidden: true,
    });
    if (!branded) {
      c.theme.logoUrl = null;
      c.theme.brandName = undefined;
    }
    return c;
  }, [doc, branded]);

  return (
    <div className="flex h-full w-full flex-col">
      {!chromeless && (
        <div className="flex w-full items-center justify-end pb-2">
          <Button
            variant="ghost"
            size="sm"
            shape="pill"
            className="h-7 px-2.5 text-xs"
            onClick={() => setNonce((n) => n + 1)}
            disabled={loading}
          >
            <RefreshCw className="size-3" />
            Restart
          </Button>
        </div>
      )}

      <div className="bg-card shadow-md flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-2xl">
        {loading && (
          <div className="flex flex-1 flex-col justify-end gap-2 p-4">
            <div className="shimmer h-9 w-3/5 rounded-2xl" />
            <div className="shimmer h-9 w-2/5 self-end rounded-2xl" />
            <div className="shimmer h-9 w-1/2 rounded-2xl" />
          </div>
        )}
        {error && (
          <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm">
            <TriangleAlert className="text-destructive size-5" />
            <p>{error}</p>
            <Button variant="outline" size="sm" shape="pill" onClick={() => setNonce((n) => n + 1)}>
              Try again
            </Button>
          </div>
        )}
        {session && (
          <div className="min-h-0 flex-1">
            <ChatClient
              config={config}
              existingSession={session}
              previewMode
              // "Start over" inside the conversation needs a new session, and
              // only this component can ask for one — the draft it runs against
              // is not published, so there is no public slug to post to.
              onRestart={() => setNonce((n) => n + 1)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
