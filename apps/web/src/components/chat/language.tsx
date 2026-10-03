"use client";

import { useEffect, useSyncExternalStore } from "react";
import { ChevronDown, Globe } from "lucide-react";
import { formLanguage, pickFormLanguage, type PublicFormConfig } from "@repo/form-schema";
import { LogoMark } from "@/components/brand/logo";
import { chatThemeVars } from "@/lib/chat-theme";
import { useSchemeTheme } from "@/lib/form-scheme";
import { useThemeFonts } from "@/lib/theme-fonts";
import { ChatBoot } from "./chat-boot";
import { useT } from "./i18n";
import { storageKey } from "./session-store";

/**
 * Which language a respondent reads a form in, and how they change it.
 *
 * A form offered in several languages asks once, the first time it is opened,
 * and remembers the answer on this device. After that the choice lives in the
 * header, top right, and can be changed part-way through.
 *
 * The page itself is rendered in one language, named by `?lang=`, because the
 * form's text comes from the server already translated. So choosing a language
 * is a navigation to the same form with a different `lang`, and the
 * conversation picks up where it was: answers are stored by option, not by
 * wording, so a response begun in one language carries on in another.
 */

const langKey = (slug: string) => `chatform:lang:${slug}`;

function storedLanguage(slug: string): string | null {
  try {
    return localStorage.getItem(langKey(slug));
  } catch {
    return null;
  }
}

const nativeName = (code: string) => formLanguage(code)?.native ?? code.toUpperCase();

/**
 * Remember a choice and show the form in it.
 *
 * A live conversation was opened in one language and keeps it, so a change of
 * language lets go of this browser's handle on it. The response itself is not
 * lost: the server recognises the device and the new conversation continues the
 * same draft.
 */
export function chooseLanguage(config: PublicFormConfig, code: string): void {
  const previous = storedLanguage(config.slug) ?? config.languages?.[0];
  try {
    localStorage.setItem(langKey(config.slug), code);
    if (previous !== code) localStorage.removeItem(storageKey(config.slug));
  } catch {
    // Blocked storage: the choice still holds for this page through the URL.
  }
  if (code === config.language) {
    window.dispatchEvent(new Event("chatform:language"));
    return;
  }
  const url = new URL(window.location.href);
  url.searchParams.set("lang", code);
  window.location.assign(url);
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("chatform:language", onChange);
  return () => window.removeEventListener("chatform:language", onChange);
}

/** What this device has chosen: a code, `""` for nothing yet, or null before the browser has been asked. */
function useStoredLanguage(slug: string): string | null {
  return useSyncExternalStore(
    subscribe,
    () => storedLanguage(slug) ?? "",
    () => null,
  );
}

/**
 * Holds the conversation back until there is a language to hold it in.
 *
 * With one language this is nothing at all. With several it is the prompt on a
 * first visit, a hop to the remembered language on a later one, and otherwise
 * the form.
 */
export function LanguageGate({
  config,
  explicit,
  children,
}: {
  config: PublicFormConfig;
  /** The link itself named a language, which is a choice as good as a tap. */
  explicit: boolean;
  children: React.ReactNode;
}) {
  const languages = config.languages ?? [];
  const stored = useStoredLanguage(config.slug);
  if (languages.length < 2) return <>{children}</>;

  // Before hydration nobody knows what this device chose. Hold the frame.
  if (stored === null) return <Waiting config={config} />;

  if (stored === config.language) return <>{children}</>;

  // The link named a language, or this device chose one last time. Either way
  // the choice is settled before the conversation mounts, because a stored
  // conversation in another language must be let go of first.
  if (explicit) return <Settle config={config} to={config.language ?? languages[0]!} />;
  if (stored && languages.includes(stored)) return <Settle config={config} to={stored} />;

  return <LanguagePrompt config={config} languages={languages} />;
}

/**
 * The form's own frame, for the screens that come before the conversation.
 *
 * The chat draws this around itself; these screens stand in for it, so they
 * wear the same colours, fonts and full-height viewport rather than appearing
 * as bare text on a white page.
 */
