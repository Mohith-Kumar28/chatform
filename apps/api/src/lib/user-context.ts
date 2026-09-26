import { z } from "zod";
import type { Bindings } from "../env.js";
import { captureRequestContext, ClientContextInput } from "./respondent-context.js";
import { canonicalZone } from "./quiet-hours.js";

/**
 * Where a customer signed up from, and every sign-in since.
 *
 * The same record a respondent's response carries (geo, network, device), built
 * by the same `captureRequestContext`, so the admin console reads a customer
 * exactly the way an author reads a respondent.
 *
 * The browser adds what the edge cannot see through the `x-chatform-client`
 * header (`apps/web/src/lib/auth/client-context.ts`): screen, zone, and the
 * first page and referrer this browser arrived on. A Google sign-up is created
 * on the OAuth callback, a redirect that carries no custom header, so it gets
 * the edge's half only.
 */

export const CLIENT_CONTEXT_HEADER = "x-chatform-client";

const HeaderPayload = ClientContextInput.extend({ timezone: z.string().max(64).optional() });

/** The header, URI-encoded JSON. Anything malformed is simply not there. */
function readClientHeader(headers: Headers | undefined): z.infer<typeof HeaderPayload> | null {
  const raw = headers?.get(CLIENT_CONTEXT_HEADER);
  if (!raw || raw.length > 6000) return null;
  try {
    const parsed = HeaderPayload.safeParse(JSON.parse(decodeURIComponent(raw)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** "/sign-up/email" as "email", "/callback/google" as "google". */
function methodOf(path: string | undefined, params: Record<string, string | undefined> | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("/callback/") || path.startsWith("/oauth2/callback/")) return params?.id ?? path.split("/").pop() ?? null;
  if (path.includes("email-otp")) return "email-otp";
  if (path.includes("/email")) return "email";
  return path.replace(/^\//, "").slice(0, 40) || null;
}

interface HookContext {
  request?: Request;
  headers?: Headers;
  path?: string;
  params?: Record<string, string | undefined>;
}

/**
 * Stamps one sign-up or sign-in. Never throws: a missing row is a gap in a
 * report, a thrown error here is somebody who cannot get into their account.
 *
 * Only for a request a person sent. A session minted server-side
 * (`auth.api.*` with no request) says nothing about anybody's device.
 */
export async function recordUserContext(
  env: Bindings,
  userId: string,
  kind: "sign_up" | "sign_in",
  ctx: HookContext | null | undefined,
): Promise<void> {
  const request = ctx?.request;
  if (!request) return;
  try {
    const client = readClientHeader(ctx.headers ?? request.headers);
    const context = captureRequestContext(request, {
      client,
      timezone:
        canonicalZone(client?.timezone) ?? canonicalZone((request as { cf?: { timezone?: string } }).cf?.timezone),
      fallbackChannel: "link",
    });
    await env.DB.prepare(
      `INSERT INTO user_sign_ins (id, user_id, kind, method, context_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        `usi_${crypto.randomUUID().replace(/-/g, "")}`,
        userId,
        kind,
        methodOf(ctx.path, ctx.params),
        JSON.stringify(context),
        Date.now(),
      )
      .run();
  } catch (err) {
    console.error("user_context_failed", userId, kind, err instanceof Error ? err.message : String(err));
  }
}
