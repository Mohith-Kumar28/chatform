import type { Block } from "../blocks";
import type { AnswerValue } from "../answers";

/**
 * Every reason an answer can be refused.
 *
 * A closed union rather than a loose string, because these codes are published:
 * they are what an API caller branches on and what the block reference
 * documents. Typing `fail()` with it turns a typo or a rename into a compile
 * error instead of a silently undocumented code.
 */
export const VALIDATION_CODES = [
  "required",
  "type",
  "too_short",
  "too_long",
  "pattern",
  "invalid_email",
  "freemail",
  "invalid_phone",
  "invalid_url",
  "not_integer",
  "too_small",
  "too_large",
  "invalid_date",
  "invalid_time",
  "time_out_of_range",
  "past_date",
  "too_early",
  "too_late",
  "invalid_option",
  "too_few",
  "too_many",
  "out_of_range",
  "incomplete_ranking",
  "invalid_ranking",
  "invalid_row",
  "invalid_column",
  "incomplete_matrix",
  "too_many_files",
  "file_too_large",
  "name_required",
  "payment_pending",
  "incomplete",
  "consent_required",
  "unsupported",
] as const;

export type ValidationCode = (typeof VALIDATION_CODES)[number];

export interface ValidationResult {
  ok: boolean;
  /** Machine-readable code for the agent to phrase a conversational retry. */
  code?: ValidationCode;
  /** Short human hint (shown conversationally). */
  hint?: string;
  /** Normalized/canonicalized value to store. */
  value?: AnswerValue;
}

const ok = (value?: AnswerValue): ValidationResult => ({ ok: true, value });
const fail = (code: ValidationCode, hint: string): ValidationResult => ({ ok: false, code, hint });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const FREEMAIL = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "proton.me", "aol.com", "live.com"];
const URL_RE = /^https?:\/\/[^\s]+\.[^\s]+$/i;
const E164_RE = /^\+[1-9]\d{6,14}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function isFileDescriptorArray(v: unknown): v is { fileId: string; filename: string; mime: string; size: number; r2Key: string }[] {
  return (
    Array.isArray(v) &&
    v.length > 0 &&
    v.every(
      (f) =>
        typeof f === "object" &&
        f !== null &&
        typeof (f as { fileId?: unknown }).fileId === "string" &&
        typeof (f as { r2Key?: unknown }).r2Key === "string",
    )
  );
}

/**
 * Deterministic per-type validation of a raw answer value.
 * `raw` comes from structured client actions (already typed) or from
 * LLM-extracted values for free text. Returns canonical value on success.
 */
