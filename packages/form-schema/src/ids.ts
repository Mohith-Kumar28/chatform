import { z } from "zod";

export const RefString = z
  .string()
  .regex(/^[a-z][a-z0-9_]{1,40}$/, "ref must be lowercase snake_case, 2-41 chars");
export type RefString = z.infer<typeof RefString>;

export const NanoId = z.string().min(6).max(32);
export type NanoId = z.infer<typeof NanoId>;

export const VariableName = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,40}$/);
export type VariableName = z.infer<typeof VariableName>;

export const HiddenFieldName = z
  .string()
  .regex(/^[a-zA-Z_][a-zA-Z0-9_.-]{0,60}$/);
export type HiddenFieldName = z.infer<typeof HiddenFieldName>;

/** Prefixed public ids, e.g. `frm_abc123`, `opt_abc123`. */
export const PrefixedId = (prefix: string) =>
  z.string().regex(new RegExp(`^${prefix}_[a-z0-9]{6,24}$`));
