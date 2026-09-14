"use client";

import { API_ORIGIN, apiHeaders, throwApiError } from "@/lib/api/mutator";

/**
 * Upload one file to a form's knowledge base.
 *
 * Hand-written rather than generated because the endpoint takes multipart form
 * data, and orval's generated mutation carries only the path parameter — a
 * route with no `validator("json", …)` has no request body in the spec to
 * generate from. The error path is still the shared one, so a plan denial here
 * opens the same paywall as everywhere else.
 */
export async function uploadKnowledgeFile(formId: string, file: File, title?: string): Promise<{ id: string }> {
  const body = new FormData();
  body.set("file", file);
  if (title) body.set("title", title);

  // Deliberately no content-type: the browser sets it, with the multipart
  // boundary, and overriding it makes the body unparseable.
  const headers = apiHeaders();

  const url = `${API_ORIGIN}/api/forms/${formId}/knowledge/upload`;
  const res = await fetch(url, { method: "POST", body, headers, credentials: "include" });
  if (!res.ok) await throwApiError(res, url);
  return (await res.json()) as { id: string };
}
