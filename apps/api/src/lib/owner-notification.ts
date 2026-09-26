import type { FormDoc } from "@repo/form-schema";

/**
 * Send a new form's responses to the person who made it.
 *
 * A fresh form used to start with an empty notification list, so nobody heard
 * about a response until they thought to look. Now the creator's address goes
 * in when the form is created, where they can see it in On completion and
 * clear it. Only at creation: an empty list on an existing form may be one
 * somebody emptied on purpose, and that has to stay off.
 *
 * A doc that already names recipients (a duplicate, an imported doc) keeps its
 * own. A lookup failure leaves the list empty rather than failing the create.
 */
export async function withOwnerNotification(
  db: D1Database,
  userId: string | null | undefined,
  doc: FormDoc,
): Promise<FormDoc> {
  if (!userId || doc.settings.onComplete.notificationEmails.length > 0) return doc;
  try {
    const row = await db.prepare(`SELECT email FROM users WHERE id = ?`).bind(userId).first<{ email: string | null }>();
    if (!row?.email) return doc;
    return {
      ...doc,
      settings: {
        ...doc.settings,
        onComplete: { ...doc.settings.onComplete, notificationEmails: [row.email] },
      },
    };
  } catch (err) {
    console.error("owner_notification_failed", {
      userId,
      errName: err instanceof Error ? err.name : "unknown",
      errMessage: err instanceof Error ? err.message : String(err),
    });
    return doc;
  }
}
