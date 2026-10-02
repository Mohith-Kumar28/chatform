import type { HttpClient, RequestOptions } from "../internal/http.js";
import type {
  AiClarifyInput,
  AiEditInput,
  AiEditResult,
  AiGenerateInput,
  AiGenerateResult,
  ClarifyQuestion,
  FormDocument,
} from "../types/index.js";

/**
 * Chatform's own designer model, as an endpoint.
 *
 * Its own resource rather than methods on `forms`, for a reason worth knowing
 * before you call it: `ai:generate` is the only scope on `/v1` that spends
 * money. A generation bills your plan's AI allowance and the tokens it takes,
 * so it is deliberately absent from the `agent` key preset and has to be asked
 * for. A 402 here means the month's generations are gone, not that a card
 * failed, and retrying will not help until the month turns over.
 *
 * Nothing here saves anything. Each method returns a document and leaves it to
 * you: pass it to `forms.create()` or `forms.updateDocument()` to keep it. That
 * is what makes it safe to call twice and take the better answer.
 */
export class Ai {
  constructor(private readonly http: HttpClient) {}

  /** A document from a description, plus whatever the linter thinks of it. */
  generateForm(input: AiGenerateInput, request?: RequestOptions) {
    return this.http.post<AiGenerateResult>("/v1/ai/generate-form", input, request);
  }

  /**
   * Rewrite an existing form from an instruction.
   *
   * A 422 saying the edit would change nothing is an ordinary outcome, not a
   * fault: the model read the form, decided the instruction was already
   * satisfied, and declined to churn the document.
   */
  editForm(input: AiEditInput, request?: RequestOptions) {
    return this.http.post<AiEditResult>("/v1/ai/edit-form", input, request);
  }

  /**
   * What a request leaves open, before spending a generation on it.
   *
   * Usually returns nothing, which is the useful answer. It runs on the
   * cheapest tier and is not charged as a generation, so asking first is free.
   */
  clarifyForm(input: AiClarifyInput, request?: RequestOptions) {
    return this.http.post<{ questions: ClarifyQuestion[] }>("/v1/ai/clarify-form", input, request);
  }
}

export type { AiGenerateResult, AiEditResult, ClarifyQuestion, FormDocument };
