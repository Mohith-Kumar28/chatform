/**
 * What an API key is allowed to do.
 *
 * Until now `api_keys.scopes` held a hardcoded three-element array that nothing
 * ever read, while `requirePermission` short-circuited for any request carrying
 * a key — so every key had full organization authority on every route it could
 * reach. This module is the other half of removing that.
 *
 * The vocabulary is shaped like `permissions.ts`'s RBAC statement on purpose:
 * one mental model for "who may do what", whether the actor is a person or a
 * key. It is stored verbatim in `api_keys.permissions` as the plugin's
 * `Record<string, string[]>`.
 */

export const SCOPES = {
  form: ["read", "write", "publish"],
  response: ["read", "read_partial", "write", "delete", "export"],
  session: ["create", "write", "read"],
  webhook: ["read", "write"],
  file: ["read", "write"],
  analytics: ["read"],
  /**
   * Generating or editing a form document with a model.
   *
   * The one scope that spends money on every use — a generation bills the
   * organization's `ai_generations` and `ai_tokens` allowance — which is why it is
   * its own resource rather than folded into `form:write`. A key that authors forms
   * from documents it built itself should not silently be able to run the model
   * instead, and a caller who wants that should have to say so.
   */
  ai: ["generate"],
} as const;

export type ScopeResource = keyof typeof SCOPES;
export type Scopes = Record<string, string[]>;

export const SCOPE_RESOURCES = Object.keys(SCOPES) as ScopeResource[];

/** Every `resource:action` pair, for validating what a caller asked for. */
export const ALL_SCOPES: string[] = SCOPE_RESOURCES.flatMap((r) =>
  (SCOPES[r] as readonly string[]).map((a) => `${r}:${a}`),
);

/**
 * What a secret key gets when the caller does not say.
 *
 * Read and drive, not destroy: creating one from the dashboard should not hand
 * out the ability to delete responses or rewrite webhooks by default.
 */
export const SECRET_SCOPES: Scopes = {
  form: ["read"],
  response: ["read"],
  session: ["create", "write", "read"],
};

/**
 * What a key driving the MCP server needs.
 *
 * A named bundle rather than a wider `SECRET_SCOPES`, and that distinction is the
 * point. The default is narrow on purpose, so widening it to make MCP work would
 * hand write authority to every key anyone mints for any reason. Instead this is
 * offered as a preset at creation time: the same least-privilege model, with one
 * well-labelled shortcut for the case that needs more.
 *
 * `response:delete` and `response:read_partial` are deliberately absent — no
 * endpoint requires either (see `scopes.mdx`), and the MCP server refuses deletes
 * regardless of what a key holds.
 */
export const MCP_SCOPES: Scopes = {
  form: ["read", "write", "publish"],
  response: ["read", "write", "export"],
  session: ["create", "write", "read"],
  webhook: ["read", "write"],
  file: ["read"],
  analytics: ["read"],
};

/**
 * The presets the key-creation dialog offers.
 *
 * Served from `GET /api/keys/scopes` alongside the vocabulary, so the dashboard
 * renders what the API actually grants rather than keeping its own copy — the
 * existing scope grid already reads the vocabulary from there for the same reason.
 */
export const SCOPE_PRESETS: Record<string, Scopes> = {
  read_only: { form: ["read"], response: ["read"], analytics: ["read"] },
  default: SECRET_SCOPES,
  agent: MCP_SCOPES,
};

/**
 * The hard ceiling for a publishable key, not merely its default.
 *
 * A `pk_` key ships inside someone's page, so treat it as public: it may open a
 * session and answer questions — the things a respondent does anyway — and
 * nothing else. Because `response:*`, `webhook:*`, `file:read` and `analytics:*`
 * are simply absent, "publishable key on a secret-only route" needs no separate
 * rule; the scope check refuses it.
 */
export const PUBLISHABLE_SCOPES: Scopes = {
  form: ["read"],
  session: ["create", "write", "read"],
  file: ["write"],
};

/**
 * What a key minted before scopes existed could do.
 *
 * The migration writes this into every row whose `permissions` was NULL, and
 * verification substitutes it for anything still missing. Existing integrations
 * keep working; what they lose is only what the bypass granted by accident.
 */
export const LEGACY_SCOPES: Scopes = SECRET_SCOPES;

export function scopeAllows(scopes: Scopes, resource: string, action: string): boolean {
  return (scopes[resource] ?? []).includes(action);
}

/** Narrow a requested scope set to what this key type may ever hold. */
export function clampScopes(keyType: string, requested: Scopes | undefined): Scopes {
  const ceiling = keyType.startsWith("pk_") ? PUBLISHABLE_SCOPES : null;
  const base = requested ?? (ceiling ? PUBLISHABLE_SCOPES : SECRET_SCOPES);
  const out: Scopes = {};
  for (const [resource, actions] of Object.entries(base)) {
    if (!(resource in SCOPES)) continue;
    const known = SCOPES[resource as ScopeResource] as readonly string[];
    const allowed = actions.filter(
      (a) => known.includes(a) && (!ceiling || (ceiling[resource] ?? []).includes(a)),
    );
    if (allowed.length > 0) out[resource] = allowed;
  }
  return out;
}

/**
 * RBAC permission → key scope.
 *
 * Deny by default: a permission with no entry here can never be exercised by an
 * API key, which is why `apikey.*`, `billing.*`, `workspace.*`, `domain.*`,
 * `audit.*` and the organization plugin's own statements are deliberately
 * absent. A key must not be able to mint keys or change a plan.
 *
 * `ai.generate` is mapped, and was not: that absence is the whole reason AI form
 * generation was unreachable with a key. It was never a decision that the API
 * should not offer it — deny-by-default simply caught a capability nobody had got
 * round to deciding about, and the dashboard was the only caller.
 */
export const PERMISSION_TO_SCOPE: Record<string, [ScopeResource, string]> = {
  "ai.generate": ["ai", "generate"],
  "form.read": ["form", "read"],
  "form.create": ["form", "write"],
  "form.update": ["form", "write"],
  "form.delete": ["form", "write"],
  "form.publish": ["form", "publish"],
  "submission.read": ["response", "read"],
  "submission.read_partial": ["response", "read_partial"],
  "submission.export": ["response", "export"],
  "submission.delete": ["response", "delete"],
  "analytics.read": ["analytics", "read"],
  "analytics.read_advanced": ["analytics", "read"],
  "webhook.read": ["webhook", "read"],
  "webhook.create": ["webhook", "write"],
  "webhook.update": ["webhook", "write"],
  "webhook.delete": ["webhook", "write"],
};
