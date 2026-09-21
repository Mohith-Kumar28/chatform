import type { HttpClient, RequestOptions } from "../internal/http.js";
import type { FormDocument, FormVersion, FormVersionSummary, RestoredVersion } from "../types/index.js";

/**
 * Published versions of a form, and the way back to one.
 *
 * Reached as `chatform.forms.versions`, because every path here begins
 * `/v1/forms/{id}/versions` and a version has no meaning apart from its form.
 */
export class Versions {
  constructor(private readonly http: HttpClient) {}

  /**
   * Every published version, newest first.
   *
   * `responses` is the number of completed responses recorded against each
   * one, and it is the number to look at before restoring: a version nobody
   * answered can be replaced freely, while one with responses behind it is the
   * schema those answers were recorded against.
   */
  list(formId: string, request?: RequestOptions) {
    return this.http.get<FormVersionSummary[]>(`/v1/forms/${formId}/versions`, undefined, request);
  }

  /** One version, optionally diffed against another. */
  get(formId: string, version: number, options: { compare?: number } = {}, request?: RequestOptions) {
    return this.http.get<FormVersion>(`/v1/forms/${formId}/versions/${version}`, options, request);
  }

  /**
   * Copy a published version back over the working document.
   *
   * It writes the draft, not the live form. Respondents see nothing change
   * until you publish again.
   */
  restore(formId: string, version: number, request?: RequestOptions) {
    return this.http.post<RestoredVersion>(`/v1/forms/${formId}/versions/${version}/restore`, undefined, request);
  }
}

export type { FormVersion, FormVersionSummary, RestoredVersion, FormDocument };
