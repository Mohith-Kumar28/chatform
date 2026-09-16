"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { PAYMENT_PROVIDER_LABELS, type PaymentProviderName } from "@repo/form-schema";
import { LockedControl } from "@/components/billing/gate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  PAYMENT_ACCOUNTS_KEY,
  PaymentAccountError,
  paymentAccountsFetch,
  type PaymentAccount,
  type PaymentAccountsPayload,
} from "./payment-accounts";

/**
 * Connecting a gateway account, one provider at a time.
 *
 * The money goes to the account connected here — the form admin's own — and
 * never through chatform. So the sheet's whole job is to get a credential for
 * that account onto the server with as little for the author to get wrong as
 * possible:
 *
 * - **Razorpay and Cashfree** are one button. Partner OAuth sends the author to
 *   the gateway to approve, and back to this tab; there is no key to copy.
 * - **Stripe** is a restricted key, pasted, because Connect is not open to an
 *   Indian platform. The steps say exactly which permissions to switch on, and
 *   a full secret key is refused before it leaves the browser — a key that can
 *   move money out of the account has no business being stored by a form tool.
 *
 * Rendered inside the Integrate tab's side sheet, like the webhook and
 * spreadsheet panels beside it.
 */

export const PAYMENT_SHEET_COPY: Record<PaymentProviderName, { title: string; description: string }> = {
  razorpay: {
    title: "Razorpay",
    description: "Take verified payments on your own Razorpay account. The money goes straight to you.",
  },
  cashfree: {
    title: "Cashfree",
    description: "Take verified payments on your own Cashfree account. The money goes straight to you.",
  },
  stripe: {
    title: "Stripe",
    description: "Take verified payments on your own Stripe account. The money goes straight to you.",
  },
};

const STATUS_LABEL: Record<PaymentAccount["status"], string> = {
  active: "Connected",
  needs_reconnect: "Needs reconnect",
  revoked: "Access revoked",
  disconnected: "Disconnected",
};

/** Where the author comes back to after approving on the gateway. */
function returnToHere(formId: string): string {
  return `${window.location.origin}/forms/${formId}/integrate`;
}

function useStartOAuth(provider: PaymentProviderName, formId: string) {
  return useMutation({
    mutationFn: () =>
      paymentAccountsFetch<{ url: string }>(`/api/payment-accounts/oauth/${provider}/start`, {
        method: "POST",
        body: JSON.stringify({ returnTo: returnToHere(formId) }),
      }),
    // A full navigation, not a popup: the gateway's consent screen refuses to be
    // framed, and a popup blocker would eat a window opened after an await.
    onSuccess: ({ url }) => window.location.assign(url),
    onError: (err: Error) => toast.error(err.message),
  });
}

export function PaymentAccountPanel({
  provider,
  formId,
  data,
}: {
  provider: PaymentProviderName;
  formId: string;
  data: PaymentAccountsPayload | undefined;
}) {
  const accounts = (data?.accounts ?? []).filter((a) => a.provider === provider);
  const configured = data?.providers[provider]?.configured ?? false;
  const label = PAYMENT_PROVIDER_LABELS[provider];

  return (
    <div className="space-y-5">
      {accounts.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-h3">Connected</h3>
          {accounts.map((account) => (
            <AccountRow key={account.id} account={account} formId={formId} />
          ))}
        </section>
      )}

      {accounts.length > 0 && <hr className="border-border" />}

      {/*
        Connecting more is the paid, rolled-out part. The rows above are not:
        a lapsed plan must still be able to see and remove what it connected.
      */}
      {!configured || data?.enabled === false ? (
        <div className="bg-muted/30 space-y-1 rounded-xl px-5 py-6 text-center">
          <Badge variant="secondary">{configured ? "Not available" : "Coming soon"}</Badge>
          <p className="text-muted-foreground text-body text-balance">
            {configured
              ? `Connecting ${label} isn't switched on for this organization.`
              : `Connecting ${label} isn't switched on yet.`}
          </p>
        </div>
      ) : (
        <LockedControl feature="collect_payments">
          {provider === "stripe" ? (
            <StripeConnect hasAccount={accounts.length > 0} />
          ) : (
            <OAuthConnect provider={provider} formId={formId} hasAccount={accounts.length > 0} />
          )}
        </LockedControl>
      )}
    </div>
  );
}

