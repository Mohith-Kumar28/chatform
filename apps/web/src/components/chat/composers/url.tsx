"use client";

import { useState } from "react";
import { Globe, Lock } from "lucide-react";

type Scheme = "https" | "http";

/**
 * The message box, when the question is asking for a website.
 *
 * The phone field's shell with the scheme taken out of the typing: the prefix
 * reads `https://`, and whatever scheme is typed or pasted is lifted out of the
 * box and into the prefix, so `http://acme.com` pasted in shows `http://` on
 * the left and `acme.com` on the right. Tapping the prefix switches between the
 * two, unless the question accepts https only, in which case it is fixed and a
 * pasted `http://` is upgraded.
 *
 * The composer holds the full URL, scheme included, or "" while there is no
 * address to send.
 */
export function UrlInput({
  value,
  onChange,
  onSubmit,
  httpsOnly,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  httpsOnly?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const parsed = splitUrl(value);
  // Kept locally because an empty box has no value to carry the scheme in.
  const [chosen, setChosen] = useState<Scheme>("https");
  const scheme: Scheme = httpsOnly ? "https" : (parsed.scheme ?? chosen);

  function emit(nextScheme: Scheme, rest: string) {
    onChange(rest.trim() ? `${nextScheme}://${rest}` : "");
  }

  function onType(raw: string) {
    const next = splitUrl(raw);
    const nextScheme: Scheme = httpsOnly ? "https" : (next.scheme ?? scheme);
    if (next.scheme) setChosen(nextScheme);
    emit(nextScheme, next.rest);
  }

  function toggle() {
    const nextScheme: Scheme = scheme === "https" ? "http" : "https";
    setChosen(nextScheme);
    emit(nextScheme, parsed.rest);
  }

  const secure = scheme === "https";
  const Icon = secure ? Lock : Globe;
  const prefix = (
    <>
      <Icon className="size-3.5 opacity-60" aria-hidden />
      <span className="opacity-70">{scheme}://</span>
    </>
  );

  return (
    <div className="flex h-11 w-full items-stretch overflow-hidden rounded-[var(--cf-radius-card)] border border-[var(--cf-chip-border)] bg-[var(--cf-composer-bg)] text-[0.9375rem] transition-colors focus-within:border-[var(--cf-accent)]">
      {httpsOnly ? (
        <span className="flex shrink-0 items-center gap-1.5 pr-2.5 pl-3.5">{prefix}</span>
      ) : (
        <button
          type="button"
          onClick={toggle}
          aria-label={`Scheme: ${scheme}. Switch to ${secure ? "http" : "https"}`}
          className="flex shrink-0 items-center gap-1.5 pr-2.5 pl-3.5 transition-colors hover:bg-[color-mix(in_oklch,var(--cf-accent)_8%,transparent)] focus-visible:bg-[color-mix(in_oklch,var(--cf-accent)_12%,transparent)] focus-visible:outline-none"
        >
          {prefix}
        </button>
      )}
      <span aria-hidden className="my-2 w-px shrink-0 bg-[var(--cf-chip-border)]" />
      <input
        value={parsed.rest}
        onChange={(e) => onType(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter" || !onSubmit) return;
          e.preventDefault();
          onSubmit();
        }}
        type="url"
        inputMode="url"
        autoComplete="url"
        name="url"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="send"
        autoFocus={autoFocus}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent px-3 outline-none placeholder:text-[var(--cf-placeholder)] placeholder:opacity-100"
      />
    </div>
  );
}

/**
 * The scheme, if one was written, and everything after it.
 *
 * Repeated because a paste onto a half-typed `https://` gives
 * `https://https://acme.com`; the last scheme written is the one meant. Leading
 * slashes go too, so typing `http:` then `//` lands in the prefix rather than
 * in the box.
 */
export function splitUrl(raw: string): { scheme: Scheme | null; rest: string } {
  let rest = raw.trimStart();
  let scheme: Scheme | null = null;
  for (let m = rest.match(/^(https?):\/*/i); m; m = rest.match(/^(https?):\/*/i)) {
    scheme = m[1]!.toLowerCase() as Scheme;
    rest = rest.slice(m[0].length);
  }
  return { scheme, rest: rest.replace(/^\/+/, "") };
}
