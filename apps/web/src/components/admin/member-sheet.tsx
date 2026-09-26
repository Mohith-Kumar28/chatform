"use client";

import { ChevronRight } from "lucide-react";
import { countryFlag, countryName, DEVICE_LABELS } from "@repo/form-schema";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { InfoHint } from "@/components/ui/info-hint";
import { ResponseDetails, type ResponseMetadata } from "@/components/builder/response-details";
import { relativeDay } from "./format";

/**
 * One person on an account: where and on what they signed up, and every
 * sign-in since.
 *
 * The record is the one a response carries, built by the same API function
 * (`captureRequestContext`), so it renders with the response's own
 * `ResponseDetails` rather than a second layout that could drift from it.
 */

type Row = Record<string, unknown>;

interface SignInEvent {
  kind: string;
  method: string | null;
  at: number;
  context: ResponseMetadata;
}

interface SessionDevice {
  type: string | null;
  browser: string | null;
  os: string | null;
  osVersion: string | null;
}

const METHOD_LABELS: Record<string, string> = {
  email: "Email and password",
  "email-otp": "Email code",
  google: "Google",
};

const str = (r: Row, k: string) => (r[k] == null ? "" : String(r[k]));
const num = (r: Row, k: string) => Number(r[k] ?? 0);

function exact(ms: number): string {
  return new Date(ms).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" });
}

function place(c: ResponseMetadata | null | undefined): string | null {
  if (!c) return null;
  const country = countryName(c.geo.country);
  const where = [c.geo.city, country].filter(Boolean).join(", ");
  if (!where) return null;
  const flag = countryFlag(c.geo.country);
  return flag ? `${flag} ${where}` : where;
}

function deviceLine(d: { type: string | null; browser: string | null; os: string | null } | null | undefined) {
  if (!d) return null;
  const parts = [d.type ? (DEVICE_LABELS[d.type] ?? d.type) : null, d.browser, d.os].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function memberSignup(m: Row): SignInEvent | null {
  return (m.signup as SignInEvent | null | undefined) ?? null;
}

/** "🇮🇳 Bengaluru, India" for where a member signed up, when it was recorded. */
export function signupPlace(m: Row): string | null {
  return place(memberSignup(m)?.context);
}

export function MemberRow({ member, onOpen }: { member: Row; onOpen: () => void }) {
  const where = signupPlace(member);
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="hover:bg-muted/60 -mx-2 flex w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm transition-colors duration-[var(--duration-micro)]"
      >
        <span className="min-w-0">
          <span className="block truncate">{str(member, "name") || str(member, "email")}</span>
          <span className="text-muted-foreground text-micro block truncate">
            {str(member, "email")}
            {where && ` · ${where}`}
          </span>
        </span>
        <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs">
          {str(member, "role")} · seen {relativeDay(num(member, "last_session_at"))}
          <ChevronRight className="size-3.5" strokeWidth={2} aria-hidden />
        </span>
      </button>
    </li>
  );
}

export function MemberSheet({ member, onClose }: { member: Row | null; onClose: () => void }) {
  return (
    <Sheet open={member !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-lg">
        {member && <MemberBody member={member} />}
      </SheetContent>
    </Sheet>
  );
}

function MemberBody({ member }: { member: Row }) {
  const signup = memberSignup(member);
  const signIns = (member.sign_ins as SignInEvent[] | undefined) ?? [];
  const sessionDevice = member.session_device as SessionDevice | null | undefined;
  const latest = signIns[0] ?? signup;

  const summary: Array<[string, string | null]> = [
    ["Role", str(member, "role") || null],
    ["Email verified", member.email_verified ? "Yes" : "No"],
    ["Signed up", exact(num(member, "created_at"))],
    ["Signed up with", signup?.method ? (METHOD_LABELS[signup.method] ?? signup.method) : null],
    ["Signed up from", place(signup?.context)],
    ["Last seen", member.last_session_at ? exact(num(member, "last_session_at")) : null],
    ["Last seen from", place(latest?.context)],
    ["Sign-ins recorded", String(num(member, "sign_in_count"))],
  ];

  return (
    <>
      <SheetHeader className="border-b px-4 py-3.5">
        <SheetTitle className="text-sm">{str(member, "name") || str(member, "email")}</SheetTitle>
        <SheetDescription className="text-xs">{str(member, "name") ? str(member, "email") : str(member, "role")}</SheetDescription>
      </SheetHeader>

      <div className="space-y-8 px-4 py-4">
        <dl className="divide-y">
          {summary
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <div key={label} className="flex gap-4 py-2 first:pt-0">
                <dt className="text-muted-foreground text-caption w-32 shrink-0 pt-0.5">{label}</dt>
                <dd className="min-w-0 flex-1 text-sm font-medium break-words">{value}</dd>
              </div>
            ))}
        </dl>

        <section>
          <h3 className="mb-3 flex items-center gap-1 text-sm font-medium">
            {signup ? "Sign-up" : "Latest device"}
            {!signup && (
              <InfoHint label="Why this is empty" align="start">
                This account signed up before sign-up details were recorded. The device below is from their
                latest session.
              </InfoHint>
            )}
          </h3>
          {signup ? (
            <ResponseDetails metadata={signup.context} at={signup.at} subject="user" />
          ) : deviceLine(sessionDevice) ? (
            <div className="flex gap-4">
              <span className="text-muted-foreground text-caption w-32 shrink-0 pt-0.5">Device</span>
              <span className="text-sm font-medium">{deviceLine(sessionDevice)}</span>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">Not recorded.</p>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-sm font-medium">Recent sign-ins</h3>
          {signIns.length === 0 ? (
            <p className="text-muted-foreground text-sm">None recorded yet.</p>
          ) : (
            <ul className="divide-y">
              {signIns.map((e, i) => (
                <li key={i}>
                  <details className="group py-2">
                    <summary className="flex cursor-pointer list-none items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0">
                        <span className="block truncate">{place(e.context) ?? "Unknown location"}</span>
                        <span className="text-muted-foreground text-micro block truncate">
                          {[deviceLine(e.context.device), e.context.network.organization].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs">
                        {exact(e.at)}
                        <ChevronRight
                          className="size-3.5 transition-transform duration-[var(--duration-micro)] group-open:rotate-90"
                          strokeWidth={2}
                          aria-hidden
                        />
                      </span>
                    </summary>
                    <div className="pt-3">
                      <ResponseDetails metadata={e.context} at={e.at} subject="user" />
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
