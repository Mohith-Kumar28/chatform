import type { HttpClient, RequestOptions } from "../internal/http.js";
import type { Body, Res } from "../types/spec.js";
import type { ChatformResponse, NextStep, Page, ResponseSource, ResponseStatus } from "../types/index.js";

/**
 * `answers` keyed by ref; `complete: true` finishes in the same call; `mode:
 * "free"` accepts answers ahead of the flow, for imports.
 */
export type CreateResponseOptions = Body<"/v1/forms/{id}/responses", "post">;

/** camelCase here, sent as the API's snake_case query parameters. */
export interface ListResponsesOptions {
  status?: ResponseStatus | "all" | ResponseStatus[];
  source?: ResponseSource;
  mode?: "live" | "test" | "all";
  createdAfter?: number;
  createdBefore?: number;
  updatedSince?: number;
  endingRef?: string;
  q?: string;
  order?: "created" | "updated";
  include?: ("answers" | "transcript" | "files")[];
  limit?: number;
  cursor?: string;
}

export class Responses {
  constructor(private readonly http: HttpClient) {}

  /** Open a response. Counts as a start, exactly as opening a conversation does. */
  create(formId: string, options: CreateResponseOptions = {}, request?: RequestOptions) {
    return this.http.post<ChatformResponse>(`/v1/forms/${formId}/responses`, options, request);
  }

  /**
   * Record one answer, or several.
   *
   * A batch is all or nothing: a partial write would leave you unable to tell
   * what landed.
   */
  answer(responseId: string, answer: Body<"/v1/responses/{id}/answers", "post">, request?: RequestOptions) {
    return this.http.post<Res<"/v1/responses/{id}/answers", "post">>(
      `/v1/responses/${responseId}/answers`,
      answer,
      request,
    );
  }

  /** Retract an answer, moving the flow back to it. Later answers are kept. */
  retract(responseId: string, ref: string, request?: RequestOptions) {
    return this.http.delete<ChatformResponse>(`/v1/responses/${responseId}/answers/${ref}`, request);
  }

  /** Finish. Refuses if a required question that was actually asked is unanswered. */
  complete(responseId: string, options: Body<"/v1/responses/{id}/complete", "post"> = {}, request?: RequestOptions) {
    return this.http.post<Res<"/v1/responses/{id}/complete", "post">>(
      `/v1/responses/${responseId}/complete`,
      options,
      request,
    );
  }

  /** Give up on a response, keeping every answer that was given. */
  abandon(responseId: string, options: Body<"/v1/responses/{id}/abandon", "post"> = {}, request?: RequestOptions) {
    return this.http.post<ChatformResponse>(`/v1/responses/${responseId}/abandon`, options, request);
  }

  /** `include: ["answers"]` adds every answer as `{ ref, type, value }`. */
  get(responseId: string, options: { include?: string[] } = {}, request?: RequestOptions) {
    return this.http.get<ChatformResponse>(
      `/v1/responses/${responseId}`,
      { include: options.include?.join(",") },
      request,
    );
  }

  /** Where the flow is waiting, without the rest of the response. */
  next(responseId: string, request?: RequestOptions) {
    return this.http.get<NextStep>(`/v1/responses/${responseId}/next`, undefined, request);
  }

  list(formId: string, options: ListResponsesOptions = {}, request?: RequestOptions) {
    return this.http.get<Page<ChatformResponse>>(
      `/v1/forms/${formId}/responses`,
      {
        status: Array.isArray(options.status) ? options.status.join(",") : options.status,
        source: options.source,
        mode: options.mode,
        created_after: options.createdAfter,
        created_before: options.createdBefore,
        updated_since: options.updatedSince,
        ending_ref: options.endingRef,
        q: options.q,
        order: options.order,
        include: options.include?.join(","),
        limit: options.limit,
        cursor: options.cursor,
      },
      request,
    );
  }

  /**
   * Every response, page by page.
   *
   * Paging is the part people get wrong — usually by reaching for an offset,
   * which shifts under them as new responses arrive.
   */
  async *iterate(formId: string, options: ListResponsesOptions = {}, request?: RequestOptions) {
    let cursor = options.cursor;
    do {
      const page = await this.list(formId, { ...options, cursor, limit: options.limit ?? 100 }, request);
      yield* page.data;
      cursor = page.next_cursor ?? undefined;
    } while (cursor);
  }
}