export function validateAnswer(block: Block, raw: unknown): ValidationResult {
  if (raw === undefined || raw === null || raw === "") {
    return block.required ? fail("required", "This question needs an answer.") : ok(undefined);
  }

  switch (block.type) {
    case "welcome":
    case "statement":
      return ok(undefined);

    case "short_text": {
      if (typeof raw !== "string") return fail("type", "Please answer with text.");
      const v = raw.trim();
      if (v.length < block.minLength) return fail("too_short", `Answer must be at least ${block.minLength} characters.`);
      if (v.length > block.maxLength) return fail("too_long", `Answer must be at most ${block.maxLength} characters.`);
      if (block.pattern) {
        try {
          if (!new RegExp(block.pattern).test(v)) return fail("pattern", "That doesn't match the expected format.");
        } catch {
          // invalid pattern in schema — skip
        }
      }
      return ok(v);
    }

    case "long_text": {
      if (typeof raw !== "string") return fail("type", "Please answer with text.");
      const v = raw.trim();
      if (v.length < block.minLength) return fail("too_short", `Answer must be at least ${block.minLength} characters.`);
      if (v.length > block.maxLength) return fail("too_long", `Answer must be at most ${block.maxLength} characters.`);
      return ok(v);
    }

    case "email": {
      if (typeof raw !== "string") return fail("type", "Please enter an email address.");
      const v = raw.trim().toLowerCase();
      if (!EMAIL_RE.test(v)) return fail("invalid_email", "That doesn't look like a valid email address.");
      if (block.businessOnly && FREEMAIL.includes(v.split("@")[1] ?? "")) {
        return fail("freemail", "Please use your work email address.");
      }
      return ok(v);
    }

    case "phone": {
      if (typeof raw !== "string") return fail("type", "Please enter a phone number.");
      let v = raw.trim().replace(/[\s\-().]/g, "");
      if (/^\d+$/.test(v) && block.countryHint) v = `+${countryDial(block.countryHint)}${v}`;
      if (!E164_RE.test(v)) return fail("invalid_phone", "Please enter a valid phone number with country code.");
      return ok(v);
    }

    case "url": {
      if (typeof raw !== "string") return fail("type", "Please enter a URL.");
      let v = raw.trim();
      if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
      if (!URL_RE.test(v)) return fail("invalid_url", "That doesn't look like a valid URL.");
      return ok(v);
    }

    case "number": {
      const n = typeof raw === "string" ? Number(raw.trim().replace(/,/g, "")) : raw;
      if (typeof n !== "number" || !Number.isFinite(n)) return fail("type", "Please enter a number.");
      if (block.integerOnly && !Number.isInteger(n)) return fail("not_integer", "Please enter a whole number.");
      if (block.min !== undefined && n < block.min) return fail("too_small", `Please enter a number ≥ ${block.min}.`);
      if (block.max !== undefined && n > block.max) return fail("too_large", `Please enter a number ≤ ${block.max}.`);
      return ok(n);
    }

    case "date": {
      if (typeof raw !== "string") return fail("type", "Please provide a date.");
      const v = raw.trim();
      // `includeTime` turns the answer into an appointment: `YYYY-MM-DDTHH:mm`.
      // The date half is validated against the same bounds either way, so a
      // block that gains a time keeps every rule it already had.
      const [datePart = "", timePart] = v.split("T");
      if (!DATE_RE.test(datePart) || Number.isNaN(Date.parse(datePart))) {
        return fail("invalid_date", "Please provide a date in YYYY-MM-DD format.");
      }
      if (block.includeTime) {
        if (!timePart || !TIME_RE.test(timePart)) {
          return fail("invalid_time", "Please include a time as well, like 2026-01-31T14:30.");
        }
        if (timePart < block.timeMin || timePart > block.timeMax) {
          return fail("time_out_of_range", `Please pick a time between ${block.timeMin} and ${block.timeMax}.`);
        }
      } else if (timePart) {
        return fail("invalid_date", "Please provide a date in YYYY-MM-DD format.");
      }
      if (block.disablePast && Date.parse(datePart) < Date.now() - 86400000) {
        return fail("past_date", "Please pick a future date.");
      }
      if (block.min && datePart < block.min) return fail("too_early", `Date must be on or after ${block.min}.`);
      if (block.max && datePart > block.max) return fail("too_late", `Date must be on or before ${block.max}.`);
      return ok(block.includeTime ? `${datePart}T${timePart}` : datePart);
    }

    case "yes_no": {
      if (typeof raw === "boolean") return ok(raw);
      if (raw === "true" || raw === "yes" || raw === 1) return ok(true);
      if (raw === "false" || raw === "no" || raw === 0) return ok(false);
      return fail("type", "Please answer yes or no.");
    }

    case "single_select":
    case "dropdown": {
      const option = block.options.find((o) => o.id === raw || o.label.toLowerCase() === String(raw).toLowerCase());
      if (!option) return fail("invalid_option", "Please pick one of the available options.");
      return ok(option.id);
    }

    case "multi_select":
    case "picture_choice": {
      const arr = Array.isArray(raw) ? raw : [raw];
      if (arr.length === 0) return block.required ? fail("required", "Please pick at least one option.") : ok(undefined);
      const ids: string[] = [];
      for (const r of arr) {
        const option = block.options.find((o) => o.id === r || o.label.toLowerCase() === String(r).toLowerCase());
        if (!option) return fail("invalid_option", `"${String(r)}" is not one of the available options.`);
        if (!ids.includes(option.id)) ids.push(option.id);
      }
      if (block.type === "picture_choice") {
        if (!block.multiSelect && ids.length > 1) {
          return fail("too_many", "Please select only one option.");
        }
      } else {
        if (ids.length < block.minSelections) return fail("too_few", `Please select at least ${block.minSelections} option(s).`);
        if (ids.length > block.maxSelections) return fail("too_many", `Please select at most ${block.maxSelections} option(s).`);
      }
      return ok(ids);
    }

    case "rating":
    case "nps":
    case "opinion_scale": {
      const n = typeof raw === "string" ? Number(raw.trim()) : raw;
      if (typeof n !== "number" || !Number.isInteger(n)) return fail("type", "Please pick a number.");
      const min = block.type === "rating" ? 1 : block.type === "nps" ? 0 : block.startAt;
      const max = block.type === "rating" ? block.scale : block.type === "nps" ? 10 : block.startAt + block.steps - 1;
      if (n < (min ?? 0) || n > (max ?? 10)) return fail("out_of_range", `Please pick a number between ${min} and ${max}.`);
      return ok(n);
    }

    case "ranking": {
      if (!Array.isArray(raw) || raw.length !== block.items.length) {
        return fail("incomplete_ranking", "Please rank all the items.");
      }
      const itemIds = new Set(block.items.map((i) => i.id));
      const seen = new Set<string>();
      for (const r of raw) {
        if (typeof r !== "string" || !itemIds.has(r) || seen.has(r)) {
          return fail("invalid_ranking", "Each item can only be ranked once.");
        }
        seen.add(r);
      }
      return ok(raw);
    }

    case "matrix": {
      if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
        return fail("type", "Please answer each row.");
      }
      const rec = raw as Record<string, unknown>;
      const rowIds = new Set(block.rows.map((r) => r.id));
      const colIds = new Set(block.columns.map((c) => c.id));
      const out: Record<string, string | string[]> = {};
      for (const [rowId, val] of Object.entries(rec)) {
        if (!rowIds.has(rowId)) return fail("invalid_row", "Unknown row.");
        if (block.multiplePerRow) {
          const arr = Array.isArray(val) ? val : [val];
          if (!arr.every((c) => typeof c === "string" && colIds.has(c))) {
            return fail("invalid_column", "Unknown column selection.");
          }
          out[rowId] = arr as string[];
        } else {
          if (typeof val !== "string" || !colIds.has(val)) {
            return fail("invalid_column", "Unknown column selection.");
          }
          out[rowId] = val;
        }
      }
      if (block.required && Object.keys(out).length !== block.rows.length) {
        return fail("incomplete_matrix", "Please answer every row.");
      }
      return ok(out);
    }

    case "file_upload": {
      if (!isFileDescriptorArray(raw)) return fail("type", "Please upload a file.");
      if (raw.length > block.maxFiles) return fail("too_many_files", `You can upload up to ${block.maxFiles} file(s).`);
      for (const f of raw) {
        if (f.size > block.maxSizeMB * 1024 * 1024) {
          return fail("file_too_large", `"${f.filename}" exceeds the ${block.maxSizeMB}MB limit.`);
        }
      }
      return ok(raw);
    }

    case "signature": {
      if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
        return fail("type", "Please provide a signature.");
      }
      const sig = raw as { fileId?: unknown; r2Key?: unknown; signedName?: unknown };
      if (typeof sig.fileId !== "string" || typeof sig.r2Key !== "string") {
        return fail("type", "Please provide a signature.");
      }
      if (block.drawnNameRequired && typeof sig.signedName !== "string") {
        return fail("name_required", "Please type your name to sign.");
      }
      return ok(raw as AnswerValue);
    }

    case "payment": {
      if (typeof raw !== "object" || raw === null) return fail("type", "Payment required.");
      const p = raw as {
        status?: unknown;
        method?: unknown;
        verified?: unknown;
        reference?: unknown;
        amount?: unknown;
        paymentId?: unknown;
      };
      if (p.status !== "paid" && p.status !== "pending") {
        return fail("payment_pending", "Payment has not been completed yet.");
      }
      return ok({
        status: p.status,
        method: p.method === "upi" || p.method === "link" ? p.method : undefined,
        // Hardcoded, not read from the payload: the respondent's browser is
        // the only thing that ever sets this, so trusting it would let anyone
        // mark their own payment confirmed. Nothing in this flow talks to a
        // gateway, so nothing here can be verified.
        verified: false,
        reference: typeof p.reference === "string" ? p.reference.slice(0, 40) : undefined,
        paymentId: typeof p.paymentId === "string" ? p.paymentId : undefined,
        amount: typeof p.amount === "number" ? p.amount : undefined,
        currency: block.currency,
      });
    }

    case "scheduling": {
      if (typeof raw !== "object" || raw === null) return fail("type", "Please book a time slot.");
      const s = raw as { provider?: unknown; url?: unknown; slotIso?: unknown; confirmedAt?: unknown };
      if (typeof s.provider !== "string" || typeof s.url !== "string") {
        return fail("type", "Please book a time slot.");
      }
      return ok({
        provider: s.provider,
        url: s.url,
        slotIso: s.slotIso as string | undefined,
        confirmedAt: s.confirmedAt as number | undefined,
      });
    }

    case "contact_info":
    case "address": {
      if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
        return fail("type", "Please fill in the details.");
      }
      const rec = raw as Record<string, unknown>;
      const out: Record<string, string> = {};
      for (const field of block.fields) {
        const v = rec[field];
        if (v === undefined || v === null || String(v).trim() === "") {
          if (block.required) return fail("incomplete", `Please provide ${field.replaceAll("_", " ")}.`);
          continue;
        }
        out[field] = String(v).trim();
      }
      if (block.type === "contact_info" && out.email !== undefined) {
        if (!EMAIL_RE.test(out.email)) return fail("invalid_email", "That doesn't look like a valid email address.");
      }
      return ok(out);
    }

    case "legal_consent": {
      if (raw !== true && raw !== "true") return fail("consent_required", "Please accept to continue.");
      return ok({
        accepted: true,
        textSha256: sha256Hex(block.consentText),
        ts: Date.now(),
      });
    }

    default:
      return fail("unsupported", "Unsupported block type.");
  }
}

