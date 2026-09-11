"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  absorbInternational,
  asPhoneCountry,
  composePhone,
  defaultPhoneCountry,
  FALLBACK_COUNTRY,
  dialOf,
  digitsAfterEdit,
  flagOf,
  looksInternational,
  phoneCountries,
  phoneProblem,
  type PhoneCountry,
  splitPhone,
  type CountryCode,
} from "./phone-value";

/**
 * The message box, when the question is asking for a phone number.
 *
 * Same pill as every other question — same height, same radius, same border and
 * focus colour, sitting in the same `SendRow` — with the country taken out of
 * the typing. The respondent picks a flag and writes the number the way they
 * would say it out loud; the field hands up E.164. Nobody has to know what
 * E.164 is, which is the whole point: asking someone to "include the country
 * code" is asking them to do a conversion on our behalf, and then refusing
 * their answer when they don't.
 *
 * The picker is a real `<select>`, drawn invisibly over the flag and dialling
 * code we paint ourselves. That buys the native wheel on a phone, the native
 * type-to-search on a desktop ("ind" → India), keyboard access and the
 * accessibility tree, for none of the z-index, focus-trap and overflow
 * behaviour a custom popover in a fixed bottom bar would cost. The visible part
 * is ours, so the closed state can read `🇮🇳 +91` while the list reads
 * `India (+91)`.
 */

export function PhoneInput({
  value,
  onChange,
  onSubmit,
  countryHint,
  placeholder,
  autoFocus,
}: {
  /** E.164, owned by the composer. Empty until there is something to send. */
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  /** The author's `countryHint`, where they set one. */
  countryHint?: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const numberRef = useRef<HTMLInputElement>(null);

  /**
   * Two halves on screen, one string out.
   *
   * `mirror` is the last value this field emitted, and what distinguishes the
   * composer echoing us back from the composer handing us something new — a
   * saved number picked from the suggestions, or a different question
   * altogether. Only the latter may overwrite what is being typed.
   */
  const opening = useOpeningCountry(countryHint);
  const options = useCountryOptions(opening);
  const [state, setState] = useState(() => ({
    ...splitPhone(value, opening),
    mirror: value,
    opened: opening,
  }));
  if (value !== state.mirror) {
    setState({ ...splitPhone(value, state.country), mirror: value, opened: state.opened });
  } else if (opening !== state.opened) {
    // Detection landed after hydration (see `useOpeningCountry`). It may move
    // the flag over an empty box and never over a number already being typed.
    setState((s) =>
      s.typed ? { ...s, opened: opening } : { ...splitPhone(value, opening), mirror: value, opened: opening },
    );
  }
  const { country, typed } = state;

  /*
    Said on the way out of the box, not on the way through it — the same rule a
    `field_group` cell follows. Every number is too short while it is being
    typed, so a length complaint during typing is wrong for every keystroke but
    the last one.
  */
  const [touched, setTouched] = useState(false);
  const problem = touched ? phoneProblem(value, country) : null;

  function emit(nextCountry: CountryCode, nextTyped: string) {
    const composed = composePhone(nextCountry, nextTyped);
    setState((s) => ({ ...s, country: nextCountry, typed: composed.display, mirror: composed.value }));
    onChange(composed.value);
  }

  function onType(raw: string) {
    setTouched(false);

    // A paste, an autofill, or somebody typing the `+` out of habit. The picker
    // moves to match rather than leaving two prefixes in one field.
    const absorbed = absorbInternational(raw, country);
    if (absorbed) {
      emit(absorbed.country, absorbed.typed);
      return;
    }
    /*
      A `+` with too little after it to name a country yet. Held verbatim: the
      alternative is stripping the character they just typed, and a box that
      refuses `+` is the box this field exists to replace. There is nothing
      sendable in it either way, so the value goes out empty.
    */
    if (looksInternational(raw)) {
      setState((s) => ({ ...s, country, typed: raw.trimStart(), mirror: "" }));
      onChange("");
      return;
    }

    emit(country, digitsAfterEdit(typed, raw));
  }

  function pickCountry(next: CountryCode) {
    // A half-typed `+44` means nothing under a new flag; national digits do.
    emit(next, looksInternational(typed) ? "" : typed);
    // Back to the number, so picking a country does not cost a tap to resume.
    numberRef.current?.focus();
  }

  return (
    <div className="space-y-1.5">
      {problem && <p className="px-1 text-sm opacity-70">{problem}</p>}
      <div
        className={cn(
          // The plain composer's shell, to the pixel: see `TextInput`.
          "flex h-11 w-full items-stretch overflow-hidden rounded-2xl border bg-[var(--cf-composer-bg)] text-[0.9375rem] transition-colors",
          problem
            ? "border-[var(--cf-warning)] focus-within:border-[var(--cf-warning)]"
            : "border-[var(--cf-chip-border)] focus-within:border-[var(--cf-accent)]",
        )}
      >
        <div
          className={cn(
            "relative flex shrink-0 items-center gap-1.5 pr-2.5 pl-3.5 transition-colors",
            // Keyboard focus on the picker has to show, and the shell's border
            // cannot say which half of the field has it.
            "has-[select:focus-visible]:bg-[color-mix(in_oklch,var(--cf-accent)_12%,transparent)]",
          )}
        >
          <span aria-hidden className="text-base leading-none">
            {flagOf(country)}
          </span>
          <span className="tabular-nums">+{dialOf(country)}</span>
          <ChevronDown className="size-3.5 opacity-45" aria-hidden />
          {/*
            The control itself, over the three spans above. `text-base` because
            iOS zooms the page when a control under 16px takes focus, and this
            one is invisible — the zoom would be the only thing the respondent
            saw happen.
          */}
          <select
            aria-label="Country calling code"
            value={country}
            onChange={(e) => pickCountry(e.target.value as CountryCode)}
            className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent text-base opacity-0"
          >
            {options.map((c) => (
              <option key={c.code} value={c.code}>
                {`${c.name} (+${c.dial})`}
              </option>
            ))}
          </select>
        </div>

        {/* Not a border on the picker: a divider that stops short of the pill's
            edges reads as one field split in two rather than two controls. */}
        <span aria-hidden className="my-2 w-px shrink-0 bg-[var(--cf-chip-border)]" />

        <input
          ref={numberRef}
          value={typed}
          onChange={(e) => onType(e.target.value)}
          onBlur={() => setTouched(true)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            // Reveals why nothing happened when the number is not sendable yet;
            // the composer refuses it either way.
            setTouched(true);
            onSubmit();
          }}
          type="tel"
          inputMode="tel"
          /* The browser fills a whole international number here, `+` and all,
             and `onType` absorbs it into both halves. */
          autoComplete="tel"
          name="tel"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="send"
          autoFocus={autoFocus}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent px-3 outline-none placeholder:opacity-50"
        />
      </div>
    </div>
  );
}

