import {
  SETTINGS_REGISTRY,
  SETTING_SECTION_LABELS,
  applySettingOps,
  type FormDoc,
  type ParseContext,
  type SettingOp,
} from "@repo/form-schema";
import { can, minPlanFor, PLANS, type Entitlements, type FeatureKey } from "@repo/entitlements";

/**
 * A form's settings by key, for callers that are not the builder: the developer
 * API and, through it, any MCP client.
 *
 * The same registry the builder chat uses (`settings-registry.ts`), so an agent
 * in Claude or Cursor changes "the interviewer's tone" by the same key, with
 * the same checks, as the author typing into the AI bar. Nothing here is a
 * model: the caller is one already, and this is the deterministic half.
 */

export interface SettingView {
  key: string;
  section: string;
  sectionLabel: string;
  label: string;
  where: string;
  format: string;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  maxLength?: number;
  maxItems?: number;
  clearable?: boolean;
  hint?: string;
  value: unknown;
  /** Set when every non-default value needs a plan this organization is not on. */
  locked?: { feature: string; plan: string };
}

/** Every setting with its current value, and which ones the plan does not include. */
export function describeSettings(doc: FormDoc, ent: Entitlements): SettingView[] {
  return SETTINGS_REGISTRY.map((d) => {
    const feature = d.feature && !can(ent, d.feature as FeatureKey) ? d.feature : null;
    return {
      key: d.key,
      section: d.section,
      sectionLabel: SETTING_SECTION_LABELS[d.section],
      label: d.label,
      where: d.where,
      format: d.format,
      ...(d.options ? { options: d.options.map((o) => ({ ...o })) } : {}),
      ...(d.min !== undefined ? { min: d.min } : {}),
      ...(d.max !== undefined ? { max: d.max } : {}),
      ...(d.maxLength !== undefined ? { maxLength: d.maxLength } : {}),
      ...(d.maxItems !== undefined ? { maxItems: d.maxItems } : {}),
      ...(d.clearable ? { clearable: true } : {}),
      ...(d.hint ? { hint: d.hint } : {}),
      value: d.get(doc) ?? null,
      ...(feature ? { locked: { feature, plan: PLANS[minPlanFor(feature as FeatureKey)].name } } : {}),
    };
  });
}

/**
 * Changes by key, onto a copy of `doc`. A value that does not parse is
 * refused with the reason; a change the plan does not include is reported as
 * locked and not applied, exactly as on the builder's proposal card.
 */
export function patchSettings(doc: FormDoc, changes: readonly SettingOp[], ent: Entitlements, parse: ParseContext) {
  return applySettingOps(doc, changes, { allowed: (f) => can(ent, f as FeatureKey), parse });
}