function countryDial(cc: string): string {
  const map: Record<string, string> = {
    US: "1", CA: "1", GB: "44", IN: "91", DE: "49", FR: "33", AU: "61", BR: "55",
    JP: "81", CN: "86", NL: "31", ES: "34", IT: "39", MX: "52", SG: "65", AE: "971",
  };
  return map[cc.toUpperCase()] ?? "1";
}

/** Minimal sync SHA-256 (FIPS-compliant implementations unavailable in all runtimes; use WebCrypto when async is OK). */
export function sha256Hex(input: string): string {
  // Synchronous fallback using a simple FNV-based hash is NOT acceptable for consent integrity;
  // runtime callers should prefer async webcrypto. This sync path uses a pure-JS SHA-256.
  const K = SHA256_K;
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const msg = new TextEncoder().encode(input);
  const bitLen = msg.length * 8;
  const padded = new Uint8Array((((msg.length + 8) >> 6) + 1) << 6);
  padded.set(msg);
  padded[msg.length] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 4, bitLen >>> 0, false);
  dv.setUint32(padded.length - 8, Math.floor(bitLen / 0x100000000), false);
  const w = new Uint32Array(64);
  for (let i = 0; i < padded.length; i += 64) {
    for (let t = 0; t < 16; t++) w[t] = dv.getUint32(i + t * 4, false);
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(w[t - 15]!, 7) ^ rotr(w[t - 15]!, 18) ^ (w[t - 15]! >>> 3);
      const s1 = rotr(w[t - 2]!, 17) ^ rotr(w[t - 2]!, 19) ^ (w[t - 2]! >>> 10);
      w[t] = (w[t - 16]! + s0 + w[t - 7]! + s1) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[t]! + w[t]!) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7].map((x) => x.toString(16).padStart(8, "0")).join("");
}

const rotr = (x: number, n: number) => ((x >>> n) | (x << (32 - n))) >>> 0;

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];
