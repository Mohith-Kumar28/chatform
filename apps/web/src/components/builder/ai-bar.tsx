"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, Check, GitBranch, Loader2, Mic, Minus, Shuffle, SlidersHorizontal, Sparkles, Square, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { FormDoc as FormDocSchema, lintFormDoc, type FormDoc, type KnowledgeAdd, type SettingChange } from "@repo/form-schema";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { useBuilderStore } from "@/stores/builder-store";
import { blockMeta, TONE_CLASSES } from "./block-library";
import { loadHistory, type Turn } from "./ai-bar-thread";
import { KEY } from "./use-builder-shortcuts";
import { useDictation } from "@/hooks/use-dictation";
import { cn } from "@/lib/utils";
import { streamEvents, type SseEvent } from "@/lib/api/stream";
import { postApiFormsByIdKnowledgeLink, postApiFormsByIdKnowledgeText } from "@/lib/api/dashboard/dashboard";
import { applySettingChanges } from "./ai-settings";
import { SettingRows } from "./ai-setting-rows";
import { RichText, SAFE_ELEMENTS } from "@/components/chat/rich-text";
import { ClarifyPanel, type ClarifyAnswer, type ClarifyQuestion } from "@/components/forms/clarify-panel";
import { customFetch } from "@/lib/api/mutator";

/** Refs of questions no path through the form reaches. */
function unreachableRefs(doc: FormDoc): string[] {
  return lintFormDoc(doc).find((i) => i.code === "unreachable_blocks")?.refs ?? [];
}

/** Plain words for an edit whose summary came back empty. */
function describeEdit(added: number, updated: number, removed: number, rules: number): string {
  const parts: string[] = [];
  if (added) parts.push(`${added} new question${added > 1 ? "s" : ""}`);
  if (updated) parts.push(`${updated} question${updated > 1 ? "s" : ""} changed`);
  if (removed) parts.push(`${removed} removed`);
  if (rules) parts.push(`${rules} branching rule${rules > 1 ? "s" : ""}`);
  return parts.length ? `Here is the change: ${parts.join(", ")}.` : "Here is the change.";
}

/**
 * Add what a proposal named to the knowledge base, once it is applied.
 *
 * Through the same routes the Knowledge tab uses, so the plan's source limit
 * and the page reader apply exactly as they do there. A proposal carries these
 * rather than adding them itself: nothing it names should exist before Apply.
 */
async function addKnowledge(formId: string, items: readonly KnowledgeAdd[]) {
  let added = 0;
  for (const item of items) {
    try {
      if (item.kind === "link") await postApiFormsByIdKnowledgeLink(formId, { url: item.url });
      else await postApiFormsByIdKnowledgeText(formId, { title: item.title, body: item.body });
      added++;
    } catch (err) {
      console.error("ai_knowledge_add_failed", item.kind, err);
    }
  }
  if (added > 0) toast.success(`Added ${added === 1 ? "1 source" : `${added} sources`} to the knowledge base`, { description: "It is read in the background." });
  if (added < items.length) toast.error("Some knowledge could not be added. Try it from Settings → Agent → Knowledge.");
}

/**
 * "Build with AI" — a slim docked bar that expands into a conversation when
 * focused and collapses when you click away.
 *
 * Collapsed it is one line and gets out of the way; expanded it keeps the
 * thread so you can see what you asked for and what it produced. Suggested
 * blocks are reviewed before they land, and applying them is a single undo
 * step.
 */
/** The steps an edit reports, matching the server's `EditStage`. */
type EditStage = "reading" | "links" | "editing" | "checking" | "repairing";

/** What each looks like to somebody watching. */
const STAGE_COPY: Record<EditStage, string> = {
  reading: "Reading your form",
  links: "Reading your link",
  editing: "Making the change",
  checking: "Checking the flow",
  repairing: "Fixing the flow",
};

