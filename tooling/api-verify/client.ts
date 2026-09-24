/**
 * The recording HTTP client the verification run is built on.
 *
 * Every call is logged against the *spec* path (`/v1/forms/{id}`) rather than
 * the concrete one, because the report has to line up with `openapi.json` and
 * a report keyed by `frm_a1b2…` lines up with nothing.
 *
 * Pacing is not politeness. `/v1` sits behind a 100-request/10-second burst
 * ceiling keyed on a hash of the presented key, and a run that trips it starts
 * reporting 429s as endpoint failures. The client therefore spaces its own
 * calls and, on a real 429, waits out `Retry-After` and retries once — so a
 * 429 in the report means the endpoint refused a paced caller, which is a
 * finding, rather than that we hammered it.
 */

export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface CallSpec {
  method: Method;
  /** The spec path, parameters still in braces. */
  path: string;
  params?: Record<string, string>;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
  /** Omit the API key entirely. For the negative auth cases. */
  anonymous?: boolean;
  /** Send this key instead of the secret one. */
  key?: string;
  /** Send raw bytes rather than JSON. */
  raw?: BodyInit;
  /** Do not count this call against spec coverage (probes, polling). */
  incidental?: boolean;
}

export interface CallRecord {
  method: Method;
  path: string;
  url: string;
  status: number;
  ms: number;
  requestId: string | null;
  rateRemaining: string | null;
  json: any;
  text: string;
  incidental: boolean;
}

const BURST_SPACING_MS = 180;

export class ApiClient {
  readonly records: CallRecord[] = [];
  private last = 0;

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  private resolve(spec: CallSpec): string {
    let p = spec.path;
    for (const [k, v] of Object.entries(spec.params ?? {})) {
      p = p.replaceAll(`{${k}}`, encodeURIComponent(v));
    }
    const url = new URL(this.baseUrl + p);
    for (const [k, v] of Object.entries(spec.query ?? {})) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
    return url.toString();
  }

  private async pace() {
    const wait = BURST_SPACING_MS - (Date.now() - this.last);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.last = Date.now();
  }

  async call(spec: CallSpec): Promise<CallRecord> {
    const record = await this.attempt(spec);
    if (record.status !== 429) return record;

    // Paced and still refused. Wait out the server's own number, once.
    const retry = Number(record.json?.error?.retry_after ?? 2);
    await new Promise((r) => setTimeout(r, Math.min(retry, 65) * 1000));
    const second = await this.attempt(spec);
    this.records.pop();
    this.records.pop();
    this.records.push(second);
    return second;
  }

  private async attempt(spec: CallSpec): Promise<CallRecord> {
    await this.pace();
    const url = this.resolve(spec);

    const headers: Record<string, string> = { ...spec.headers };
    if (!spec.anonymous) headers["x-api-key"] = spec.key ?? this.apiKey;
    let body: BodyInit | undefined = spec.raw;
    if (spec.body !== undefined) {
      headers["content-type"] ??= "application/json";
      body = JSON.stringify(spec.body);
    }

    const started = Date.now();
    let status = 0;
    let text = "";
    let requestId: string | null = null;
    let rateRemaining: string | null = null;
    try {
      const res = await fetch(url, { method: spec.method, headers, body });
      status = res.status;
      requestId = res.headers.get("x-request-id");
      rateRemaining = res.headers.get("ratelimit-remaining");
      text = await res.text();
    } catch (err) {
      text = `__transport__ ${(err as Error).message}`;
    }

    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* not every body is JSON: CSV exports, signed downloads. */
    }

    const record: CallRecord = {
      method: spec.method,
      path: spec.path,
      url,
      status,
      ms: Date.now() - started,
      requestId,
      rateRemaining,
      json,
      text,
      incidental: spec.incidental ?? false,
    };
    this.records.push(record);
    return record;
  }
}
