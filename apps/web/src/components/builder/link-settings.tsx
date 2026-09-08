"use client";

import { useEffect, useRef, useState } from "react";
import { ImageIcon, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import type { FormDoc } from "@repo/form-schema";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { LockedControl } from "@/components/billing/gate";
import { useClientValue } from "@/hooks/use-client-value";
import { assetUrl } from "@/lib/assets";
import { API_ORIGIN } from "@/lib/api/mutator";
import { cn } from "@/lib/utils";

/**
 * Link settings: how this form looks everywhere it isn't.
 *
 * The fields here were already in the schema and already read by the hosted
 * page, but they were four unrelated inputs in a settings list — you filled in
 * a "share description" and found out whether it worked by posting the link in
 * Slack. Everything on this screen is one card, and the card is drawn beside
 * the fields as you type, because the only question anyone has here is what the
 * thing will look like.
 *
 * The preview mirrors the fallbacks the hosted page actually uses — the form's
 * own title when no share title is set, the generic invitation when there is no
 * description, and our own branded card when no image has been uploaded — so an
 * empty field shows what will really be posted rather than an empty card.
 */

const TITLE_MAX = 120;
const DESCRIPTION_MAX = 300;

/** What `/f/[slug]` falls back to when no share description is set. */
const FALLBACK_DESCRIPTION = "Answer a few questions — it only takes a minute.";

export function LinkSettings({
  settings,
  formTitle,
  slug,
  onChange,
}: {
  settings: FormDoc["settings"];
  formTitle: string;
  slug: string | null;
  onChange: (next: FormDoc["settings"]) => void;
}) {
  const meta = settings.meta;
  const patchMeta = (p: Partial<FormDoc["settings"]["meta"]>) =>
    onChange({ ...settings, meta: { ...meta, ...p } });

  // The domain the card will show. Rendered blank on the server rather than
  // guessed, since a custom domain makes any hardcoded answer wrong.
  const host = useClientValue(() => window.location.host, "");

  const title = meta.ogTitle?.trim() || formTitle || "Untitled form";
  const description = meta.ogDescription?.trim() || FALLBACK_DESCRIPTION;

  /**
   * The card the crawler will actually fetch, drawn from the fields as they are
   * now. Deferred by half a second so typing a title is not a request per
   * keystroke.
   *
   * The fallback description is deliberately not sent: the card draws only a
   * description the author wrote, and the scheduled close from Settings goes on
   * in its place. Same parameters `/f/[slug]` builds, so this is the card.
   */
  const cardParams = new URLSearchParams({ title });
  if (meta.ogDescription?.trim()) cardParams.set("description", meta.ogDescription.trim());
  if (settings.closeRules.closeAt) cardParams.set("closeAt", settings.closeRules.closeAt);
  const defaultImageUrl = useDebounced(`/og/form?${cardParams}`, 400);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <LockedControl feature="form_metadata">
        <div className="space-y-7">
          <Field label="Title" count={meta.ogTitle?.length ?? 0} max={TITLE_MAX}>
            <Input
              maxLength={TITLE_MAX}
              placeholder={formTitle}
              value={meta.ogTitle ?? ""}
              onChange={(e) => patchMeta({ ogTitle: e.target.value || undefined })}
            />
          </Field>

          <Field label="Description" count={meta.ogDescription?.length ?? 0} max={DESCRIPTION_MAX}>
            <Textarea
              rows={3}
              maxLength={DESCRIPTION_MAX}
              placeholder={FALLBACK_DESCRIPTION}
              value={meta.ogDescription ?? ""}
              onChange={(e) => patchMeta({ ogDescription: e.target.value || undefined })}
            />
          </Field>

          <ImageField
            label="Preview image"
            hint="1200×630"
            assetKey={meta.ogImageKey}
            fallbackUrl={defaultImageUrl}
            aspect="aspect-[1200/630]"
            onChange={(key) => patchMeta({ ogImageKey: key })}
          />

          <ImageField
            label="Favicon"
            hint="Square, 60×60"
            assetKey={meta.faviconKey}
            fallbackUrl="/icon.svg"
            aspect="size-14"
            accept="image/png,image/x-icon,image/vnd.microsoft.icon,image/webp"
            onChange={(key) => patchMeta({ faviconKey: key })}
          />

          <div className="flex items-center justify-between gap-4 border-t pt-5">
            <div className="min-w-0">
              <p className="text-sm font-medium">Hide from search engines</p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Link previews still work.
              </p>
            </div>
            <Switch checked={meta.noIndex} onCheckedChange={(v) => patchMeta({ noIndex: v })} />
          </div>
        </div>
      </LockedControl>

      <SharePreview
        host={host}
        slug={slug}
        title={title}
        description={description}
        imageUrl={assetUrl(meta.ogImageKey) ?? defaultImageUrl}
        faviconUrl={assetUrl(meta.faviconKey) ?? "/icon.svg"}
        branded={!meta.ogImageKey}
      />
    </div>
  );
}

