import type { HttpClient, RequestOptions } from "../internal/http.js";

export interface ExportFilters {
  /** Defaults to completed only, matching the read API. `["all"]` for everything. */
  status?: string[];
  source?: "chat" | "api" | "embed";
  mode?: "live" | "test" | "all";
  createdAfter?: number;
  createdBefore?: number;
}

export interface Export {
  id: string;
  object: "export";
  formId: string;
  status: "queued" | "running" | "ready" | "failed";
  format: "csv" | "json";
  rowCount: number | null;
  bytes: number | null;
  error: string | null;
  createdAt: number;
  completedAt: number | null;
  /** When the file itself is deleted. Exports are kept for a day, not forever. */
  expiresAt: number | null;
  /** Present only once ready. Signed, key-free, and short-lived. */
  downloadUrl: string | null;
  downloadExpiresAt: number | null;
}

interface ExportWire {
  id: string;
  object: "export";
  form_id: string;
  status: Export["status"];
  format: Export["format"];
  row_count: number | null;
  bytes: number | null;
  error: string | null;
  created_at: number;
  completed_at: number | null;
  expires_at: number | null;
  download_url: string | null;
  download_expires_at: number | null;
}

function toExport(w: ExportWire): Export {
  return {
    id: w.id,
    object: w.object,
    formId: w.form_id,
    status: w.status,
    format: w.format,
    rowCount: w.row_count,
    bytes: w.bytes,
    error: w.error,
    createdAt: w.created_at,
    completedAt: w.completed_at,
    expiresAt: w.expires_at,
    downloadUrl: w.download_url,
    downloadExpiresAt: w.download_expires_at,
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class Exports {
  constructor(private readonly http: HttpClient) {}

  /** Queue an export. Returns immediately, before anything has been read. */
  async create(
    formId: string,
    input: { format?: "csv" | "json" } & ExportFilters = {},
    request?: RequestOptions,
  ): Promise<Export> {
    return toExport(
      await this.http.post<ExportWire>(
        `/v1/forms/${formId}/exports`,
        {
          format: input.format ?? "csv",
          status: input.status,
          source: input.source,
          mode: input.mode,
          created_after: input.createdAfter,
          created_before: input.createdBefore,
        },
        request,
      ),
    );
  }

  async get(exportId: string, request?: RequestOptions): Promise<Export> {
    return toExport(await this.http.get<ExportWire>(`/v1/exports/${exportId}`, undefined, request));
  }

  async list(options: { formId?: string; limit?: number } = {}, request?: RequestOptions): Promise<Export[]> {
    const res = await this.http.get<{ data: ExportWire[] }>(
      "/v1/exports",
      { form_id: options.formId, limit: options.limit },
      request,
    );
    return res.data.map(toExport);
  }

  /**
   * Wait for an export to finish.
   *
   * There is no webhook for this yet, so polling is the honest interface —
   * offered here rather than left for every caller to write the same loop.
   * Throws if the export failed, because a `failed` export returned as a value
   * is a null nobody checks.
   */
  async wait(
    exportId: string,
    options: { intervalMs?: number; timeoutMs?: number } = {},
    request?: RequestOptions,
  ): Promise<Export> {
    const interval = options.intervalMs ?? 1500;
    const deadline = Date.now() + (options.timeoutMs ?? 120_000);

    for (;;) {
      const current = await this.get(exportId, request);
      if (current.status === "ready") return current;
      if (current.status === "failed") throw new Error(`Export ${exportId} failed: ${current.error ?? "unknown"}`);
      if (Date.now() > deadline) throw new Error(`Export ${exportId} was still ${current.status} after the timeout`);
      await sleep(interval);
    }
  }

  /**
   * Queue an export, wait for it, and hand back the file.
   *
   * The download goes through the configured `fetch` but without the API key:
   * the signature is the credential, and sending ours alongside would put an
   * `sk_live_` somewhere it does not belong for no gain.
   */
  async download(
    formId: string,
    input: { format?: "csv" | "json" } & ExportFilters = {},
    request?: RequestOptions,
  ): Promise<Response> {
    const created = await this.create(formId, input, request);
    const ready = await this.wait(created.id, {}, request);
    const res = await this.http.fetchSigned(ready.downloadUrl!, request);
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    return res;
  }
}
