import type { HttpClient, RequestOptions } from "../internal/http.js";
import type { Integration, SpreadsheetIntegration } from "../types/index.js";

/**
 * Where a form's answers go besides a webhook.
 *
 * The spreadsheet feed is a live CSV at a URL that carries its own credential,
 * which is why creating it is a PUT: there is one feed per form, and asking
 * twice should not make two.
 */
export class Integrations {
  constructor(private readonly http: HttpClient) {}

  list(formId: string, request?: RequestOptions) {
    return this.http.get<Integration[]>(`/v1/forms/${formId}/integrations`, undefined, request);
  }

  /**
   * Create the feed, or change it.
   *
   * `includePartials` needs the plan feature of the same name and answers 402
   * without it, which reads like a billing fault unless you were expecting it.
   */
  setSpreadsheet(
    formId: string,
    options: { includePartials?: boolean; rotate?: boolean } = {},
    request?: RequestOptions,
  ) {
    return this.http.put<SpreadsheetIntegration>(`/v1/forms/${formId}/integrations/spreadsheet`, options, request);
  }

  /**
   * Issue a new feed URL and kill the old one.
   *
   * Its own method because revoking a leaked URL is something you do in a
   * hurry, and `setSpreadsheet(id, { rotate: true })` is not what anyone
   * reaches for at that moment.
   */
  rotateSpreadsheet(formId: string, request?: RequestOptions) {
    return this.setSpreadsheet(formId, { rotate: true }, request);
  }

  removeSpreadsheet(formId: string, request?: RequestOptions) {
    return this.http.delete<{ ok: boolean }>(`/v1/forms/${formId}/integrations/spreadsheet`, request);
  }
}

export type { Integration, SpreadsheetIntegration };