/**
 * A value that settles.
 *
 * The preview image is a server-rendered card fetched by URL, so binding it
 * straight to the title field would be one render per keystroke.
 */
function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}

function Field({
  label,
  count,
  max,
  children,
}: {
  label: string;
  count: number;
  max: number;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <Label className="text-sm font-medium">{label}</Label>
        {/* Counts up rather than down, and only once you are actually near the
            ceiling — a permanent 0/120 is a number nobody needs. The character
            limit and "defaults to the form's title" used to be spelled out
            under every field, which is three lines of instruction for a box
            whose placeholder already shows the default. */}
        {count > max * 0.7 && (
          <span className="text-muted-foreground tabular text-xs">
            {count}/{max}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

/**
 * One image, uploaded to the org's asset store and kept by key.
 *
 * Keys rather than URLs: the doc is portable between environments and the
 * public URL is derived at render time, which is what `toPublicConfig` already
 * does for the share image.
 */
function ImageField({
  label,
  hint,
  assetKey,
  /** What the hosted page will use when nothing is uploaded — our own card. */
  fallbackUrl,
  aspect,
  accept = "image/png,image/jpeg,image/gif,image/webp",
  onChange,
}: {
  label: string;
  hint: string;
  assetKey: string | null;
  fallbackUrl?: string;
  aspect: string;
  accept?: string;
  onChange: (key: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const url = assetUrl(assetKey);

  async function upload(file: File) {
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`${API_ORIGIN}/api/assets`, {
        method: "POST",
        credentials: "include",
        body,
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(err?.error?.message ?? "Upload failed");
      }
      const asset = (await res.json()) as { key: string };
      onChange(asset.key);
    } catch (err) {
      toast.error(`Couldn't upload the ${label.toLowerCase()}`, {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  // Ours until theirs. The thumbnail shows what the link will really carry
  // rather than an empty grey box with a picture icon in it.
  const shown = url ?? fallbackUrl ?? null;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <Label className="text-sm font-medium">{label}</Label>
        <span className="text-muted-foreground text-xs">{hint}</span>
      </div>
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "bg-muted text-muted-foreground grid shrink-0 place-items-center overflow-hidden rounded-lg border",
            aspect,
            aspect.startsWith("aspect") && "w-32",
          )}
        >
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shown} alt="" className="size-full object-cover" />
          ) : (
            <ImageIcon className="size-4" strokeWidth={1.75} />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
            {busy ? "Uploading…" : url ? "Replace" : "Upload"}
          </Button>
          {url ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onChange(null)}
              className="text-muted-foreground"
            >
              <Trash2 className="size-3.5" />
              Remove
            </Button>
          ) : (
            <span className="text-muted-foreground text-xs">Using the chatform default</span>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Cleared so choosing the same file twice still fires a change.
            e.target.value = "";
            if (file) void upload(file);
          }}
        />
      </div>
    </div>
  );
}

/**
 * The card, drawn the way Facebook, LinkedIn and X draw it: image on top,
 * domain, then title and one line of description.
 */
function SharePreview({
  host,
  slug,
  title,
  description,
  imageUrl,
  faviconUrl,
  branded,
}: {
  host: string;
  slug: string | null;
  title: string;
  description: string;
  imageUrl: string | null;
  faviconUrl: string | null;
  /** True while the card is ours rather than an uploaded one. */
  branded: boolean;
}) {
  return (
    <aside className="h-fit space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-caption font-medium tracking-wide uppercase">
          Preview
        </p>
        {/* Says which card this is without a paragraph explaining that a
            preview is a preview. */}
        {branded && <span className="text-muted-foreground text-xs">chatform default</span>}
      </div>

      <div className="bg-card overflow-hidden rounded-xl border shadow-xs">
        <div className="bg-muted grid aspect-[1200/630] place-items-center">
          {imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="" className="size-full object-cover" />
          )}
        </div>
        <div className="space-y-1 p-3.5">
          <div className="text-muted-foreground flex items-center gap-1.5 text-[0.625rem] tracking-wide uppercase">
            {faviconUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={faviconUrl} alt="" className="size-3.5 rounded-sm object-cover" />
            )}
            <span className="truncate">{host || " "}</span>
          </div>
          <p className="line-clamp-2 text-sm font-semibold leading-snug">{title}</p>
          <p className="text-muted-foreground line-clamp-2 text-xs leading-snug">{description}</p>
        </div>
      </div>

      {slug && (
        <p className="text-muted-foreground truncate text-xs">
          {host ? `${host}/f/${slug}` : `/f/${slug}`}
        </p>
      )}
    </aside>
  );
}
