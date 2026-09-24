import type { HttpClient, RequestOptions } from "../internal/http.js";
import type { KnowledgeIndex, KnowledgeSource } from "../types/index.js";

/**
 * What the agent is allowed to know beyond the questions themselves.
 *
 * Four ways in rather than one `add({ kind })`, because the bodies differ and
 * so do the refusals: an upload can answer 413 or 415, the other three answer
 * 402 when the plan's knowledge allowance is spent.
 *
 * Indexing is asynchronous. Every one of these returns as soon as the source is
 * recorded, and `list()` is where you watch it become usable.
 */
export class Knowledge {
  constructor(private readonly http: HttpClient) {}

  /** Every source on the form, with what the plan has left. */
  list(formId: string, request?: RequestOptions) {
    return this.http.get<KnowledgeIndex>(`/v1/forms/${formId}/knowledge`, undefined, request);
  }

  addText(formId: string, input: { title: string; body: string }, request?: RequestOptions) {
    return this.http.post<{ id: string }>(`/v1/forms/${formId}/knowledge/text`, input, request);
  }

  /** One page, fetched now. */
  addLink(formId: string, input: { url: string; title?: string }, request?: RequestOptions) {
    return this.http.post<{ id: string }>(`/v1/forms/${formId}/knowledge/link`, input, request);
  }

  /**
   * Follow a site and add the pages it finds.
   *
   * The fetching happens out of band, after this returns. `pages` bounds it;
   * leaving it off lets the plan's allowance be the bound instead.
   */
  crawl(formId: string, input: { url: string; pages?: number }, request?: RequestOptions) {
    return this.http.post<{ id?: string; ids?: string[] }>(`/v1/forms/${formId}/knowledge/crawl`, input, request);
  }

  /**
   * A document, image or recording.
   *
   * Multipart, so the `content-type` is left to `fetch`: setting it by hand
   * drops the boundary and the request arrives unparseable.
   */
  upload(
    formId: string,
    file: { body: Blob | ArrayBuffer | Uint8Array; filename: string; type?: string },
    request?: RequestOptions,
  ) {
    const form = new FormData();
    const blob =
      file.body instanceof Blob ? file.body : new Blob([file.body as BlobPart], { type: file.type ?? "application/octet-stream" });
    form.append("file", blob, file.filename);
    return this.http.postForm<{ id: string }>(`/v1/forms/${formId}/knowledge/upload`, form, request);
  }

  remove(formId: string, sourceId: string, request?: RequestOptions) {
    return this.http.delete<{ ok: boolean }>(`/v1/forms/${formId}/knowledge/${sourceId}`, request);
  }
}

export type { KnowledgeIndex, KnowledgeSource };
