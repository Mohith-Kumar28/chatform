import type { HttpClient, RequestOptions } from "../internal/http.js";
import type { Body, Query, Res } from "../types/spec.js";
import type {
  Analytics,
  BlockCatalogue,
  BlockDefinition,
  CreatedForm,
  DocSaved,
  FollowUpStats,
  FormDocumentRead,
  FormPayments,
  FormRead,
  FormSettings,
  FormSummary,
  Page,
  Published,
  SettingsPatch,
  SettingsPatched,
} from "../types/index.js";
import { Versions } from "./versions.js";
import { Knowledge } from "./knowledge.js";
import { Integrations } from "./integrations.js";

export class Forms {
  /** Published versions of a form, and the way back to one. */
  readonly versions: Versions;
  /** What the agent may know beyond the questions. */
  readonly knowledge: Knowledge;
  /** Where the answers go besides a webhook. */
  readonly integrations: Integrations;
  /** Every setting a form has, by key, with what the plan allows. */
  readonly settings: FormSettingsResource;
  /** Payments collected by a form's payment questions. */
  readonly payments: FormPaymentsResource;
  /** Deleted forms, restorable for 30 days before they are deleted for good. */
  readonly archive: FormArchiveResource;

  constructor(private readonly http: HttpClient) {
    this.versions = new Versions(http);
    this.knowledge = new Knowledge(http);
    this.integrations = new Integrations(http);
    this.settings = new FormSettingsResource(http);
    this.payments = new FormPaymentsResource(http);
    this.archive = new FormArchiveResource(http);
  }

  /** Every form, whatever its status, unless `status` narrows it. */
  list(options: Query<"/v1/forms", "get"> = {}, request?: RequestOptions) {
    return this.http.get<Page<FormSummary>>("/v1/forms", options, request);
  }

  /**
   * The form as a respondent receives it, including every question.
   *
   * A form that has never been published has only a draft, so for one of those
   * this answers with the draft document instead, and `status` says which you
   * got. Use `getDocument()` to read the draft of a form that is already live.
   */
  get(formId: string, request?: RequestOptions) {
    return this.http.get<FormRead>(`/v1/forms/${formId}`, undefined, request);
  }

  /** The editable working document, rather than the public projection. */
  getDocument(formId: string, request?: RequestOptions) {
    return this.http.get<FormDocumentRead>(`/v1/forms/${formId}`, { view: "document" }, request);
  }

  create(input: Body<"/v1/forms", "post">, request?: RequestOptions) {
    return this.http.post<CreatedForm>("/v1/forms", input, request);
  }

  /** Save the working document. Lint issues are returned, not enforced. */
  updateDocument(formId: string, doc: unknown, request?: RequestOptions) {
    return this.http.put<DocSaved>(`/v1/forms/${formId}/doc`, { doc }, request);
  }

  /** Publish as an immutable version. Refuses on lint errors. */
  publish(formId: string, request?: RequestOptions) {
    return this.http.post<Published>(`/v1/forms/${formId}/publish`, undefined, request);
  }

  /**
   * Take a published form off the air.
   *
   * The document survives; respondents are turned away. `publish()` puts it
   * back, and the version history is untouched either way.
   */
  unpublish(formId: string, request?: RequestOptions) {
    return this.http.post<Res<"/v1/forms/{id}/unpublish", "post">>(`/v1/forms/${formId}/unpublish`, undefined, request);
  }

  /** Moves the form to the archive (`forms.archive`): restorable for 30 days, then deleted for good. */
  delete(formId: string, request?: RequestOptions) {
    return this.http.delete<Res<"/v1/forms/{id}", "delete">>(`/v1/forms/${formId}`, request);
  }

  /**
   * Counts, the per-question funnel and answer distributions.
   *
   * Defaults to every source. The per-question detail is the paid half: on a
   * plan without it the headline numbers still come back, with `locked` naming
   * what did not.
   */
  analytics(
    formId: string,
    options: { source?: "chat" | "embed" | "api" | "all"; includeTest?: boolean } = {},
    request?: RequestOptions,
  ) {
    return this.http.get<Analytics>(
      `/v1/forms/${formId}/analytics`,
      { source: options.source, includeTest: options.includeTest ? "1" : undefined },
      request,
    );
  }

  /**
   * How the abandonment follow-ups for this form are doing.
   *
   * Takes no window: the endpoint reports over its own default period.
   */
  followupAnalytics(formId: string, request?: RequestOptions) {
    return this.http.get<FollowUpStats>(`/v1/forms/${formId}/followup-analytics`, undefined, request);
  }
}

/**
 * Settings by key, the same list the builder shows.
 *
 * `update()` applies what the plan allows and names the rest in `rejected`
 * rather than failing the whole call, so read the result, not just the status.
 */
export class FormSettingsResource {
  constructor(private readonly http: HttpClient) {}

  get(formId: string, request?: RequestOptions) {
    return this.http.get<FormSettings>(`/v1/forms/${formId}/settings`, undefined, request);
  }

  update(formId: string, input: SettingsPatch, request?: RequestOptions) {
    return this.http.patch<SettingsPatched>(`/v1/forms/${formId}/settings`, input, request);
  }
}

/** Payments taken by a form's payment questions, newest first. */
export class FormPaymentsResource {
  constructor(private readonly http: HttpClient) {}

  list(formId: string, options: Query<"/v1/forms/{id}/payments", "get"> = {}, request?: RequestOptions) {
    return this.http.get<FormPayments>(`/v1/forms/${formId}/payments`, options, request);
  }
}

/**
 * Deleting a form moves it here. It stays restorable for 30 days, then it is
 * deleted for good with its responses, conversations and uploads.
 */
export class FormArchiveResource {
  constructor(private readonly http: HttpClient) {}

  /** Archived forms, most recently archived first, with when each goes for good. */
  list(request?: RequestOptions) {
    return this.http.get<Res<"/v1/archive/forms", "get">>("/v1/archive/forms", undefined, request);
  }

  /** Bring a form back. It returns as a draft; publish it again to put it live. */
  restore(formId: string, request?: RequestOptions) {
    return this.http.post<Res<"/v1/archive/forms/{id}/restore", "post">>(`/v1/archive/forms/${formId}/restore`, undefined, request);
  }

  /** Delete an archived form for good now, instead of at the end of its 30 days. Cannot be undone. */
  delete(formId: string, request?: RequestOptions) {
    return this.http.delete<Res<"/v1/archive/forms/{id}", "delete">>(`/v1/archive/forms/${formId}`, request);
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
    return this.http.get<BlockCatalogue>("/v1/blocks", undefined, request);
  }

  get(type: string, request?: RequestOptions) {
    return this.http.get<BlockDefinition>(`/v1/blocks/${type}`, undefined, request);
  }
}