function AccountRow({ account, formId }: { account: PaymentAccount; formId: string }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const label = PAYMENT_PROVIDER_LABELS[account.provider];
  const reconnect = useStartOAuth(account.provider, formId);
  const broken = account.status === "needs_reconnect" || account.status === "revoked";

  const disconnect = useMutation({
    mutationFn: () => paymentAccountsFetch(`/api/payment-accounts/${account.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success(`${account.label} disconnected.`);
      void queryClient.invalidateQueries({ queryKey: PAYMENT_ACCOUNTS_KEY });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="bg-muted/30 space-y-2 rounded-xl p-3">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{account.label}</span>
        <Badge variant={account.environment === "test" ? "secondary" : "soft"}>
          {account.environment === "test" ? "Test" : "Live"}
        </Badge>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Disconnect ${account.label}`}
          onClick={() => setConfirming(true)}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      <dl className="text-caption grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        <dt className="text-muted-foreground">Status</dt>
        <dd className={cn(broken ? "text-destructive" : "text-[var(--success)]")}>{STATUS_LABEL[account.status]}</dd>
        {account.currencies.length > 0 && (
          <>
            <dt className="text-muted-foreground">Currencies</dt>
            <dd>{account.currencies.join(", ")}</dd>
          </>
        )}
        {account.formsUsing !== undefined && (
          <>
            <dt className="text-muted-foreground">Used by</dt>
            <dd>
              {account.formsUsing === 0
                ? "No forms yet"
                : `${account.formsUsing} form${account.formsUsing === 1 ? "" : "s"}`}
            </dd>
          </>
        )}
      </dl>

      {broken && (
        <div className="flex gap-2 rounded-lg bg-[var(--warning-soft)] px-3 py-2 text-[var(--warning-soft-foreground)]">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          <div className="text-caption min-w-0 flex-1 space-y-2">
            <p>
              {account.status === "revoked"
                ? `Chatform's access was removed in ${label}. Forms using this account can't take payments until you reconnect.`
                : `${label} stopped accepting Chatform's sign-in for this account. Forms using it can't take payments until you reconnect.`}
              {account.lastError ? ` (${account.lastError})` : ""}
            </p>
            {account.provider === "stripe" ? (
              <p>Create a new restricted key below and connect it.</p>
            ) : (
              <LockedControl feature="collect_payments" chip="inline">
                <Button size="sm" shape="pill" disabled={reconnect.isPending} onClick={() => reconnect.mutate()}>
                  <RefreshCw className="size-3.5" />
                  {reconnect.isPending ? "Opening…" : "Reconnect"}
                </Button>
              </LockedControl>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Disconnect ${account.label}?`}
        description={
          (account.formsUsing ?? 0) > 0
            ? `${account.formsUsing} form${account.formsUsing === 1 ? "" : "s"} take payments on this account and will stop until you pick another one. Payments already recorded stay in Results.`
            : "Chatform's access to the account is removed. Payments already recorded stay in Results."
        }
        confirmLabel="Disconnect"
        destructive
        // Spins until the server answers; a refusal is toasted by `onError`,
        // so the rejection is not left for the dialog to throw.
        onConfirm={() => disconnect.mutateAsync().then(() => undefined, () => undefined)}
      />
    </div>
  );
}

function OAuthConnect({
  provider,
  formId,
  hasAccount,
}: {
  provider: Exclude<PaymentProviderName, "stripe">;
  formId: string;
  hasAccount: boolean;
}) {
  const label = PAYMENT_PROVIDER_LABELS[provider];
  const start = useStartOAuth(provider, formId);

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <div>
          <h3 className="text-h3">{hasAccount ? "Connect another account" : `Connect ${label}`}</h3>
          <p className="text-muted-foreground text-caption">
            You&apos;ll approve Chatform on {label}, then come straight back here. No API keys to copy.
          </p>
        </div>
        <Button size="sm" shape="pill" disabled={start.isPending} onClick={() => start.mutate()}>
          {start.isPending ? "Opening…" : `Connect ${label}`}
          <ArrowUpRight className="size-3.5" />
        </Button>
      </section>

      {provider === "cashfree" && <CashfreeOnboard formId={formId} onUseOAuth={() => start.mutate()} />}
    </div>
  );
}

/**
 * The values are Cashfree's merchant business types as chatform sends them;
 * the labels are what an Indian business calls itself.
 */
const BUSINESS_TYPES = [
  { value: "individual", label: "Individual" },
  { value: "proprietorship", label: "Sole proprietorship" },
  { value: "partnership", label: "Partnership" },
  { value: "llp", label: "LLP" },
  { value: "private_limited", label: "Private limited company" },
  { value: "public_limited", label: "Public limited company" },
  { value: "trust", label: "Trust or NGO" },
  { value: "society", label: "Society" },
] as const;

/**
 * For an author with no Cashfree account yet. Cashfree creates one and hands
 * back its own sign-up and KYC page; if the email already has an account, the
 * answer is to connect it instead, which this says rather than failing.
 */
function CashfreeOnboard({ formId, onUseOAuth }: { formId: string; onUseOAuth: () => void }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState<string>("");
  const [existing, setExisting] = useState(false);
  /*
   * Cashfree's sign-up page, once it exists. Shown as a link to click rather than opened from
   * `onSuccess`: that runs after the round trip, outside the click, so Safari's popup blocker ate
   * the tab — and with `noopener` a blocked `window.open` and an opened one both return null, so
   * the toast said "in the new tab" either way and the link was lost unless the author submitted
   * again, which created the merchant a second time.
   */
  const [onboardingUrl, setOnboardingUrl] = useState<string | null>(null);

  const onboard = useMutation({
    mutationFn: () =>
      paymentAccountsFetch<{ onboardingUrl?: string; useOAuth?: boolean }>("/api/payment-accounts/cashfree/onboard", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim(),
          phone: phone.trim(),
          businessName: businessName.trim(),
          businessType,
          // Where Cashfree sends them once KYC is done: back here, to press Connect.
          returnTo: returnToHere(formId),
        }),
      }),
    onSuccess: (res) => {
      if (res.useOAuth) {
        setExisting(true);
        return;
      }
      if (res.onboardingUrl) setOnboardingUrl(res.onboardingUrl);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-muted-foreground hover:text-foreground text-caption font-medium underline-offset-4 hover:underline"
      >
        No Cashfree account? Create one
      </button>
    );
  }

  const ready = email.trim() && phone.trim() && businessName.trim() && businessType;

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-h3">Create a Cashfree account</h3>
        <p className="text-muted-foreground text-caption">
          Cashfree sets up the account and asks for your KYC documents on its own page.
        </p>
      </div>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) onboard.mutate();
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="cf-email">Business email</Label>
          <Input id="cf-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cf-phone">Phone</Label>
          <Input id="cf-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="9876543210" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cf-name">Business name</Label>
          <Input id="cf-name" value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cf-type">Business type</Label>
          <Select value={businessType} onValueChange={setBusinessType}>
            <SelectTrigger id="cf-type" className="w-full">
              <SelectValue placeholder="Choose one" />
            </SelectTrigger>
            <SelectContent>
              {BUSINESS_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {existing && (
          <p className="text-caption">
            That email already has a Cashfree account.{" "}
            <button type="button" className="text-primary font-medium hover:underline" onClick={onUseOAuth}>
              Connect it instead
            </button>
          </p>
        )}
        {onboardingUrl ? (
          <div className="space-y-2">
            <p className="text-caption">
              Cashfree has started your account. Finish sign-up and KYC on Cashfree, then press Connect Cashfree here.
            </p>
            <Button asChild size="sm" shape="pill">
              <a href={onboardingUrl} target="_blank" rel="noopener noreferrer">
                Continue on Cashfree
                <ArrowUpRight className="size-3.5" />
              </a>
            </Button>
          </div>
        ) : (
          <Button type="submit" size="sm" shape="pill" variant="outline" disabled={!ready || onboard.isPending}>
            {onboard.isPending ? "Creating…" : "Create account"}
          </Button>
        )}
      </form>
    </section>
  );
}

/** The permissions a restricted key needs, as Stripe's key editor names them. */
const STRIPE_PERMISSIONS = [
  { resource: "Accounts", access: "Read", why: "names the account and its currency" },
  { resource: "Checkout Sessions", access: "Write", why: "opens the checkout" },
  { resource: "Webhook Endpoints", access: "Write", why: "tells Chatform when a payment lands" },
  { resource: "Payment Intents", access: "Read", why: "checks a payment really went through" },
  { resource: "Charges", access: "Read", why: "notices a refund" },
] as const;

/** A code from `POST /api/payment-accounts/stripe`, in the author's words. */
export function stripeKeyError(code: string, message: string, permission?: string): string {
  switch (code) {
    case "full_secret_key":
      return "That's your full secret key (sk_…), which can move money out of your account. Create a restricted key (rk_…) in step 1 instead.";
    case "invalid_key":
      return "Stripe didn't accept that key. Check you copied all of it and that it hasn't been deleted.";
    case "missing_permission":
      // The server names the permission the way Stripe's key editor does; the
      // `rak_…` identifier appears nowhere the author can find it.
      return permission
        ? message || `The key is missing “${permission}”. Edit the key in Stripe, switch it on, and connect again.`
        : "The key is missing a permission from step 1. Edit the key in Stripe and connect again.";
    default:
      return message;
  }
}

function StripeConnect({ hasAccount }: { hasAccount: boolean }) {
  const queryClient = useQueryClient();
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  const connect = useMutation({
    mutationFn: (restrictedKey: string) =>
      paymentAccountsFetch<{ account: PaymentAccount }>("/api/payment-accounts/stripe", {
        method: "POST",
        body: JSON.stringify({ restrictedKey }),
      }),
    onSuccess: ({ account }) => {
      setKey("");
      setError(null);
      toast.success(`${account?.label ?? "Stripe account"} connected.`);
      void queryClient.invalidateQueries({ queryKey: PAYMENT_ACCOUNTS_KEY });
    },
    onError: (err: Error) =>
      setError(
        err instanceof PaymentAccountError ? stripeKeyError(err.code, err.message, err.permission) : err.message,
      ),
  });

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = key.trim();
        if (!trimmed) return;
        // Refused here too, so a full secret key is never sent at all.
        if (/^sk_(test|live)_/.test(trimmed)) {
          setError(stripeKeyError("full_secret_key", ""));
          return;
        }
        connect.mutate(trimmed);
      }}
    >
      <h3 className="text-h3">{hasAccount ? "Connect another Stripe account" : "Connect Stripe"}</h3>

      <ol className="space-y-4">
        <li className="flex gap-3">
          <StepNumber n={1} />
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-sm">
              <a
                href="https://dashboard.stripe.com/apikeys/create"
                target="_blank"
                rel="noreferrer"
                className="text-primary inline-flex items-center gap-0.5 font-medium hover:underline"
              >
                Open Stripe&apos;s restricted keys page
                <ArrowUpRight className="size-3.5" />
              </a>
              , name the key “Chatform”, and switch on:
            </p>
            <ul className="text-caption space-y-1">
              {STRIPE_PERMISSIONS.map((p) => (
                <li key={p.resource} className="flex flex-wrap gap-x-1.5">
                  <span className="font-medium">{p.resource}</span>
                  <span className="text-muted-foreground">— {p.access}, {p.why}</span>
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground text-micro">Leave everything else as None.</p>
          </div>
        </li>

        <li className="flex gap-3">
          <StepNumber n={2} />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label htmlFor="stripe-key">Paste the key</Label>
            <Input
              id="stripe-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
                setError(null);
              }}
              placeholder="rk_live_…"
              className="font-mono text-xs"
              aria-invalid={error ? true : undefined}
            />
            {error && <p className="text-caption text-destructive">{error}</p>}
          </div>
        </li>

        <li className="flex gap-3">
          <StepNumber n={3} />
          <div className="min-w-0 flex-1">
            <Button type="submit" size="sm" shape="pill" disabled={!key.trim() || connect.isPending}>
              {connect.isPending ? "Checking the key…" : "Connect"}
            </Button>
          </div>
        </li>
      </ol>
    </form>
  );
}

function StepNumber({ n }: { n: number }) {
  return (
    <span className="bg-muted text-muted-foreground grid size-6 shrink-0 place-items-center rounded-full text-xs font-medium">
      {n}
    </span>
  );
}
