"use client";

import { Flag, Plus, ShieldAlert, X } from "lucide-react";
import type { FormDoc } from "@repo/form-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BufferedInput, BufferedTextarea } from "@/components/ui/buffered-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const uid = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;

/**
 * The ending's settings, wherever you selected it from.
 *
 * This used to live inside `workflow-client`, which meant it only existed on
 * the canvas: clicking an ending in the Questions list selected it in the store
 * and the Build inspector — which only ever asked for the selected *block* —
 * drew "Nothing selected" beside it. One document, one selection, one panel, so
 * the panel is shared the way `BlockInspector` already is.
 */
export function EndingInspector({
  ending,
  doc,
  onChange,
}: {
  ending: FormDoc["endings"][number];
  doc: FormDoc;
  onChange: (d: FormDoc) => void;
}) {
  const screenOut = ending.kind === "screen_out";
  const patch = (fields: Partial<FormDoc["endings"][number]>) =>
    onChange({
      ...doc,
      endings: doc.endings.map((x) => (x.ref === ending.ref ? { ...x, ...fields } : x)),
    });

  /**
   * The last success ending cannot become a screen-out.
   *
   * `lintFormDoc` catches it and blocks publishing, but discovering that from
   * the publish button — two panels away from the toggle that caused it —
   * leaves the author looking for the mistake. A form where every outcome
   * refuses is never what somebody meant, so the control that would do it is
   * simply not available.
   */
  const otherSuccess = doc.endings.some((x) => x.ref !== ending.ref && x.kind !== "screen_out");

  const requirements = ending.requirements;
  const setRequirements = (next: FormDoc["endings"][number]["requirements"]) => patch({ requirements: next });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5">
        {/* The same green/red the node and the list use, so the panel and the
            thing it is describing agree about which outcome this is. */}
        {screenOut ? (
          <ShieldAlert className="text-destructive size-4" />
        ) : (
          <Flag className="text-success size-4" />
        )}
        <p className="text-sm font-semibold">Ending</p>
      </div>

      <div className="space-y-1.5">
        <Label>Outcome</Label>
        <Select
          value={ending.kind}
          onValueChange={(v) => {
            const kind = v as FormDoc["endings"][number]["kind"];
            patch({
              kind,
              // Turning a refusal back into a thank-you leaves its requirement
              // list behind rather than deleting it, so flipping the picker by
              // accident is not destructive; it simply stops rendering.
              ...(kind === "screen_out" && ending.title === "Thank you!"
                ? { title: "You can't submit this form" }
                : {}),
            });
          }}
        >
          <SelectTrigger size="sm" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="success">Response accepted</SelectItem>
            <SelectItem value="screen_out" disabled={!otherSuccess}>
              Can&apos;t submit — turn them away
            </SelectItem>
          </SelectContent>
        </Select>
        <p className="text-muted-foreground text-xs">
          {screenOut
            ? "Nothing is submitted. The response is kept as screened out, and no completion webhook or email fires."
            : otherSuccess
              ? "The response is submitted and counts as a completion."
              : "This is the only ending that accepts a response, so it cannot turn people away."}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>Title</Label>
        <BufferedInput value={ending.title} onCommit={(v) => patch({ title: v })} />
      </div>
      <div className="space-y-1.5">
        <Label>{screenOut ? "What they can do about it" : "Message"}</Label>
        <BufferedTextarea rows={3} value={ending.bodyMd} onCommit={(v) => patch({ bodyMd: v })} />
      </div>

      {screenOut && (
        <div className="space-y-1.5">
          <Label>Requirements they didn&apos;t meet</Label>
          <p className="text-muted-foreground text-xs">
            Listed on the screen so they know what to fix.
          </p>
          <div className="space-y-1.5">
            {requirements.map((r, i) => (
              <div key={r.id} className="flex gap-1.5">
                <Input
                  className="h-8 min-w-0 flex-1 text-xs"
                  value={r.label}
                  placeholder="A team of 2 to 5 people"
                  onChange={(e) =>
                    setRequirements(requirements.map((x) => (x.id === r.id ? { ...x, label: e.target.value } : x)))
                  }
                />
                <button
                  type="button"
                  aria-label={`Remove requirement ${i + 1}`}
                  onClick={() => setRequirements(requirements.filter((x) => x.id !== r.id))}
                  className="text-muted-foreground hover:text-destructive shrink-0 px-1"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() =>
              setRequirements([...requirements, { id: uid("req"), label: "", when: null }])
            }
          >
            <Plus className="size-3.5" /> Add a requirement
          </Button>
        </div>
      )}
    </div>
  );
}