export function AiBar() {
  const doc = useBuilderStore((s) => s.doc);
  const formId = useBuilderStore((s) => s.formId);
  const edit = useBuilderStore((s) => s.edit);
  const select = useBuilderStore((s) => s.select);

  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  /**
   * Which step the edit is on, or null when nothing is running.
   *
   * Only the kinds of waiting an author would recognise as different. The tool
   * loop's own step numbers mean nothing to somebody who asked for an email
   * question, so they never reach here.
   */
  const [stage, setStage] = useState<EditStage | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  /**
   * What the AI asked before making a change, while the author answers.
   *
   * The same step, questions and panel as a new form (`/ai/clarify-form`,
   * `ClarifyPanel`), asked about this form and this conversation. Null for
   * most requests: a clear one goes straight to the edit.
   */
  const [asking, setAsking] = useState<{
    text: string;
    pendingId: string;
    history: { role: Turn["role"]; text: string }[];
    questions: ClarifyQuestion[];
  } | null>(null);
  const markAiTurnApplied = useBuilderStore((s) => s.markAiTurnApplied);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  /*
   * Talking to the builder, using the recogniser the browser already has.
   *
   * Words land in the field rather than going straight off as a request: what
   * you say to a form builder is "make the second one optional and move it
   * above the email" — a sentence worth reading back before it is acted on,
   * and the one place a recogniser's mistakes are cheap to fix.
   */
  const dictation = useDictation({
    text: prompt,
    onChange: setPrompt,
    onError: (message) => toast.error(message),
  });

  // Collapse on click-away and on Escape — but never mid-request, which would
  // hide the spinner and make it look like nothing happened.
  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (busy) return;
      if (wrapRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, busy]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!formId) return;
    let live = true;
    loadHistory(formId)
      .then((t) => live && setTurns(t))
      .catch(() => live && setTurns([]));
    return () => {
      live = false;
    };
  }, [formId]);


  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy]);

  // Opening lands on the latest message, before paint, so the thread grows in
  // already showing the end of the conversation instead of scrolling to it.
  useLayoutEffect(() => {
    const el = threadRef.current;
    if (open && el) el.scrollTop = el.scrollHeight;
  }, [open]);

  // Grow to fit, between one line and a ceiling. Opening the bar used to raise
  // the floor to two lines, which pushed the controls onto a row of their own
  // and made an empty field jump in height for no reason. The ceiling keeps a
  // pasted page from swallowing the canvas; past it the field scrolls.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 32), 240)}px`;
  }, [prompt]);

  async function run() {
    const text = prompt.trim();
    if (!text || !doc || busy || asking) return;

    // The field is about to be cleared; a recogniser still writing into it
    // would put the next half-sentence on top of an empty prompt.
    dictation.stop();
    setPrompt("");
    setBusy(true);
    // Shown at once under a local id; the server's copy replaces it when the
    // reply lands, so the ids on screen are the stored ones.
    const pendingId = crypto.randomUUID();
    setTurns((t) => [...t, { id: pendingId, role: "user", text }]);

    /**
     * The thread goes with the request.
     *
     * It was on screen and nowhere else: every message was sent as if it were
     * the first, so "even if it's iOS, we still need their email" arrived with
     * no idea what "even" was qualifying, and came back with a question about
     * iOS devices instead of an email field. The proposals themselves are left
     * out — an applied one is already in the form the server reads, and an
     * unapplied one is not part of the form at all.
     */
    const history = turns.slice(-8).map((t) => ({ role: t.role, text: t.text }));

    // Anything worth asking first? Usually not. A failure here is silence:
    // the question is an improvement on a guess, never a gate on the edit.
    setStage("reading");
    try {
      const res = await customFetch<{ questions: ClarifyQuestion[] }>("/api/ai/clarify-form", {
        method: "POST",
        body: JSON.stringify({ prompt: text, formId, history }),
      });
      if (res.questions?.length) {
        setAsking({ text, pendingId, history, questions: res.questions });
        setBusy(false);
        setStage(null);
        return;
      }
    } catch {
      // Straight to the edit.
    }
    await makeEdit(text, pendingId, history, []);
  }

  async function makeEdit(
    text: string,
    pendingId: string,
    history: { role: Turn["role"]; text: string }[],
    clarifications: ClarifyAnswer[],
  ) {
    if (!doc) return;
    setAsking(null);
    setBusy(true);
    const answered = clarifications.filter((a) => a.answer.trim());
    const shown: Turn = { id: pendingId, role: "user", text: answered.length ? `${text}\n\n${answered.map((a) => `${a.question} → ${a.answer.trim()}`).join("\n")}` : text };
    setTurns((t) => t.map((x) => (x.id === pendingId ? shown : x)));
    const settle = (stored: Turn[] | undefined, reply: Turn) =>
      setTurns((t) => [...t.filter((x) => x.id !== pendingId), stored?.[0] ?? shown, reply]);

    type EditResult = {
      doc?: unknown;
      rules?: number;
      rewired?: number;
      updatedRefs?: string[];
      removedRefs?: string[];
      summary?: string;
      /** Form settings it changes, checked and plan-gated by the server. */
      settings?: SettingChange[];
      knowledge?: KnowledgeAdd[];
      /** Set when the model stopped to ask rather than to propose. */
      question?: string;
      /** A reply to "how do I…", with or without a proposal beside it. */
      answer?: string | null;
      /** Set when a review flagged the proposal and could not fix it. */
      reviewNote?: string | null;
      /** What the server stored for this exchange: the prompt, then the reply. */
      turns?: Turn[];
    };

    try {
      /**
       * Streamed, so the wait says what it is doing.
       *
       * An edit that runs as a tool loop takes ten seconds and sometimes
       * thirty, and one spinner for thirty seconds is indistinguishable from a
       * hang — the same problem, and the same fix, as the generator's progress
       * list. `stage` events drive the line under the composer; the proposal
       * still arrives whole, at the end, exactly as it did over JSON.
       */
      let res: EditResult | null = null;
      let failure: { message: string; turns?: Turn[] } | null = null;
      await streamEvents("/api/ai/edit-form/stream", {
        // The offset turns "close it at 6pm on the 30th" into the author's 6pm,
        // not the server's.
        body: { formId, prompt: text, history, utcOffsetMinutes: new Date().getTimezoneOffset(), clarifications: answered },
        onEvent: ({ event, data }: SseEvent) => {
          if (event === "stage") setStage((data as { id: EditStage }).id);
          else if (event === "done") res = data as EditResult;
          else if (event === "error") failure = data as { message: string; turns?: Turn[] };
        },
      });
      setStage(null);
      if (failure) {
        const f = failure as { message: string; turns?: Turn[] };
        settle(f.turns, f.turns?.[1] ?? { id: crypto.randomUUID(), role: "assistant", text: f.message });
        return;
      }
      if (!res) throw new Error("That edit didn't finish. Try again.");

      /**
       * It asked something instead of changing something.
       *
       * An ordinary assistant message with no proposal attached and nothing to
       * apply — the form is untouched. The author's reply goes back as the next
       * message, and `history` carries the question with it, so the answer
       * lands against the thing that was asked rather than arriving as a new
       * request out of nowhere.
       */
      const result: EditResult = res;
      const reply = result.question ?? (result.doc === undefined ? result.answer : null);
      if (reply) {
        settle(result.turns, result.turns?.[1] ?? { id: crypto.randomUUID(), role: "assistant", text: reply });
        return;
      }

      // The proposal is the whole document — the new questions, where they sit,
      // and any branching. It is diffed only to describe what changed; applying
      // takes the document as a whole.
      const proposed = FormDocSchema.safeParse(result.doc);
      if (!proposed.success) throw new Error("The proposal came back in a shape I couldn't read.");

      // Questions this proposal cuts off. Compared against the form as it is,
      // so a question that was already unreachable is not blamed on the edit.
      const reachableNow = new Set(unreachableRefs(doc));
      const orphaned = unreachableRefs(proposed.data)
        .filter((ref) => !reachableNow.has(ref))
        .map((ref) => proposed.data.blocks.find((b) => b.ref === ref)?.title || ref);

      const existing = new Set(doc.blocks.map((b) => b.ref));
      const added = proposed.data.blocks.filter((b) => !existing.has(b.ref));
      const removed = result.removedRefs ?? [];
      const updated = result.updatedRefs ?? [];
      const rules = result.rules ?? 0;

      /**
       * An edit that adds no questions is a real edit.
       *
       * This used to say "I couldn't think of anything new to add" whenever
       * `added` was empty — which was the common case for the most common kind
       * of request, since changing who gets asked what adds nothing. The server
       * now refuses genuinely empty edits with a 422, so anything that arrives
       * here changed something worth describing.
       */
      // The server's reply, which is what was stored, with the proposal the
      // browser holds attached so it can be applied. The local description is
      // only for a reply that came back without one.
      const stored = result.turns?.[1];
      settle(
        result.turns,
        stored
          ? { ...stored, doc: proposed.data }
          : {
              id: crypto.randomUUID(),
              role: "assistant",
              text: result.summary?.trim() || describeEdit(added.length, updated.length, removed.length, rules),
              blocks: added,
              removed,
              updated,
              rules,
              rewired: result.rewired ?? 0,
              orphaned,
              settings: result.settings,
              knowledge: result.knowledge,
              doc: proposed.data,
            },
      );
    } catch (err) {
      setTurns((t) => [
        ...t,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: err instanceof Error ? err.message : "Something went wrong.",
        },
      ]);
    } finally {
      setBusy(false);
      setStage(null);
    }
  }

  function apply(turn: Turn) {
    const next = turn.doc;
    const added = turn.blocks ?? [];
    // Not gated on `added.length` any more. An edit whose whole content is new
    // routing has no new questions, and refusing to apply it was the last place
    // this flow still assumed every change adds something.
    if (!next) return;
    const settings = (turn.settings ?? []).filter((c) => !c.locked);
    const knowledge = (turn.knowledge ?? []).filter((k) => !k.locked);
    // Only an edit that touched the questions replaces them. One that changed
    // nothing but settings would otherwise put back the questions as they were
    // when it was asked, over anything the author did in the meantime.
    const touchesQuestions =
      added.length > 0 ||
      (turn.removed?.length ?? 0) > 0 ||
      (turn.updated?.length ?? 0) > 0 ||
      (turn.rules ?? 0) > 0 ||
      (turn.rewired ?? 0) > 0 ||
      (settings.length === 0 && knowledge.length === 0);

    // Take the whole proposal. Pushing the new blocks onto the end instead —
    // which is what this did — discarded both the positions chosen for them
    // and every branching rule, so a question meant only for iPhone users was
    // appended after everything and asked of everyone.
    edit((d) => {
      if (touchesQuestions) {
        d.blocks = next.blocks as never;
        d.logic = next.logic as never;
        d.endings = next.endings as never;
      }
      // Settings go onto the live document one by one, for the same reason.
      applySettingChanges(d as FormDoc, settings);
    });
    if (added[0]) select(added[0].ref);
    setTurns((t) => t.map((x) => (x.id === turn.id ? { ...x, applied: true } : x)));
    // Stored as applied on the autosave this edit triggers, not by a call of its own.
    markAiTurnApplied(turn.id);
    if (formId && knowledge.length > 0) void addKnowledge(formId, knowledge);

    const rules = turn.rules ?? 0;
    const removed = turn.removed?.length ?? 0;
    const parts: string[] = [];
    if (added.length) parts.push(`Added ${added.length} question${added.length > 1 ? "s" : ""}`);
    if (removed) parts.push(`removed ${removed}`);
    if (rules) parts.push(`${rules} branching rule${rules > 1 ? "s" : ""} set up`);
    if (settings.length) parts.push(`${settings.length} setting${settings.length > 1 ? "s" : ""} changed`);
    const summary = parts.length ? parts.join(", ") : knowledge.length ? "" : "Flow updated";
    if (summary) toast.success(summary.charAt(0).toUpperCase() + summary.slice(1), { description: "⌘Z to undo." });
  }

  return (
    <div ref={wrapRef} className="pointer-events-auto w-full max-w-xl">
      {/* No `layout` here. It animated the resize as a scale transform, which
          squashed and stretched the text mid-flight. The card now just follows
          its content, and the thread below animates its own height. */}
      <div
        className={cn(
          "bg-card overflow-hidden rounded-3xl transition-shadow duration-200",
          open ? "shadow-lg" : "shadow-md",
        )}
      >
        <AnimatePresence initial={false}>
          {open && turns.length > 0 && (
            <motion.div
              key="thread"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{
                height: { duration: 0.28, ease: [0.32, 0.72, 0, 1] },
                opacity: { duration: 0.2, ease: "easeOut" },
              }}
              // Clips the thread while its height is still catching up, so
              // messages never paint over the field below.
              className="overflow-hidden"
            >
              <div ref={threadRef} className="max-h-[min(28rem,55vh)] space-y-2.5 overflow-y-auto p-3">
                {turns.map((turn) => (
                  <Message key={turn.id} turn={turn} current={doc} onApply={apply} />
                ))}
                {asking && (
                  <div className="px-1 pt-1">
                    <ClarifyPanel
                      key={asking.pendingId}
                      intent="edit"
                      questions={asking.questions}
                      busy={busy}
                      onSubmit={(answers) => void makeEdit(asking.text, asking.pendingId, asking.history, answers)}
                      onSkip={() => void makeEdit(asking.text, asking.pendingId, asking.history, [])}
                    />
                  </div>
                )}
                {busy && (
                  <div className="text-muted-foreground flex items-center gap-2 px-1 text-sm">
                    <Loader2 className="size-3.5 animate-spin" />
                    {/* "Thinking…" for thirty seconds is indistinguishable
                        from a hang. Each of these is a step the server has
                        actually reached. */}
                    {stage ? STAGE_COPY[stage] : "Thinking…"}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run();
          }}
          className={cn(
            "flex items-end gap-2 px-3 py-2",
            // A hairline between what was said and what you are writing, only
            // once there is a thread above to separate it from.
            open && turns.length > 0 && "border-border/60 border-t",
          )}
        >
          {/* Every item in this row is one 32px line tall — the spark, the key,
              a single line of text and the buttons — so on one line they all
              share a centre, and the controls stay on the last line as the text
              grows, where a thumb expects them. The spark labels an empty field;
              once there is text it has nothing left to say and gives the words
              its width. */}
          <AnimatePresence initial={false}>
            {!prompt && (
              <FadeWidth key="spark">
                <Sparkles className="text-primary size-4" />
              </FadeWidth>
            )}
          </AnimatePresence>
          {/* The key that gets you here, at the head of the line beside the
              spark rather than trailing after the placeholder — it belongs with
              the label for the input, not with the send button, and on the right
              it read as something you press to send. Hidden once the bar is open
              or has text, when it is only noise. */}
          {/* No `sm:` gate of its own any more: `Kbd` is drawn where there is
              a keyboard to press, which is the question this was asking badly —
              a 640px viewport with a trackpad had the key and was not told, and
              a wide tablet without one was. */}
          <AnimatePresence initial={false}>
            {!open && !prompt && (
              <FadeWidth key="kbd">
                <Kbd className="h-6 min-w-6 rounded-md px-1.5 text-xs">{KEY.askAi}</Kbd>
              </FadeWidth>
            )}
          </AnimatePresence>
          <textarea
            ref={inputRef}
            // How `/` finds this from the shell's keyboard layer.
            data-shortcut-target="ai-bar"
            value={prompt}
            rows={1}
            onFocus={() => setOpen(true)}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void run();
              }
            }}
            placeholder={asking ? "Answer above, or skip them" : "Ask AI to make changes…"}
            className="min-h-8 flex-1 resize-none overflow-y-auto bg-transparent py-1.5 text-sm leading-5 outline-none placeholder:text-[color-mix(in_oklch,currentColor_45%,transparent)]"
          />
          {/* Nothing at all where the browser has no recogniser — a mic that
              cannot listen is worse than no mic. */}
          {dictation.supported && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              shape="pill"
              onClick={() => {
                dictation.toggle();
                inputRef.current?.focus();
              }}
              aria-pressed={dictation.listening}
              aria-label={dictation.listening ? "Stop dictating" : "Dictate"}
              className={cn(
                "shrink-0",
                dictation.listening && "text-destructive hover:text-destructive",
              )}
            >
              {dictation.listening ? (
                <span className="relative flex size-3.5 items-center justify-center">
                  {/* The ring is the only thing on this bar that moves on its
                      own, which is the point: a microphone that is open has to
                      be visible from the corner of your eye. */}
                  <span className="bg-destructive/25 absolute inline-flex size-full animate-ping rounded-full" />
                  <Square className="size-2.5 fill-current" />
                </span>
              ) : (
                <Mic className="size-[1.125rem]" />
              )}
            </Button>
          )}
          <Button
            type="submit"
            size="icon-sm"
            shape="pill"
            disabled={busy || Boolean(asking) || !prompt.trim()}
            aria-label="Ask"
            className="shrink-0"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowUp className="size-3.5" />}
          </Button>
        </form>
      </div>
    </div>
  );
}

