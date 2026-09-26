import { apiHeaders, throwApiError } from "@/lib/api/mutator";
import { readImpersonation } from "@/lib/impersonation";

/**
 * A file download from the API that still works while acting as a customer.
 *
 * Downloads are plain `<a href>` links so the browser streams them to disk,
 * but a link cannot carry the impersonation header, so it would fetch the
 * admin's own organization and 404. Only while impersonating, the click is
 * taken over: fetched with the header, then saved from a blob.
 */
export function apiDownloadClick(href: string) {
  return (e: React.MouseEvent) => {
    if (!readImpersonation()) return;
    e.preventDefault();
    void downloadFromApi(href);
  };
}

async function downloadFromApi(href: string): Promise<void> {
  const res = await fetch(href, { headers: apiHeaders(), credentials: "include" });
  if (!res.ok) await throwApiError(res, href);
  const disposition = res.headers.get("content-disposition") ?? "";
  const name =
    /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1] ??
    /filename="?([^";]+)"?/i.exec(disposition)?.[1] ??
    href.split("?")[0]!.split("/").pop()!;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = decodeURIComponent(name);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