/**
 * The flag the picker opens on, without breaking hydration to get it.
 *
 * Where the respondent is can only be read in a browser, so a field rendered on
 * the server and hydrated in one would draw two different flags and React would
 * throw out the tree. `useSyncExternalStore` is the way to say that honestly:
 * the server snapshot is what anyone can compute, the client snapshot is what
 * this device knows, and the swap between them is a re-render rather than a
 * mismatch. Mounted fresh in the chat runtime — which is every respondent —
 * there is no server snapshot at all and the detected country is the first
 * thing painted.
 */
const NEVER_CHANGES = () => () => {};
let detected: CountryCode | null = null;

function useOpeningCountry(hint?: string): CountryCode {
  return useSyncExternalStore(
    NEVER_CHANGES,
    () => asPhoneCountry(hint) ?? (detected ??= defaultPhoneCountry()),
    () => asPhoneCountry(hint) ?? FALLBACK_COUNTRY,
  );
}

/**
 * The list itself, for the same reason and by the same mechanism.
 *
 * `Intl.DisplayNames` is not one list: Node's full ICU calls the Falklands
 * "Falkland Islands (Islas Malvinas)" and a browser calls them "Falkland
 * Islands", so rendering 245 names on a server and 245 on a client was a
 * hydration mismatch in its own right. The server renders the one option the
 * select is on — which is all a closed select shows anyway — and the rest
 * arrive with the client snapshot.
 */
function useCountryOptions(current: CountryCode): PhoneCountry[] {
  return useSyncExternalStore(NEVER_CHANGES, phoneCountries, () => serverOptions(current));
}

/*
  Held rather than rebuilt, because a snapshot that is a new array every time it
  is read is one React treats as a store changing during render.
*/
let onlyCurrent: PhoneCountry[] = [];
function serverOptions(current: CountryCode): PhoneCountry[] {
  if (onlyCurrent[0]?.code !== current) {
    onlyCurrent = [{ code: current, dial: dialOf(current), name: current, flag: flagOf(current) }];
  }
  return onlyCurrent;
}
