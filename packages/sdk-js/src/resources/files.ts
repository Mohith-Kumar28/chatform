import type { HttpClient, RequestOptions } from "../internal/http.js";
import type { Res } from "../types/spec.js";

export type UploadIntent = Res<"/v1/sessions/{sid}/uploads/intent", "post">;

export interface StoredFile {
  id: string;
  object: "file";
  formId: string | null;
  responseId: string | null;
  filename: string;
  mime: string;
  sizeBytes: number;
  createdAt: number;
  /** Signed, key-free, and short-lived. Read the file again rather than storing it. */
  downloadUrl: string;
  downloadExpiresAt: number;
}

/** What the API sends. `StoredFile` is the same object in camelCase. */
type FileWire = Res<"/v1/files/{id}", "get">;

function toFile(w: FileWire): StoredFile {
  return {
    id: w.id,
    object: w.object,
    formId: w.form_id,
    responseId: w.response_id,
    filename: w.filename,
    mime: w.mime,
    sizeBytes: w.size_bytes,
    createdAt: w.created_at,
    downloadUrl: w.download_url,
    downloadExpiresAt: w.download_expires_at,
  };
}

/** What `upload` accepts. A stream is allowed but is sent once, without retry. */
export type UploadBody = Blob | ArrayBuffer | ArrayBufferView | ReadableStream | string;

function sizeOf(body: UploadBody): number | null {
  if (typeof body === "string") return new TextEncoder().encode(body).byteLength;
  if (body instanceof ArrayBuffer) return body.byteLength;
  if (ArrayBuffer.isView(body)) return body.byteLength;
  if (typeof Blob !== "undefined" && body instanceof Blob) return body.size;
  return null;
}

export class Files {
  constructor(private readonly http: HttpClient) {}

  /**
   * Answer a `file_upload` question in one call.
   *
   * Wraps the three steps the API requires — register the intent, PUT the
   * bytes, confirm — because getting them out of order is the only way to use
   * this wrong, and there is no reason to make anyone learn that.
   *
   * A `ReadableStream` needs an explicit `size`: the intent has to declare one
   * before any bytes move, and a stream cannot be measured without consuming
   * it.
   */
  async upload(
    sessionId: string,
    input: { ref: string; filename: string; mime: string; body: UploadBody; size?: number },
    request?: RequestOptions,
  ): Promise<{ fileId: string }> {
    const size = input.size ?? sizeOf(input.body);
    if (size == null) {
      throw new Error(
        "Pass `size` when uploading a stream — the upload intent must declare a size before any bytes are sent.",
      );
    }

    const intent = await this.http.post<UploadIntent>(
      `/v1/sessions/${sessionId}/uploads/intent`,
      { ref: input.ref, filename: input.filename, mime: input.mime, size },
      request,
    );

    const body = typeof input.body === "string" ? input.body : (input.body as BodyInit);
    await this.http.putRaw<{ ok: boolean }>(intent.uploadUrl, body, input.mime, request);

    // Until this lands the file is pending and the conversation has not moved.
    await this.http.post<{ ok: boolean }>(`${intent.uploadUrl}/confirm`, undefined, request);
    return { fileId: intent.fileId };
  }

  /** Metadata plus a signed download URL that needs no API key. */
  async get(fileId: string, request?: RequestOptions): Promise<StoredFile> {
    return toFile(await this.http.get<FileWire>(`/v1/files/${fileId}`, undefined, request));
  }

  /**
   * The file inside the JSON body, read with the API key rather than via
   * `downloadUrl`: UTF-8 text for text types, base64 otherwise. Up to 4 MB.
   */
  async content(fileId: string, request?: RequestOptions): Promise<Res<"/v1/files/{id}/content", "get">> {
    return this.http.get<Res<"/v1/files/{id}/content", "get">>(`/v1/files/${fileId}/content`, undefined, request);
  }

  /**
   * The bytes themselves.
   *
   * The signed URL is its own credential, so this follows it without the API
   * key — through the configured `fetch`, so a caller's proxy or test double
   * still sees it.
   */
  async download(fileId: string, request?: RequestOptions): Promise<Response> {
    const file = await this.get(fileId, request);
    const res = await this.http.fetchSigned(file.downloadUrl, request);
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    return res;
  }
}
