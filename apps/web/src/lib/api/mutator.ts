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
    try {
      const parsed = JSON.parse(raw) as { error?: { message?: string; issues?: { message: string }[] } };
      const err = parsed.error;
      if (typeof err === "string") message = err;
      else if (err && "message" in err && err.message) message = err.message;
      else if (err && "issues" in err && Array.isArray(err.issues)) message = err.issues.map((i) => i.message).join("; ");
      else if (raw) message = raw.slice(0, 300);
    } catch {
      if (raw) message = raw.slice(0, 300);
    }
    console.error(`[api] ${res.status} ${url}`, message);
    throw new ApiError(message, res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
