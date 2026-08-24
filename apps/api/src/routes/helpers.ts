import { sha256Hex } from "@repo/form-schema";

/** Respondent token from header or ?t= (EventSource cannot set headers). */
export function respondentToken(c: { req: { url: string; header: (k: string) => string | undefined } }): string | null {
  return c.req.header("x-respondent-token") ?? new URL(c.req.url).searchParams.get("t");
}

export function hashToken(token: string): string {
  return sha256Hex(token);
}
