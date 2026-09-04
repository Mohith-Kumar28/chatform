import { apiKey } from "@better-auth/api-key";
import { PUBLISHABLE_SCOPES, SECRET_SCOPES } from "./scopes.js";

/**
 * The four API key configurations.
 *
 * Two axes: who may hold the key (secret, server-side — publishable, safe in a
 * browser) and which data it touches (live — test). A prefix is the only thing a
 * secret scanner, a log grep or a panicking developer can read at a glance, so
 * each combination gets its own.
 */

const MINUTE = 60_000;

/** Per-key sustained ceilings. Editable per key, clamped to the plan. */
export const RATE_LIMIT_DEFAULTS = {
  sk_live: 600,
  sk_test: 120,
  /** Browser traffic is one window per respondent, so it is legitimately burstier. */
  pk_live: 3000,
  pk_test: 120,
} as const;

export type KeyType = keyof typeof RATE_LIMIT_DEFAULTS;

export const KEY_TYPES = Object.keys(RATE_LIMIT_DEFAULTS) as KeyType[];

export function isPublishable(keyType: string): boolean {
  return keyType.startsWith("pk_");
}

export function environmentOf(keyType: string): "live" | "test" {
  return keyType.endsWith("_test") ? "test" : "live";
}

/** `sk_live_` for `sk_live`, and so on. */
export function prefixOf(keyType: KeyType): string {
  return `${keyType}_`;
}

/** The key type a stored `prefix` (or a whole key) belongs to. */
export function keyTypeOf(prefixOrKey: string | null | undefined): KeyType | null {
  if (!prefixOrKey) return null;
  return KEY_TYPES.find((t) => prefixOrKey.startsWith(`${t}_`)) ?? null;
}

const base = {
  /**
   * Keys belong to an organization, not to whoever happened to click "create".
   *
   * With `references: "user"` a key would die with its creator's account and be
   * invisible to their teammates — which is exactly the bug the old hand-rolled
   * table had, listing keys by `user_id` so nobody else could revoke one.
   */
  references: "organization",
  /**
   * D1 is the source of truth, and no `secondaryStorage` is configured anywhere
   * on this auth instance.
   *
   * That is not an oversight. Better Auth skips writing session rows to the
   * database when secondary storage is set, and `resolveOrgId` reads the active
   * organization from `sessions.active_organization_id` — so turning it on to
   * cache key lookups would silently fall every multi-org user back to their
   * oldest membership, reading and metering the wrong tenant. If key
   * verification ever needs a cache, `customStorage` is the knob: it applies to
   * api-keys alone and leaves sessions where they are.
   */
  storage: "database",
  /** Carries the origin allowlist, form pinning and who minted the key. */
  enableMetadata: true,
  /**
   * A leaked key must not be able to impersonate a person. Also moot here:
   * the plugin only mints sessions for user-owned keys, and ours are org-owned.
   */
  enableSessionForAPIKeys: false,
  requireName: true,
  minimumNameLength: 1,
  maximumNameLength: 64,
  defaultKeyLength: 48,
  /**
   * 14 characters, not the default 6.
   *
   * `start` is what the dashboard shows so a developer can tell two keys apart,
   * and the default length stores `"sk_liv"` — the prefix, truncated, identical
   * for every key of that type.
   */
  startingCharactersConfig: { shouldStore: true, charactersLength: 14 },
  /**
   * No default expiry.
   *
   * A production key that stops working on a date nobody remembers choosing is
   * worse than a long-lived one that can be revoked in a click — and expiry here
   * *deletes the row*, so there would not even be a record to explain the
   * outage. `minExpiresIn: 0` is what lets rotation offer a grace window
   * measured in hours rather than a minimum of a day.
   */
  keyExpiration: { defaultExpiresIn: null, disableCustomExpiresTime: false, minExpiresIn: 0, maxExpiresIn: 365 },
} as const;

export const apiKeyConfigs = [
  {
    ...base,
    /**
     * `"default"`, not `"sk_live"`, and both halves of that matter.
     *
     * Every entry of a config array must name a `configId` — the plugin refuses
     * to construct otherwise — and exactly one must be called `default` or
     * resolution throws `NO_DEFAULT_API_KEY_CONFIGURATION_FOUND` on the first
     * request. Naming this one `default` also means rows whose `config_id` is
     * NULL or `'default'` — every key minted before the plugin existed — match
     * it, so the migration never had to get that column right for an old key to
     * keep working.
     */
    configId: "default",
    defaultPrefix: "sk_live_",
    rateLimit: { enabled: true, timeWindow: MINUTE, maxRequests: RATE_LIMIT_DEFAULTS.sk_live },
    permissions: { defaultPermissions: SECRET_SCOPES },
  },
  {
    ...base,
    configId: "sk_test",
    defaultPrefix: "sk_test_",
    rateLimit: { enabled: true, timeWindow: MINUTE, maxRequests: RATE_LIMIT_DEFAULTS.sk_test },
    permissions: { defaultPermissions: SECRET_SCOPES },
  },
  {
    ...base,
    configId: "pk_live",
    defaultPrefix: "pk_live_",
    rateLimit: { enabled: true, timeWindow: MINUTE, maxRequests: RATE_LIMIT_DEFAULTS.pk_live },
    permissions: { defaultPermissions: PUBLISHABLE_SCOPES },
  },
  {
    ...base,
    configId: "pk_test",
    defaultPrefix: "pk_test_",
    rateLimit: { enabled: true, timeWindow: MINUTE, maxRequests: RATE_LIMIT_DEFAULTS.pk_test },
    permissions: { defaultPermissions: PUBLISHABLE_SCOPES },
  },
];

/**
 * `configId` as the plugin stores it.
 *
 * The default configuration persists `'default'`, not `'sk_live'`, so anything
 * addressing a key by config — `updateApiKey`, `deleteApiKey`, which compare it
 * — has to use this and not the display type.
 */
export function storedConfigId(keyType: KeyType): string {
  return keyType === "sk_live" ? "default" : keyType;
}

export const apiKeyPlugin = () => apiKey(apiKeyConfigs as never);
