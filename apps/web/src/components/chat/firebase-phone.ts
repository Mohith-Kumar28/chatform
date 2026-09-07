/**
 * Phone verification for the hosted form, carried by Firebase.
 *
 * Firebase sends the SMS and checks the code, then hands back an ID token that
 * the API verifies (`verifyFirebasePhoneToken`). That division is the point:
 * it means no rented number, no Indian DLT registration, and no per-message
 * bill of ours for a step most respondents only ever do once.
 *
 * The cost is that this is a browser flow with a reCAPTCHA in it, so it cannot
 * serve headless `/v1` callers. They keep the server-side OTP in
 * `respondent-auth.ts`, and this module simply does not exist for them.
 */

import type { Auth, ConfirmationResult } from "firebase/auth";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
};

/**
 * Whether this deployment can run the Firebase flow at all.
 *
 * Read at module scope so the card knows which phone UI to render on its first
 * paint, with nothing to await. When it is false the card falls back to the
 * server OTP path, which is what keeps local development working without
 * anyone having to create a Firebase project to run the form.
 */
export const firebasePhoneConfigured = Boolean(config.apiKey && config.authDomain && config.projectId);

/**
 * One Auth instance per page, created on first use.
 *
 * `initializeAuth` rather than `getAuth`: it takes the persistence explicitly,
 * and in-memory is the only honest choice here. A respondent is not a user —
 * signing in to prove a phone number must not leave a Firebase session in the
 * localStorage of what may well be a shared or borrowed device.
 */
let authPromise: Promise<Auth> | null = null;
function getFirebaseAuth(): Promise<Auth> {
  authPromise ??= (async () => {
    const [{ initializeApp, getApps, getApp }, { initializeAuth, inMemoryPersistence }] = await Promise.all([
      import("firebase/app"),
      import("firebase/auth"),
    ]);
    const app = getApps().length ? getApp() : initializeApp(config);
    return initializeAuth(app, { persistence: inMemoryPersistence });
  })().catch((err) => {
    authPromise = null; // a failed load must not poison every later attempt
    throw err;
  });
  return authPromise;
}

/**
 * Codes that mean the *form owner* has not finished setting Firebase up. They
 * are indistinguishable from a transient failure to a respondent, who will
 * dutifully retry a thing that cannot work, so they are logged loudly — the
 * console is the only channel back to whoever can actually fix it.
 *
 * Learned the hard way: with phone auth enabled but the SMS region policy left
 * at its default empty allow-list, every send failed as a generic "couldn't
 * send that code" and looked exactly like the Twilio outage it had replaced.
 */
const SETUP_ERRORS = new Set([
  "auth/billing-not-enabled",
  "auth/operation-not-allowed",
  "auth/invalid-app-credential",
  "auth/unauthorized-domain",
  "auth/quota-exceeded",
]);

/**
 * Firebase reports failures as `auth/*` codes. Left raw they reach the
 * respondent as "Firebase: Error (auth/invalid-phone-number)", so the ones
 * that are actually the respondent's to fix get a sentence they can act on,
 * and everything else collapses to one honest generic.
 */
function messageFor(err: unknown): string {
  const code = typeof err === "object" && err && "code" in err ? String((err as { code: unknown }).code) : "";

  if (SETUP_ERRORS.has(code)) {
    console.error(
      `[chatform] Phone verification is misconfigured: ${code}. ` +
        "Check the Firebase console — billing plan, Authentication > Settings > SMS region policy, " +
        "and that this domain is on the authorized list.",
    );
    // Never "try again": retrying cannot work until someone changes a setting,
    // and inviting it just burns the respondent's patience.
    return "Phone verification isn't available right now. Please use another sign-in option.";
  }

  switch (code) {
    case "auth/invalid-phone-number":
    case "auth/missing-phone-number":
      return "That doesn't look like a valid number. Include your country code.";
    case "auth/invalid-verification-code":
      return "That code didn't match. Please try again.";
    case "auth/code-expired":
      return "That code expired. Ask for a new one.";
    case "auth/too-many-requests":
      // Firebase counts this per number *and* per IP, and clears it on its own
      // schedule — minutes sometimes, considerably longer under sustained
      // traffic. "Wait a few minutes" was a guess dressed as a fact, and being
      // wrong about it means someone sits there re-tapping a dead button.
      // Point at the door that is still open instead.
      return "Too many attempts from this device. Please try again later, or use another sign-in option.";
    case "auth/captcha-check-failed":
      return "We couldn't confirm you're human. Please try again.";
    default:
      return "We couldn't send that code. Please try again.";
  }
}

export interface PhoneCodeSent {
  confirm: (code: string) => Promise<{ ok: true; idToken: string } | { ok: false; message: string }>;
}

/**
 * Send the SMS.
 *
 * `container` must be a mounted element the verifier can own. It stays empty
 * for an invisible reCAPTCHA in the common case, but Google escalates to a
 * visible challenge whenever it is unsure about the visitor, and it needs
 * somewhere on the page to draw that — so the element is rendered for real,
 * not hidden with `display: none`.
 */
export async function sendPhoneCode(
  phone: string,
  container: HTMLElement,
): Promise<{ ok: true; sent: PhoneCodeSent } | { ok: false; message: string }> {
  let verifier: { clear: () => void } | null = null;
  try {
    const auth = await getFirebaseAuth();
    const { RecaptchaVerifier, signInWithPhoneNumber, signOut } = await import("firebase/auth");

    // A fresh verifier per send. reCAPTCHA tokens are single-use, so a reused
    // one fails the *second* send — the resend that a respondent who missed
    // the first SMS is most likely to reach for.
    const recaptcha = new RecaptchaVerifier(auth, container, { size: "invisible" });
    verifier = recaptcha;
    const confirmation: ConfirmationResult = await signInWithPhoneNumber(auth, phone, recaptcha);
    recaptcha.clear();
    verifier = null;

    return {
      ok: true,
      sent: {
        confirm: async (code: string) => {
          try {
            const cred = await confirmation.confirm(code);
            const idToken = await cred.user.getIdToken();
            // The token is minted; the Firebase session has done its job and
            // is dead weight on the respondent's device from here.
            await signOut(auth).catch(() => {});
            return { ok: true as const, idToken };
          } catch (err) {
            return { ok: false as const, message: messageFor(err) };
          }
        },
      },
    };
  } catch (err) {
    // An un-cleared verifier leaves a reCAPTCHA widget bound to the container,
    // and the next attempt then throws "already rendered" instead of retrying.
    verifier?.clear();
    return { ok: false, message: messageFor(err) };
  }
}
