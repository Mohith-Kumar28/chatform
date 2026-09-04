import type { HttpClient, RequestOptions } from "../internal/http.js";
import type { BlockDefinition, FormSummary, Page } from "../types/index.js";

export class Forms {
  constructor(private readonly http: HttpClient) {}

  list(
    options: { status?: "draft" | "published" | "archived" | "all"; limit?: number; cursor?: string } = {},
    request?: RequestOptions,
  ) {
    return this.http.get<Page<FormSummary>>("/v1/forms", options, request);
  }

  /** The public configuration a respondent would see, including every question. */
  get(formId: string, request?: RequestOptions) {
    return this.http.get<{ slug: string; blocks: unknown[]; [key: string]: unknown }>(
      `/v1/forms/${formId}`,
      undefined,
      request,
    );
  }

  /** The editable document behind the form, rather than its public projection. */
  getDocument(formId: string, request?: RequestOptions) {
    return this.http.get<{ id: string; slug: string; status: string; doc: unknown }>(
      `/v1/forms/${formId}`,
      { view: "document" },
      request,
    );
  }

  create(input: { title: string; doc?: unknown }, request?: RequestOptions) {
    return this.http.post<FormSummary>("/v1/forms", input, request);
  }

  /** Save the working document. Lint issues are returned, not enforced. */
  updateDocument(formId: string, doc: unknown, request?: RequestOptions) {
    return this.http.put<{ ok: boolean; issues: { level: string; code: string; message: string }[] }>(
      `/v1/forms/${formId}/doc`,
      { doc },
      request,
    );
  }

  /** Publish as an immutable version. Refuses on lint errors. */
  publish(formId: string, request?: RequestOptions) {
    return this.http.post<{ ok: boolean; version: number; versionId: string; stripped: unknown[] }>(
      `/v1/forms/${formId}/publish`,
      undefined,
      request,
    );
  }

  /** Soft — the responses collected against it stay readable. */
  delete(formId: string, request?: RequestOptions) {
    return this.http.delete<{ ok: boolean; deleted: boolean }>(`/v1/forms/${formId}`, request);
  }

  /**
   * Counts, the per-question funnel and answer distributions.
   *
   * Defaults to every source. The per-question detail is the paid half — on a
   * plan without it the headline numbers still come back, with `locked` naming
   * what did not.
   */
  analytics(
    formId: string,
    options: { source?: "chat" | "embed" | "api" | "all"; includeTest?: boolean } = {},
    request?: RequestOptions,
  ) {
    return this.http.get<{
      views: number;
      starts: number;
      completed: number;
      abandoned: number;
      avgDurationMs: number;
      completionRate: number;
      perBlock: { blockRef: string; title: string; answered: number; answerRate: number }[];
      distributions: unknown[];
      locked?: string[];
    }>(
      `/v1/forms/${formId}/analytics`,
      { source: options.source, includeTest: options.includeTest ? "1" : undefined },
      request,
    );
  }
}

export class Blocks {
  constructor(private readonly http: HttpClient) {}

  /**
   * Every block type, with its schema and answer contract.
   *
   * Build a renderer against this rather than a hardcoded list and a new
   * question type will not surprise it.
   */
  list(request?: RequestOptions) {
    return this.http.get<{ schema_version: number; blocks: BlockDefinition[] }>(
      "/v1/blocks",
      undefined,
      request,
    );
  }

  get(type: string, request?: RequestOptions) {
    return this.http.get<BlockDefinition>(`/v1/blocks/${type}`, undefined, request);
  }
}
