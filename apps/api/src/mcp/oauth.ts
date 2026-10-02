/**
 * OAuth for `/mcp`: "paste a link, sign in in the browser, done".
 *
 * Claude, ChatGPT, Cursor, Codex and the rest all connect a remote MCP server
 * the same way: they call it, get a 401 naming our metadata, register themselves
 * (Client ID Metadata Document, or dynamic registration for older clients), send
 * the person's browser to `/oauth/authorize`, and swap the code for a token. The
 * protocol half of that is `@cloudflare/workers-oauth-provider`; the half that is
 * ours is the consent page and what a grant turns into.
 *
 * What a grant turns into is an ordinary `sk_live` key, minted when the person
 * clicks Allow and carried encrypted inside the grant's props. The token never
 * reaches the API itself: `/mcp` sees the key, exactly as it would from a
 * developer who pasted one, so scopes, the plan gate, the meter and the burst
 * limits are the ones `/v1` already enforces rather than a second copy of them.
 * Disconnecting is revoking that key (and the grant with it).
 *
 * Pasted keys keep working on the same URL: a bearer that looks like one of ours
 * (`sk_…`, `pk_…`) is passed through untouched, and `x-api-key` never reaches the
 * provider at all.
 */
import { OAuthProvider, getOAuthApi, type OAuthHelpers, type OAuthProviderOptions } from "@cloudflare/workers-oauth-provider";
import type { Bindings } from "../env.js";

/** What a grant carries to `/mcp`. Encrypted at rest by the provider. */
export interface ConnectorProps {
  /** The `sk_live` key minted for this connection. */
  apiKey: string;
  keyId: string;
  orgId: string;
  userId: string;
  /** Set for a pasted key rather than an OAuth grant: forward the request as it came. */
  external?: true;
}

/** Everything the authorization server can grant. `offline_access` is what earns a refresh token. */
export const CONNECTOR_SCOPE = "chatform";
const SCOPES_SUPPORTED = [CONNECTOR_SCOPE, "offline_access"];

export const AUTHORIZE_PATH = "/oauth/authorize";

/** The URL a person pastes into their AI app, and the token audience. */
export function mcpResourceUrl(env: Pick<Bindings, "APP_ORIGIN">): string {
  return `${env.APP_ORIGIN.replace(/\/$/, "")}/mcp`;
}

type Fetcher = (request: Request, env: Bindings, ctx: ExecutionContext) => Response | Promise<Response>;

function options(env: Bindings, app: Fetcher): OAuthProviderOptions<Bindings> {
  const origin = env.APP_ORIGIN.replace(/\/$/, "");
  return {
    apiRoute: "/mcp",
    apiHandler: {
      fetch(request, env, ctx) {
        const props = (ctx as unknown as { props: ConnectorProps }).props;
        if (props.external) return app(request, env, ctx);
        /**
         * Rebuilt rather than forwarded: the bearer becomes the grant's key, and
         * `Origin` goes. `requireApiKey` refuses a secret key arriving with one
         * (it means the key is sitting in a web page), but this key was minted
         * server-side and has never been anywhere near a browser; a browser-based
         * MCP client presenting a token for it is the normal case.
         */
        const headers = new Headers(request.headers);
        headers.set("authorization", `Bearer ${props.apiKey}`);
        headers.delete("x-api-key");
        headers.delete("origin");
        return app(new Request(request, { headers }), env, ctx);
      },
    },
    defaultHandler: { fetch: app as never },
    authorizeEndpoint: `${origin}${AUTHORIZE_PATH}`,
    tokenEndpoint: `${origin}/oauth/token`,
    clientRegistrationEndpoint: `${origin}/oauth/register`,
    scopesSupported: SCOPES_SUPPORTED,
    resourceMetadata: {
      resource: mcpResourceUrl(env),
      authorization_servers: [origin],
      resource_name: "Chatform",
    },
    /**
     * Claude prefers this (its client id is a URL it publishes) and ChatGPT
     * accepts it; dynamic registration stays on for every client that predates it.
     */
    clientIdMetadataDocumentEnabled: true,
    /**
     * A connected assistant should stay connected. Access tokens are short; the
     * refresh token lives a year but lapses after two months of nobody using it,
     * which is when asking someone to sign in again is reasonable.
     */
    accessTokenTTL: 3600,
    refreshTokenTTL: 365 * 86_400,
    refreshTokenIdleTTL: 60 * 86_400,
    /**
     * A pasted key on the OAuth URL. Only our own key shapes are accepted here,
     * and nothing is verified: `/mcp`'s own `requireApiKey` does that, with the
     * error messages integrators already know.
     */
    resolveExternalToken: async ({ token, env }) =>
      /^(sk|pk)_(live|test)_/.test(token)
        ? { props: { apiKey: token, external: true }, audience: mcpResourceUrl(env) }
        : null,
  };
}

let cached: { origin: string; provider: OAuthProvider<Bindings> } | null = null;

/**
 * Built on first use, not at module scope: the issuer and the resource are this
 * deployment's own origin, which is only known once a request brings `env` —
 * and Workers refuse to boot a module that does real work at the top level.
 */
function providerFor(env: Bindings, app: Fetcher): OAuthProvider<Bindings> {
  if (cached?.origin !== env.APP_ORIGIN) {
    cached = { origin: env.APP_ORIGIN, provider: new OAuthProvider(options(env, app)) };
  }
  return cached.provider;
}

/** The provider's helpers (parse, complete, revoke) for a route that is not dispatched through it. */
export function oauthApi(env: Bindings): OAuthHelpers {
  return getOAuthApi(options(env, () => new Response(null, { status: 404 })), env);
}

/** The paths the provider owns or guards. Everything else goes straight to the app. */
function isOAuthPath(request: Request): boolean {
  const { pathname } = new URL(request.url);
  if (pathname === "/mcp" || pathname.startsWith("/mcp/")) {
    // A preflight carries no credential, and Hono's CORS already answers it.
    if (request.method === "OPTIONS") return false;
    // A key in `x-api-key` is the pre-OAuth way in; the provider only reads `Authorization`.
    if (!request.headers.get("authorization") && request.headers.get("x-api-key")) return false;
    return true;
  }
  return pathname.startsWith("/.well-known/oauth-") || (pathname.startsWith("/oauth/") && pathname !== AUTHORIZE_PATH);
}

/** The worker's `fetch`: OAuth paths through the provider, the rest to the app. */
export function handleRequest(app: Fetcher, request: Request, env: Bindings, ctx: ExecutionContext): Promise<Response> {
  if (!isOAuthPath(request)) return Promise.resolve(app(request, env, ctx));
  return providerFor(env, app).fetch(request, env, ctx);
}
