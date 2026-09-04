"use client";

/**
 * The three-step upload the session API expects: register an intent, PUT the
 * bytes, confirm.
 *
 * It lives here rather than inside the file picker because a signature is also
 * an upload — a PNG the respondent drew instead of chose — and the two used to
 * disagree about what an uploaded answer even looks like. One place to do it
 * means one shape (`UploadedFile`) reaching `validateAnswer`, which is the
 * shape it has always required.
 */
export interface UploadedFile {
  fileId: string;
  filename: string;
  mime: string;
  size: number;
  r2Key: string;
}

export async function uploadToSession({
  file,
  blockRef,
  uploadBase,
  respondentToken,
}: {
  file: File;
  blockRef: string;
  uploadBase: string;
  respondentToken: string;
}): Promise<UploadedFile> {
  const headers = { "x-respondent-token": respondentToken };

  const intent = await fetch(`${uploadBase}/intent`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ ref: blockRef, filename: file.name, mime: file.type, size: file.size }),
  });
  if (!intent.ok) throw new Error(await errorMessage(intent, "Upload rejected"));
  const { fileId } = (await intent.json()) as { fileId: string };

  const put = await fetch(`${uploadBase}/${fileId}`, {
    method: "PUT",
    headers: { ...headers, "content-type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!put.ok) throw new Error(await errorMessage(put, "Upload failed"));

  // Confirm is what moves the file from pending to confirmed and hands back
  // the descriptor the answer is made of — its failure must never be reported
  // as a success.
  const confirmed = await fetch(`${uploadBase}/${fileId}/confirm`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ ref: blockRef }),
  });
  if (!confirmed.ok) throw new Error(await errorMessage(confirmed, "Couldn't confirm the upload"));
  const body = (await confirmed.json()) as { file?: UploadedFile };
  if (!body.file) throw new Error("Couldn't confirm the upload");
  return body.file;
}

async function errorMessage(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? fallback;
}
