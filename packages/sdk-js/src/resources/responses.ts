import type { HttpClient, RequestOptions } from "../internal/http.js";
import type { AnswerValue, ChatformResponse, Page } from "../types/index.js";

export interface CreateResponseOptions {
  answers?: Record<string, AnswerValue>;
  hiddenFields?: Record<string, string>;
  /** Finish in the same call. Still records one row per answer. */
  complete?: boolean;
  /** `flow` (default) refuses answers ahead of the flow; `free` is for imports. */
  mode?: "flow" | "free";
  /** Seconds before an unfinished response is abandoned. Default 24 hours. */
  expiresIn?: number;
  respondent?: { ipHash?: string; country?: string; userAgent?: string };
}

export interface ListResponsesOptions {
  status?: string | string[];
  source?: string;
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
  answer(
    responseId: string,
    answer: { ref: string; value: AnswerValue } | { answers: { ref: string; value: AnswerValue }[] },
    request?: RequestOptions,
  ) {
    return this.http.post<ChatformResponse & { recorded: { ref: string; value: AnswerValue }[] }>(
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
  complete(responseId: string, options: { endingRef?: string } = {}, request?: RequestOptions) {
    return this.http.post<ChatformResponse & { ending: unknown }>(
      `/v1/responses/${responseId}/complete`,
      options,
      request,
    );
  }

  /** Give up on a response, keeping every answer that was given. */
  abandon(responseId: string, options: { reason?: string } = {}, request?: RequestOptions) {
    return this.http.post<ChatformResponse>(`/v1/responses/${responseId}/abandon`, options, request);
  }

  get(responseId: string, options: { include?: string[] } = {}, request?: RequestOptions) {
    return this.http.get<ChatformResponse>(
      `/v1/responses/${responseId}`,
      { include: options.include?.join(",") },
      request,
    );
  }

  /** Where the flow is waiting, without the rest of the response. */
  next(responseId: string, request?: RequestOptions) {
    return this.http.get<{
      next: ChatformResponse["next"];
      progress: ChatformResponse["progress"];
      answered: string[];
      missing_required: { ref: string; title: string }[];
      complete_ready: boolean;
    }>(`/v1/responses/${responseId}/next`, undefined, request);
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