/**
 * A leading adornment that folds its width away as it fades, so the text
 * beside it slides over instead of jumping. The negative margin cancels the
 * row's gap while it is gone.
 */
function FadeWidth({ children }: { children: React.ReactNode }) {
  return (
    <motion.span
      initial={{ width: 0, opacity: 0, marginRight: -8 }}
      animate={{ width: "auto", opacity: 1, marginRight: 0 }}
      exit={{ width: 0, opacity: 0, marginRight: -8 }}
      transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
      className="flex h-8 shrink-0 items-center self-start overflow-hidden"
    >
      {children}
    </motion.span>
  );
}

function Message({
  turn,
  current,
  onApply,
}: {
  turn: Turn;
  /** The form as it is now, for working out which colours follow a new one. */
  current: FormDoc | null;
  onApply: (turn: Turn) => void;
}) {
  if (turn.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="bg-primary text-primary-foreground max-w-[85%] rounded-2xl rounded-br-md px-3 py-1.5 text-sm whitespace-pre-line">
          {turn.text}
        </p>
      </div>
    );
  }

  const added = turn.blocks ?? [];
  const removed = turn.removed ?? [];
  const updated = turn.updated ?? [];
  const rules = turn.rules ?? 0;
  const rewired = turn.rewired ?? 0;
  const orphaned = turn.orphaned ?? [];
  const settings = turn.settings ?? [];
  const knowledge = turn.knowledge ?? [];
  // An assistant turn is a proposal when it carries one, in any of its forms —
  // questions, removals, changed settings, or nothing but new wiring.
  const isProposal =
    turn.blocks !== undefined ||
    removed.length > 0 ||
    updated.length > 0 ||
    rules > 0 ||
    rewired > 0 ||
    settings.length > 0 ||
    knowledge.length > 0;
  // Everything it would do is locked: there is nothing to apply, only the rows saying why.
  const allLocked =
    settings.length + knowledge.length > 0 &&
    settings.every((c) => c.locked) &&
    knowledge.every((k) => k.locked) &&
    added.length + removed.length + updated.length + rules + rewired === 0;

  return (
    <div className="space-y-1.5">
      {/* Markdown, since a reply to "what can you do" is a list, not a paragraph.
          The same renderer and element allowlist as the respondent chat's agent. */}
      <RichText
        markdown={turn.text}
        trusted={false}
        allowedElements={SAFE_ELEMENTS}
        className="bg-muted max-w-[90%] rounded-2xl rounded-bl-md px-3 py-1.5 text-sm"
      />

      {isProposal && (
        <div className="space-y-1.5 pl-1">
          {added.length > 0 && (
            <ul className="space-y-1">
              {added.map((b) => {
                const meta = blockMeta(b.type);
                return (
                  <li key={b.ref} className="bg-muted/50 flex items-center gap-2 rounded-xl px-2 py-1.5">
                    <span className={cn("grid size-5 shrink-0 place-items-center rounded-md", TONE_CLASSES[meta.tone])}>
                      <meta.icon className="size-2.5" strokeWidth={2} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs">{b.title}</span>
                  </li>
                );
              })}
            </ul>
          )}
          {removed.length > 0 && (
            <ul className="space-y-1">
              {removed.map((ref) => (
                <li
                  key={ref}
                  className="bg-destructive-soft/50 text-muted-foreground flex items-center gap-2 rounded-xl px-2 py-1.5"
                >
                  <span className="grid size-5 shrink-0 place-items-center rounded-md">
                    <Minus className="size-2.5" strokeWidth={2.5} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs line-through">{ref}</span>
                </li>
              ))}
            </ul>
          )}
          {updated.length > 0 && (
            <p className="text-muted-foreground flex items-center gap-1 px-1 text-xs">
              <SlidersHorizontal className="size-3 shrink-0" />
              Changes settings on {updated.length === 1 ? updated[0] : `${updated.length} questions`}
            </p>
          )}
          {rewired > 0 && (
            <p className="text-muted-foreground flex items-center gap-1 px-1 text-xs">
              <Shuffle className="size-3 shrink-0" />
              Re-routes {rewired === 1 ? "1 question" : `${rewired} questions`}, replacing what was there
            </p>
          )}
          {rules > 0 && (
            <p className="text-muted-foreground flex items-center gap-1 px-1 text-xs">
              <GitBranch className="size-3 shrink-0" />
              {rules} branching rule{rules > 1 ? "s" : ""}, so each answer only sees what applies to it
            </p>
          )}
          {(settings.length > 0 || knowledge.length > 0) && (
            <SettingRows changes={settings} knowledge={knowledge} doc={current} applied={turn.applied} />
          )}
          {orphaned.length > 0 && !turn.applied && (
            <p className="flex items-start gap-1 px-1 text-xs text-amber-600 dark:text-amber-400">
              <TriangleAlert className="mt-0.5 size-3 shrink-0" />
              <span>
                Leaves {orphaned.length === 1 ? "1 question" : `${orphaned.length} questions`} nobody can reach:{" "}
                {orphaned.slice(0, 3).join(", ")}
                {orphaned.length > 3 ? `, and ${orphaned.length - 3} more` : ""}
              </span>
            </p>
          )}
          {allLocked ? null : turn.applied ? (
            <p className="text-muted-foreground flex items-center gap-1 px-1 text-xs">
              <Check className="size-3" />
              Applied
            </p>
          ) : turn.doc ? (
            <Button size="sm" shape="pill" onClick={() => onApply(turn)}>
              {/* Named for what the edit does. It said "Add them" regardless,
                  which was wrong for the many edits that add nothing. */}
              {orphaned.length > 0
                ? "Apply anyway"
                : added.length > 0 && removed.length === 0
                  ? `Add ${added.length === 1 ? "it" : "them"}`
                  : "Apply"}
            </Button>
          ) : (
            // The proposal is not kept in storage, so a thread restored from a
            // previous visit can show what was suggested but not apply it.
            <p className="text-muted-foreground px-1 text-xs">Ask again to apply this.</p>
          )}
        </div>
      )}
    </div>
  );
}
