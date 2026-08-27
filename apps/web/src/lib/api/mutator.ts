import { isGateError, type GateError } from "@repo/entitlements";
import { openPaywall } from "@/stores/paywall-store";

/** Orval mutator — every generated hook/fetcher routes through here. */
export const API_ORIGIN =
  process.env.NEXT_PUBLIC_API_ORIGIN ?? "http://localhost:8787";

export const customFetch = async <T>(url: string, options?: RequestInit): Promise<T> => {
  const { body, ...rest } = options ?? {};
  const serialized =
    body !== undefined && typeof body !== "string" ? JSON.stringify(body) : body;
  const headers = new Headers(rest.headers);
  if (!headers.has("content-type") && serialized !== undefined) {
    headers.set("content-type", "application/json");
  }
  const res = await fetch(url.startsWith("http") ? url : `${API_ORIGIN}${url}`, {
    ...rest,
    body: serialized,
    headers,
    credentials: "include",
  });
  if (!res.ok) {
    const raw = await res.text();
    let message = `Request failed: ${res.status}`;
    let gate: GateError | null = null;
    try {
      const parsed = JSON.parse(raw) as { error?: { message?: string; issues?: { message: string }[] } };
      const err = parsed.error;
      if (typeof err === "string") message = err;
      else if (err && "message" in err && err.message) message = err.message;
      else if (err && "issues" in err && Array.isArray(err.issues)) message = err.issues.map((i) => i.message).join("; ");
      else if (raw) message = raw.slice(0, 300);
      /**
       * Every plan denial from the API shares one envelope, so one interceptor can render
       * every paywall correctly without knowing which route produced it. The alternative —
       * each call site catching its own 402 — guarantees that the gates added last are the
       * ones with no dialog.
       *
       * A 403 `forbidden` is recognised here too but never opens the dialog: upgrading
       * cannot fix a role. It falls through as an ordinary error for the component to show
       * in place. See `openPaywall`.
       */
      if (isGateError(parsed)) {
        gate = parsed.error;
        openPaywall(parsed.error);
      }
    } catch {
      if (raw) message = raw.slice(0, 300);
    }
    // A gate denial is expected product behaviour, not a fault worth a console error.
    if (!gate) console.error(`[api] ${res.status} ${url}`, message);
    throw new ApiError(message, res.status, gate);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    /** The parsed gate envelope when this was a plan or role denial. */
    public readonly gate: GateError | null = null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** True when the request failed because the plan does not include something. */
export function isPlanDenial(err: unknown): err is ApiError & { gate: GateError } {
  return err instanceof ApiError && err.gate !== null && err.gate.code !== "forbidden";
}

/** True when the request failed because of the caller's role, which upgrading won't fix. */
export function isRoleDenial(err: unknown): err is ApiError & { gate: GateError } {
  return err instanceof ApiError && err.gate?.code === "forbidden";
}