function Shell({ config, children }: { config: PublicFormConfig; children: React.ReactNode }) {
  const theme = useSchemeTheme(config.theme);
  useThemeFonts(config.theme);
  return (
    <div className="chat-surface cf-chat-viewport flex flex-col" style={chatThemeVars(theme, config.slug)}>
      {children}
    </div>
  );
}

function Waiting({ config }: { config: PublicFormConfig }) {
  return (
    <Shell config={config}>
      <ChatBoot title={config.title} logoUrl={config.theme.logoUrl} />
    </Shell>
  );
}

/** Applies a choice nobody needs to be asked about. An effect, so nothing navigates during render. */
function Settle({ config, to }: { config: PublicFormConfig; to: string }) {
  useEffect(() => {
    chooseLanguage(config, to);
  }, [config, to]);
  return <Waiting config={config} />;
}

/** The first-visit question. Each language is written in itself, so it can be found by someone who reads no other. */
function LanguagePrompt({ config, languages }: { config: PublicFormConfig; languages: string[] }) {
  const t = useT();
  // The browser's own language first, where the form has it.
  const likely = pickFormLanguage(languages, typeof navigator === "undefined" ? [] : (navigator.languages ?? [navigator.language]));
  const ordered = [likely, ...languages.filter((code) => code !== likely)];
  return (
    <Shell config={config}>
    <div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center px-6">
      {config.theme.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={config.theme.logoUrl} alt={config.title} className="size-12 rounded-2xl object-contain" />
      ) : (
        <span className="grid size-12 place-items-center rounded-2xl bg-[var(--cf-surface)] ring-1 ring-[var(--cf-bot-bubble-border)]">
          <LogoMark className="size-7" />
        </span>
      )}
      <p className="mt-5 max-w-sm text-center text-base font-semibold">{config.title}</p>
      <div role="group" aria-label={t("Language")} className="mt-6 flex w-full max-w-xs flex-col gap-2">
        {ordered.map((code) => (
          <button
            key={code}
            type="button"
            lang={code}
            onClick={() => chooseLanguage(config, code)}
            className="flex h-11 items-center justify-center rounded-[var(--cf-radius-control)] border border-[var(--cf-chip-border)] bg-[var(--cf-chip-bg)] px-4 text-[0.9375rem] font-medium transition-[transform,filter] hover:brightness-95 focus-visible:ring-2 focus-visible:ring-[var(--cf-accent)] focus-visible:outline-none active:scale-[0.98] motion-reduce:active:scale-100"
          >
            {nativeName(code)}
          </button>
        ))}
      </div>
    </div>
    </Shell>
  );
}

/**
 * The header's language control.
 *
 * A real `<select>` drawn invisibly over a label we paint, for the same reasons
 * the phone field's country picker is one: the native wheel on a phone,
 * type-to-find on a desktop, and the accessibility tree, with no popover to
 * position inside a sticky header.
 */
export function LanguageSwitcher({ config }: { config: PublicFormConfig }) {
  const t = useT();
  const languages = config.languages ?? [];
  if (languages.length < 2 || !config.language) return null;
  return (
    <div className="relative flex h-9 shrink-0 items-center gap-1.5 rounded-[var(--cf-radius-control)] border border-[var(--cf-chip-border)] bg-[var(--cf-chip-bg)] px-2.5 text-xs font-medium has-[select:focus-visible]:ring-2 has-[select:focus-visible]:ring-[var(--cf-accent)]">
      <Globe className="size-3.5 opacity-60" aria-hidden />
      <span lang={config.language}>{nativeName(config.language)}</span>
      <ChevronDown className="size-3 opacity-45" aria-hidden />
      <select
        aria-label={t("Language")}
        value={config.language}
        onChange={(e) => chooseLanguage(config, e.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent text-base opacity-0"
      >
        {languages.map((code) => (
          <option key={code} value={code} lang={code}>
            {nativeName(code)}
          </option>
        ))}
      </select>
    </div>
  );
}
