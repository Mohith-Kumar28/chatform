import type { HttpClient, RequestOptions } from "../internal/http.js";
import { rows } from "../internal/rows.js";
import type { FormDocument, FormSummary, TemplateDetail, TemplateSummary } from "../types/index.js";

/**
 * The official template catalogue.
 *
 * Top-level rather than hanging off `forms`, because `/v1/templates` is a root
 * path and a template exists without any form. `use()` is the one that makes a
 * form, and it makes a draft: publish it when you are ready.
 */
export class Templates {
  constructor(private readonly http: HttpClient) {}

  /** Most-used first. */
  async list(request?: RequestOptions): Promise<TemplateSummary[]> {
    return rows(await this.http.get<TemplateSummary[] | { data: TemplateSummary[] }>("/v1/templates", undefined, request));
  }

  /** One template, including the document it would create. */
  get(slug: string, request?: RequestOptions) {
    return this.http.get<TemplateDetail>(`/v1/templates/${slug}`, undefined, request);
  }

  /**
   * Create a draft from a template.
   *
   * Exactly what `forms.create()` does, with the document filled in. The form
   * lands in the organization's first workspace, which is not something a key
   * can choose: `/v1` exposes no workspace endpoint at all.
   */
  use(slug: string, request?: RequestOptions) {
    return this.http.post<FormSummary>(`/v1/templates/${slug}/use`, {}, request);
  }
}

export type { TemplateSummary, TemplateDetail, FormDocument };
