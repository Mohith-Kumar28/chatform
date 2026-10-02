/**
 * `POST /api/client-error`: where `global-error.tsx` reports a crash.
 *
 * The browser is the only place the error exists, so without this a visitor
 * who saw "This page couldn't load" leaves nothing behind. Written to Workers
 * Logs as flat strings (an Error object serialises to `{}` there). Never cached:
 * the edge worker passes `/api/` straight through.
 */

const MAX_FIELD = 2_000;

function field(value: unknown): string | undefined {
  return typeof value === "string" && value ? value.slice(0, MAX_FIELD) : undefined;
}

export async function POST(request: Request): Promise<Response> {
  const text = await request.text().catch(() => "");
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(text.slice(0, 10_000)) as Record<string, unknown>;
  } catch {
    // A beacon that is not JSON still gets logged with the request's own details.
  }
  console.error("client_error", {
    message: field(body.message),
    digest: field(body.digest),
    stack: field(body.stack),
    url: field(body.url),
    userAgent: field(request.headers.get("user-agent")),
    country: field(request.headers.get("cf-ipcountry")),
  });
  return new Response(null, { status: 204 });
}
