"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { FormDoc, localizeFormDoc, toPublicConfig } from "@repo/form-schema";
import { ChatClient } from "@/components/chat/chat-client";
import { Button } from "@/components/ui/button";
import { API_ORIGIN, apiHeaders } from "@/lib/api/mutator";
import { useEntitlements } from "@/hooks/use-entitlements";
import { useBuilderStore } from "@/stores/builder-store";


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
  /**
   * The language being previewed, and what the server said about it.
   *
   * A form offered in several languages is previewed in any of them, from the
   * same switcher a respondent gets. The session is opened on the translated
   * draft, and the translations come back with it so the form drawn here from
   * the draft says the same words the session does.
   */
  const language = useBuilderStore((s) => s.previewLanguage);
  const setPreviewLanguage = useBuilderStore((s) => s.setPreviewLanguage);
  const setLanguage = useCallback(
    (code: string) => setPreviewLanguage(code === doc.settings.language ? null : code),
    [setPreviewLanguage, doc.settings.language],
  );
  const [locale, setLocale] = useState<{
    language: string;
    languages: string[];
    messages: Record<string, string>;
    translations: Record<string, string>;
  } | null>(null);
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
        // Not a bare fetch: `apiHeaders` carries "acting as a customer" when a
        // platform admin is impersonating. Without it this one request resolved
        // the admin's own organization, found no such form there, and answered
        // 404 — so the preview said "Form not found" about the form the builder
        // behind it had just loaded.
        headers: apiHeaders({ "content-type": "application/json" }),
        body: JSON.stringify(language ? { language } : {}),
      });
      if (!res.ok) {
        throw new Error(
          res.status === 404
            ? "This form isn't in the account you're signed in to."
            : res.status === 401
              ? "Your session has expired — sign in again."
              : "Could not start preview",
        );
      }
      const data = (await res.json()) as {
        sessionId: string;
        respondentToken: string;
        sseUrl: string;
        language?: string;
        languages?: string[];
        messages?: Record<string, string>;
        translations?: Record<string, string>;
      };
      setLocale(
        data.language
          ? { language: data.language, languages: data.languages ?? [], messages: data.messages ?? {}, translations: data.translations ?? {} }
          : null,
      );
      setSession({ sessionId: data.sessionId, token: data.respondentToken, eventsUrl: data.sseUrl });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setLoading(false);
    }
  }, [formId, language]);

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
    const shown = locale ? localizeFormDoc(doc, locale.language, new Map(Object.entries(locale.translations))) : doc;
    const c = toPublicConfig(shown, {
      slug: doc.title.toLowerCase().replace(/\s+/g, "-"),
      brandingHidden: true,
      ...(locale ? { language: locale.language, languages: locale.languages, messages: locale.messages } : {}),
    });
    if (!branded) {
      // Copied rather than assigned into. `toPublicConfig` hands back the
      // draft's own theme object, and the builder store is frozen in
      // development — so mutating it threw `Cannot assign to read only
      // property 'logoUrl'` and took the whole preview down for anyone
      // without `brand_logo`.
      c.theme = { ...c.theme, logoUrl: null, brandName: undefined };
    }
    return c;
  }, [doc, branded, locale]);

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

      {/*
        The chat surface wears the corners itself as well as being clipped by
        them. Chrome does not always clip a composited child to a parent's
        radius, and the corners showed a grey square behind the rounded card.
        `isolate` gives the clip its own stacking context for the same reason.
      */}
      <div className="bg-card shadow-md isolate flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-2xl [&_.chat-surface]:rounded-2xl">
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
              onLanguage={setLanguage}
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
