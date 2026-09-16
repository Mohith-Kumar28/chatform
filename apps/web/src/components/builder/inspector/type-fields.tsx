"use client";

import Link from "next/link";
import { ArrowUpRight, ShieldCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import {
  isValidUpiId,
  parseEmailDomains,
  PAYMENT_PROVIDER_LABELS,
  UPI_CURRENCY,
  type Block,
} from "@repo/form-schema";
import { LockedControl } from "@/components/billing/gate";
import { Button } from "@/components/ui/button";
import { InfoHint } from "@/components/ui/info-hint";
import {
  accountName,
  INR_ONLY_PROVIDERS,
  usePaymentAccounts,
  type PaymentAccount,
} from "@/components/integrations/payment-accounts";
import { useBuilderStore } from "@/stores/builder-store";
import { DomainsHelp, GroupFieldsEditor, PatternHelp, patternIsValid } from "./group-fields";
import {
  CheckboxGroup,
  Field,
  ListEditor,
  NumberField,
  SelectField,
  SwitchField,
  TextField,
} from "./fields";

const uid = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;

/**
 * Type-specific inspector fields.
 *
 * The previous inspector rendered exactly three controls — title, description,
 * required — for all 26 block types, so every other field in the schema was
 * unreachable from the UI: length limits, placeholders, min/max, allowOther,
 * selection counts, rating shape, scale bounds, accepted file types, currency,
 * consent text, button labels, business-only email, and more.
 *
 * `patch` is a partial update applied through the store, which handles history
 * and coalescing. Every control passes a coalesce key so a burst of typing
 * collapses into a single undo step.
 */
export function TypeFields({
  block,
  patch,
}: {
  block: Block;
  patch: (p: Partial<Block>, coalesceKey?: string) => void;
}) {
  const key = (field: string) => `${field}:${block.ref}`;

  switch (block.type) {
    case "welcome":
    case "statement":
      return (
        <TextField
          label="Button text"
          inspect="button"
          value={block.buttonLabel}
          onChange={(v) => patch({ buttonLabel: v } as Partial<Block>, key("buttonLabel"))}
          maxLength={60}
        />
      );

    case "short_text":
    case "long_text":
      return (
        <>
          <TextField
            label="Placeholder"
            inspect="placeholder"
            value={block.placeholder ?? ""}
            onChange={(v) => patch({ placeholder: v || undefined } as Partial<Block>, key("placeholder"))}
            maxLength={200}
          />
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="Min length"
              value={block.minLength}
              min={0}
              onChange={(v) => patch({ minLength: v ?? 0 } as Partial<Block>, key("minLength"))}
            />
            <NumberField
              label="Max length"
              value={block.maxLength}
              min={1}
              onChange={(v) => patch({ maxLength: v ?? 500 } as Partial<Block>, key("maxLength"))}
            />
          </div>
          {block.type === "short_text" && (
            <>
              <TextField
                label="Pattern"
                help={<PatternHelp />}
                error={
                  block.pattern && !patternIsValid(block.pattern) ? "Invalid pattern" : undefined
                }
                placeholder="^[0-9]{10}$"
                className="font-mono text-xs"
                value={block.pattern ?? ""}
                onChange={(v) => patch({ pattern: v || undefined } as Partial<Block>, key("pattern"))}
              />
              <UniqueField checked={block.unique} patch={patch} />
            </>
          )}
        </>
      );

    case "email":
      return (
        <>
          <EmailRuleFields
            businessOnly={block.businessOnly}
            allowedDomains={block.allowedDomains}
            onChange={(next) => patch(next as Partial<Block>, key("emailRules"))}
          />
          <VerifyField
            label="Verify by email code"
            checked={block.verify}
            patch={patch}
          />
          <UniqueField checked={block.unique} patch={patch} />
        </>
      );

    case "url":
      return <UniqueField checked={block.unique} patch={patch} />;

    case "phone":
      return (
        <>
          <TextField
            label="Country code"
            placeholder="IN"
            value={block.countryHint ?? ""}
            onChange={(v) =>
              patch({ countryHint: v.toUpperCase().slice(0, 2) || undefined } as Partial<Block>, key("countryHint"))
            }
            maxLength={2}
          />
          <VerifyField
            label="Verify by SMS code"
            checked={block.verify}
            patch={patch}
          />
          <UniqueField checked={block.unique} patch={patch} />
        </>
      );

    case "number":
      return (
        <>
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="Minimum"
              value={block.min}
              placeholder="None"
              onChange={(v) => patch({ min: v } as Partial<Block>, key("min"))}
            />
            <NumberField
              label="Maximum"
              value={block.max}
              placeholder="None"
              onChange={(v) => patch({ max: v } as Partial<Block>, key("max"))}
            />
          </div>
          <SwitchField
            label="Whole numbers only"
            checked={block.integerOnly}
            onChange={(v) => patch({ integerOnly: v } as Partial<Block>)}
          />
          <TextField
            label="Currency"
            placeholder="INR"
            value={block.currency ?? ""}
            onChange={(v) =>
              patch({ currency: v.toUpperCase().slice(0, 3) || undefined } as Partial<Block>, key("currency"))
            }
            maxLength={3}
          />
          <UniqueField checked={block.unique} patch={patch} />
        </>
      );

    case "date":
      return (
        <>
          <SelectField
            label="Display format"
            value={block.dateFormat}
            onChange={(v) => patch({ dateFormat: v } as Partial<Block>)}
            options={[
              { value: "YYYY-MM-DD", label: "2026-03-04" },
              { value: "DD/MM/YYYY", label: "04/03/2026" },
              { value: "MM/DD/YYYY", label: "03/04/2026" },
            ]}
          />
          <SwitchField
            label="No past dates"
            checked={block.disablePast}
            onChange={(v) => patch({ disablePast: v } as Partial<Block>)}
          />
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label="Earliest"
              placeholder="YYYY-MM-DD"
              value={block.min ?? ""}
              onChange={(v) => patch({ min: v || undefined } as Partial<Block>, key("dmin"))}
            />
            <TextField
              label="Latest"
              placeholder="YYYY-MM-DD"
              value={block.max ?? ""}
              onChange={(v) => patch({ max: v || undefined } as Partial<Block>, key("dmax"))}
            />
          </div>

          {/* A date plus a time is an appointment, which is what most people
              reach for a date question to arrange. Off by default so an
              existing block keeps storing a plain day. */}
          <SwitchField
            label="Also ask for a time"
            checked={block.includeTime}
            onChange={(v) => patch({ includeTime: v } as Partial<Block>)}
          />
          {block.includeTime && (
            <div className="grid grid-cols-3 gap-3">
              <TextField
                label="From"
                placeholder="09:00"
                value={block.timeMin}
                onChange={(v) => patch({ timeMin: v } as Partial<Block>, key("tmin"))}
              />
              <TextField
                label="To"
                placeholder="17:00"
                value={block.timeMax}
                onChange={(v) => patch({ timeMax: v } as Partial<Block>, key("tmax"))}
              />
              <SelectField
                label="Every"
                value={String(block.timeStepMinutes)}
                onChange={(v) => patch({ timeStepMinutes: Number(v) } as Partial<Block>)}
                options={[
                  { value: "15", label: "15 min" },
                  { value: "30", label: "30 min" },
                  { value: "60", label: "1 hour" },
                ]}
              />
            </div>
          )}
        </>
      );

    case "yes_no":
      return (
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Yes label"
            value={block.yesLabel}
            onChange={(v) => patch({ yesLabel: v } as Partial<Block>, key("yes"))}
            maxLength={40}
          />
          <TextField
            label="No label"
            value={block.noLabel}
            onChange={(v) => patch({ noLabel: v } as Partial<Block>, key("no"))}
            maxLength={40}
          />
        </div>
      );

    case "single_select":
    case "multi_select":
    case "dropdown":
    case "picture_choice":
      return (
        <>
          <ListEditor
            label="Options"
            inspect="options"
            items={block.options}
            onChange={(items) =>
              patch({
                options: items.map((i) => {
                  const existing = block.options.find((o) => o.id === i.id);
                  return existing ? { ...existing, label: i.label } : { ...i, image_key: null };
                }),
              } as Partial<Block>)
            }
            makeItem={() => ({ id: uid("opt"), label: "" })}
          />
          {(block.type === "single_select" || block.type === "multi_select") && (
            <SwitchField
              label={'Allow "Other"'}
              checked={block.allowOther}
              onChange={(v) => patch({ allowOther: v } as Partial<Block>)}
            />
          )}
          {block.type === "multi_select" && (
            <div className="grid grid-cols-2 gap-3">
              <NumberField
                label="Min selections"
                value={block.minSelections}
                min={0}
                onChange={(v) => patch({ minSelections: v ?? 1 } as Partial<Block>, key("minSel"))}
              />
              <NumberField
                label="Max selections"
                value={block.maxSelections}
                min={1}
                onChange={(v) => patch({ maxSelections: v ?? 10 } as Partial<Block>, key("maxSel"))}
              />
            </div>
          )}
          {block.type === "picture_choice" && (
            <SwitchField
              label="Allow multiple"
              checked={block.multiSelect}
              onChange={(v) => patch({ multiSelect: v } as Partial<Block>)}
            />
          )}
        </>
      );

    case "ranking":
      return (
        <ListEditor
          label="Items to rank"
          items={block.items}
          onChange={(items) => patch({ items } as Partial<Block>)}
          makeItem={() => ({ id: uid("itm"), label: "" })}
          minItems={2}
          addLabel="Add item"
        />
      );

    case "matrix":
      return (
        <>
          <ListEditor
            label="Rows"
            items={block.rows}
            onChange={(rows) => patch({ rows } as Partial<Block>)}
            makeItem={() => ({ id: uid("row"), label: "" })}
            addLabel="Add row"
          />
          <ListEditor
            label="Columns"
            items={block.columns}
            onChange={(columns) => patch({ columns } as Partial<Block>)}
            makeItem={() => ({ id: uid("col"), label: "" })}
            minItems={2}
            addLabel="Add column"
          />
          <SwitchField
            label="Multiple answers per row"
            checked={block.multiplePerRow}
            onChange={(v) => patch({ multiplePerRow: v } as Partial<Block>)}
          />
        </>
      );

    case "rating":
      return (
        <>
          <NumberField
            label="Scale"
            value={block.scale}
            min={1}
            max={10}
            onChange={(v) => patch({ scale: Math.min(10, Math.max(1, v ?? 5)) } as Partial<Block>)}
          />
          <SelectField
            label="Shape"
            value={block.shape}
            onChange={(v) => patch({ shape: v } as Partial<Block>)}
            options={[
              { value: "star", label: "Stars" },
              { value: "heart", label: "Hearts" },
              { value: "number", label: "Numbers" },
            ]}
          />
        </>
      );

    case "nps":
      return (
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="0 label"
            value={block.labelLow}
            onChange={(v) => patch({ labelLow: v } as Partial<Block>, key("low"))}
          />
          <TextField
            label="10 label"
            value={block.labelHigh}
            onChange={(v) => patch({ labelHigh: v } as Partial<Block>, key("high"))}
          />
        </div>
      );

    case "opinion_scale":
      return (
        <>
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="Steps"
              value={block.steps}
              min={2}
              max={11}
              onChange={(v) => patch({ steps: Math.min(11, Math.max(2, v ?? 10)) } as Partial<Block>)}
            />
            <SelectField
              label="Starts at"
              value={String(block.startAt) as "0" | "1"}
              onChange={(v) => patch({ startAt: Number(v) as 0 | 1 } as Partial<Block>)}
              options={[
                { value: "0", label: "0" },
                { value: "1", label: "1" },
              ]}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label="Low label"
              value={block.labelLow ?? ""}
              onChange={(v) => patch({ labelLow: v || undefined } as Partial<Block>, key("low"))}
            />
            <TextField
              label="High label"
              value={block.labelHigh ?? ""}
              onChange={(v) => patch({ labelHigh: v || undefined } as Partial<Block>, key("high"))}
            />
          </div>
        </>
      );

    case "file_upload":
      return (
        <>
          <CheckboxGroup
            label="Accepted types"
            value={block.accept}
            onChange={(accept) => patch({ accept } as Partial<Block>)}
            options={[
              { value: "image/png", label: "PNG" },
              { value: "image/jpeg", label: "JPEG" },
              { value: "application/pdf", label: "PDF" },
              { value: "text/csv", label: "CSV" },
              { value: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", label: "Word" },
              { value: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", label: "Excel" },
              { value: "audio/mpeg", label: "MP3" },
              { value: "video/mp4", label: "MP4" },
            ]}
          />
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="Max files"
              value={block.maxFiles}
              min={1}
              max={10}
              onChange={(v) => patch({ maxFiles: Math.min(10, Math.max(1, v ?? 1)) } as Partial<Block>)}
            />
            <NumberField
              label="Max size (MB)"
              value={block.maxSizeMB}
              min={1}
              max={25}
              onChange={(v) => patch({ maxSizeMB: Math.min(25, Math.max(1, v ?? 10)) } as Partial<Block>)}
            />
          </div>
        </>
      );

    case "signature":
      return (
        <SwitchField
          label="Require a typed name"
          checked={block.drawnNameRequired}
          onChange={(v) => patch({ drawnNameRequired: v } as Partial<Block>)}
        />
      );

    case "payment":
      return <PaymentFields block={block} patch={patch} />;

    case "scheduling":
      return (
        <TextField
          label="Booking link"
          value={block.url}
          placeholder="https://cal.com/your-handle"
          onChange={(v) => patch({ url: v } as Partial<Block>, key("url"))}
        />
      );

    case "contact_info": {
      /*
        The rules only appear for the fields that are switched on. A domain box
        under a contact block that is not collecting an email is a control that
        cannot do anything, and the author has no way to know that from looking
        at it.
      */
      const options = block.fieldOptions;
      return (
        <>
          <CheckboxGroup
            label="Fields to collect"
            value={block.fields}
            onChange={(fields) => patch({ fields } as Partial<Block>)}
            options={[
              { value: "first_name", label: "First name" },
              { value: "last_name", label: "Last name" },
              { value: "email", label: "Email" },
              { value: "phone", label: "Phone" },
            ]}
          />
          {block.fields.includes("email") && (
            <EmailRuleFields
              businessOnly={options?.email?.businessOnly ?? false}
              allowedDomains={options?.email?.allowedDomains ?? []}
              onChange={(next) =>
                patch(
                  {
                    fieldOptions: {
                      ...options,
                      email: {
                        businessOnly: options?.email?.businessOnly ?? false,
                        allowedDomains: options?.email?.allowedDomains ?? [],
                        ...next,
                      },
                    },
                  } as Partial<Block>,
                  key("emailRules"),
                )
              }
            />
          )}
          {block.fields.includes("phone") && (
            <TextField
              label="Country code"
              placeholder="IN"
              value={options?.phone?.countryHint ?? ""}
              onChange={(v) =>
                patch(
                  {
                    fieldOptions: {
                      ...options,
                      phone: { countryHint: v.toUpperCase().slice(0, 2) || undefined },
                    },
                  } as Partial<Block>,
                  key("countryHint"),
                )
              }
              maxLength={2}
              help={<CountryCodeHelp />}
            />
          )}
        </>
      );
    }

    case "address":
      return (
        <CheckboxGroup
          label="Fields to collect"
          value={block.fields}
          onChange={(fields) => patch({ fields } as Partial<Block>)}
          options={[
            { value: "street", label: "Street" },
            { value: "city", label: "City" },
            { value: "state", label: "State" },
            { value: "postal", label: "Postal code" },
            { value: "country", label: "Country" },
          ]}
        />
      );

    case "field_group":
      return (
        <>
          <TextField
            label="Entry name"
            placeholder="Team member"
            value={block.itemLabel}
            onChange={(v) => patch({ itemLabel: v || "Entry" } as Partial<Block>, key("itemLabel"))}
            maxLength={60}
          />
          <div className="grid grid-cols-2 gap-3">
            {/*
              The floor is how many rows are already on screen, not just a
              minimum the respondent discovers by trying to continue: an author
              who says "at least two" wants two boxes waiting.
            */}
            <NumberField
              label="Min entries"
              value={block.minEntries}
              min={1}
              max={20}
              onChange={(v) => {
                const min = Math.min(20, Math.max(1, v ?? 1));
                patch(
                  {
                    minEntries: min,
                    ...(min > block.maxEntries ? { maxEntries: min } : {}),
                  } as Partial<Block>,
                  key("minEntries"),
                );
              }}
            />
            <NumberField
              label="Max entries"
              value={block.maxEntries}
              min={1}
              max={20}
              onChange={(v) => {
                const max = Math.min(20, Math.max(1, v ?? 5));
                patch(
                  {
                    maxEntries: max,
                    ...(max < block.minEntries ? { minEntries: max } : {}),
                  } as Partial<Block>,
                  key("maxEntries"),
                );
              }}
            />
          </div>
          <GroupFieldsEditor block={block} patch={patch} />
        </>
      );

    case "legal_consent":
      return (
        <>
          <TextField
            label="Consent text"
            value={block.consentText}
            onChange={(v) => patch({ consentText: v } as Partial<Block>, key("consent"))}
            multiline
            maxLength={10000}
          />
          <SwitchField
            label="Allow decline"
            checked={block.allowDecline}
            onChange={(v) => patch({ allowDecline: v } as Partial<Block>, key("decline"))}
          />
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label="Agree label"
              value={block.agreeLabel}
              onChange={(v) => patch({ agreeLabel: v } as Partial<Block>, key("agreelabel"))}
              maxLength={40}
            />
            {/* Shown regardless, so the wording can be set before the switch is
                flipped — and so the pair reads as a pair. */}
            <TextField
              label="Decline label"
              value={block.declineLabel}
              onChange={(v) => patch({ declineLabel: v } as Partial<Block>, key("declinelabel"))}
              maxLength={40}
            />
          </div>
        </>
      );

    default:
      return null;
  }
}

type PaymentBlock = Extract<Block, { type: "payment" }>;

/** Radix refuses an empty item value, so "no account picked" needs a name. */
const NO_ACCOUNT = "__none";

/**
 * The currency a block should carry once it charges on `account`.
 *
 * Cashfree and Razorpay are rupees only, exactly as UPI is, so picking one of
 * them snaps the currency to INR the way switching to UPI always has. A Stripe
 * account presents in any of Stripe's currencies whatever its default is — the
 * one currency the API lists for it is only that default — so a block moving
 * onto Stripe keeps the currency it already had.
 */
function currencyFor(account: PaymentAccount | undefined, current: string): string | undefined {
  if (!account) return undefined;
  if (INR_ONLY_PROVIDERS.has(account.provider)) return current === "INR" ? undefined : "INR";
  return undefined;
}

/**
 * The payment block's fields.
 *
 * Three methods, and the labels say which kind of trust each one buys, because
 * an author picks between them once and then reads results for months:
 * "Verified checkout" is confirmed by the admin's own gateway before the chat
 * moves on; a payment link and a UPI QR record that the respondent *said* they
 * paid. Existing forms keep the manual methods, under names that are honest
 * about them.
 *
 * Verified checkout is offered only where the rollout flag is on for the
 * organization — and still shown on a block that already uses it, so a flag
 * turned off never leaves a select with nothing selected.
 */
function PaymentFields({
  block,
  patch,
}: {
  block: PaymentBlock;
  patch: (p: Partial<Block>, coalesceKey?: string) => void;
}) {
  const key = (field: string) => `${field}:${block.ref}`;
  const { data, isPending } = usePaymentAccounts();
  const gateway = block.method === "gateway";
  const accounts = data?.accounts ?? [];
  const account = accounts.find((a) => a.id === block.paymentAccountId);
  /*
   * Whether the empty list means anything. While the query is in flight, and when the read
   * failed (`readAccounts` answers with `unavailable` rather than throwing, so a passive read
   * never throws a paywall or a toast at an author), "no accounts" is not a fact — and the
   * picker's messages are accusations about the author's setup. Until it is a fact they say
   * nothing, and the method list keeps whatever the block already uses.
   */
  const known = !isPending && data !== undefined && data.unavailable !== true;

  const methodOptions = [
    ...(data?.enabled || gateway ? [{ value: "gateway" as const, label: "Verified checkout (recommended)" }] : []),
    { value: "link" as const, label: "Payment link (manual, unverified)" },
    { value: "upi" as const, label: "UPI QR (manual, unverified)" },
  ];

  const chooseAccount = (next: PaymentAccount | undefined) => {
    const currency = currencyFor(next, block.currency);
    patch({ paymentAccountId: next?.id, ...(currency ? { currency } : {}) } as Partial<Block>);
  };

  return (
    <>
      <SelectField
        label="Method"
        value={block.method}
        onChange={(v) => {
          if (v === "gateway") {
            // One account connected is the account; making the author pick it
            // from a list of one is a step that can only be got wrong.
            const only = !block.paymentAccountId && accounts.length === 1 ? accounts[0] : undefined;
            const chosen = only ?? account;
            const currency = currencyFor(chosen, block.currency);
            patch({
              method: v,
              ...(only ? { paymentAccountId: only.id } : {}),
              ...(currency ? { currency } : {}),
            } as Partial<Block>);
            return;
          }
          patch({
            method: v,
            // UPI settles in rupees only, so switching to it and leaving the
            // currency at USD would show a price nobody can actually be charged.
            ...(v === "upi" && block.currency !== UPI_CURRENCY ? { currency: UPI_CURRENCY } : {}),
          } as Partial<Block>);
        }}
        options={methodOptions}
      />

      {gateway ? (
        <LockedControl feature="collect_payments">
          <div className="space-y-6">
            <SignInNotice />
            <AccountPicker
              accounts={accounts}
              account={account}
              selectedId={block.paymentAccountId}
              known={known}
              onChange={chooseAccount}
            />
            <AmountFields block={block} patch={patch} gateway />
            <CurrencyField block={block} account={account} patch={patch} />
          </div>
        </LockedControl>
      ) : (
        <>
          {block.method === "upi" ? (
            <>
              <TextField
                label="UPI ID"
                value={block.upiId ?? ""}
                placeholder="acme@okhdfcbank"
                onChange={(v) => patch({ upiId: v.trim() || undefined } as Partial<Block>, key("upi"))}
              />
              {block.upiId && !isValidUpiId(block.upiId) ? (
                <p className="text-destructive -mt-4 text-xs">Use the name@bank format</p>
              ) : null}
              <TextField
                label="Payee name"
                value={block.upiPayeeName ?? ""}
                onChange={(v) => patch({ upiPayeeName: v || undefined } as Partial<Block>, key("payee"))}
              />
            </>
          ) : (
            <TextField
              label="Payment link"
              value={block.url ?? ""}
              placeholder="https://rzp.io/l/…"
              onChange={(v) => patch({ url: v.trim() || undefined } as Partial<Block>, key("url"))}
            />
          )}
          <AmountFields block={block} patch={patch} />
          <TextField
            label="Currency"
            value={block.currency}
            onChange={(v) => patch({ currency: v.toUpperCase().slice(0, 3) } as Partial<Block>, key("cur"))}
            maxLength={3}
          />
        </>
      )}
    </>
  );
}

/**
 * Verified payments need to know who paid, so the form needs sign-in — and
 * publishing refuses a gateway block on a form without it. Said here, where the
 * block is being set up, with the one click that fixes it, rather than as a
 * publish error an author meets later and has to trace back.
 *
 * The switch goes through the builder store like any other edit, so it lands
 * in undo history and autosaves with everything else. The method stays
 * whatever the form had (Google unless changed), which Settings → Access can
 * change.
 */
function SignInNotice() {
  const signInOn = useBuilderStore((s) => s.doc?.settings.requireAuth.enabled ?? true);
  const edit = useBuilderStore((s) => s.edit);
  if (signInOn) return null;
  return (
    <div className="flex gap-2 rounded-lg bg-[var(--warning-soft)] px-3 py-2.5 text-[var(--warning-soft-foreground)]">
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
      <div className="min-w-0 flex-1 space-y-2 text-xs leading-relaxed">
        <p>Payments need respondents to sign in (Google or phone) so every payment is tied to a real person.</p>
        <LockedControl feature="respondent_auth_google" chip="inline">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              edit((d) => {
                d.settings.requireAuth.enabled = true;
              });
              toast.success("Sign-in is on. Choose Google or phone in Settings → Access.");
            }}
          >
            <ShieldCheck className="size-3.5" />
            Turn on sign-in
          </Button>
        </LockedControl>
      </div>
    </div>
  );
}

function AccountPicker({
  accounts,
  account,
  selectedId,
  known,
  onChange,
}: {
  accounts: PaymentAccount[];
  account: PaymentAccount | undefined;
  selectedId: string | undefined;
  /** The account list is a fact, not a query still in flight or one that failed. */
  known: boolean;
  onChange: (account: PaymentAccount | undefined) => void;
}) {
  const formId = useBuilderStore((s) => s.formId);
  const integrate = `/forms/${formId}/integrate#payments`;

  if (!known && accounts.length === 0) {
    return (
      <Field label="Payment account">
        <p className="text-muted-foreground text-xs">Checking connected accounts…</p>
      </Field>
    );
  }

  if (accounts.length === 0) {
    return (
      <Field label="Payment account">
        {/*
         * A link, drawn as one. Outline + full width + left-aligned is the shape
         * of every select beside it in this panel, so the one control here that
         * goes somewhere read as an input nobody had filled in.
         */}
        <Button variant="secondary" size="sm" asChild className="w-fit gap-1.5">
          <Link href={integrate}>
            Connect a payment account
            <ArrowUpRight className="size-3.5" aria-hidden />
          </Link>
        </Button>
        {selectedId && (
          <p className="text-destructive text-xs">The account this question used is no longer connected.</p>
        )}
      </Field>
    );
  }

  const options = [
    ...(selectedId ? [] : [{ value: NO_ACCOUNT, label: "Choose an account" }]),
    ...(selectedId && !account ? [{ value: selectedId, label: "No longer connected" }] : []),
    ...accounts.map((a) => ({ value: a.id, label: accountName(a, PAYMENT_PROVIDER_LABELS[a.provider]) })),
  ];

  return (
    <div className="space-y-2">
      <SelectField
        label="Payment account"
        value={selectedId ?? NO_ACCOUNT}
        onChange={(v) => onChange(accounts.find((a) => a.id === v))}
        options={options}
      />
      {selectedId && !account && (
        <p className="text-destructive text-xs">That account was disconnected. Pick another one.</p>
      )}
      {account && account.status !== "active" && (
        <p className="text-destructive text-xs">
          This account needs reconnecting before it can take payments.{" "}
          <Link href={integrate} className="underline">
            Open Integrate
          </Link>
        </p>
      )}
      <Link href={integrate} className="text-muted-foreground hover:text-foreground block text-xs">
        Manage payment accounts
      </Link>
    </div>
  );
}

/**
 * Fixed, or read from a variable.
 *
 * For verified checkout the variable is picked from the form's own variables
 * and bounded: a variable is computed from answers, and a bound is what stops
 * a "pay what you like" that resolves to ₹0.01 from reaching a gateway.
 * Manual methods keep the free-text name they always had.
 */
function AmountFields({
  block,
  patch,
  gateway = false,
}: {
  block: PaymentBlock;
  patch: (p: Partial<Block>, coalesceKey?: string) => void;
  gateway?: boolean;
}) {
  const key = (field: string) => `${field}:${block.ref}`;
  const variables = useBuilderStore((s) => s.doc?.variables ?? []);
  const pickable = gateway && variables.length > 0;

  return (
    <>
      <SelectField
        label="Amount type"
        value={block.amountMode}
        onChange={(v) => patch({ amountMode: v } as Partial<Block>)}
        options={[
          { value: "fixed", label: "Fixed" },
          { value: "variable", label: "From a variable" },
        ]}
      />
      {block.amountMode === "fixed" ? (
        <NumberField
          label="Amount"
          value={block.amount}
          min={0}
          onChange={(v) => patch({ amount: v } as Partial<Block>, key("amount"))}
        />
      ) : (
        <>
          {pickable ? (
            <SelectField
              label="Variable"
              value={block.amountVariable ?? NO_ACCOUNT}
              onChange={(v) => patch({ amountVariable: v === NO_ACCOUNT ? undefined : v } as Partial<Block>)}
              options={[
                ...(block.amountVariable ? [] : [{ value: NO_ACCOUNT, label: "Choose a variable" }]),
                ...(block.amountVariable && !variables.some((v) => v.name === block.amountVariable)
                  ? [{ value: block.amountVariable, label: `${block.amountVariable} (missing)` }]
                  : []),
                ...variables.map((v) => ({ value: v.name, label: v.name })),
              ]}
            />
          ) : (
            <TextField
              label="Variable name"
              value={block.amountVariable ?? ""}
              onChange={(v) => patch({ amountVariable: v || undefined } as Partial<Block>, key("amountVar"))}
            />
          )}
          {gateway && (
            <div className="grid grid-cols-2 gap-3">
              <NumberField
                label="Minimum amount"
                value={block.minAmount}
                min={0}
                placeholder="None"
                onChange={(v) => patch({ minAmount: v } as Partial<Block>, key("minAmount"))}
              />
              <NumberField
                label="Maximum amount"
                value={block.maxAmount}
                min={0}
                placeholder="None"
                onChange={(v) => patch({ maxAmount: v } as Partial<Block>, key("maxAmount"))}
              />
            </div>
          )}
        </>
      )}
    </>
  );
}

/** Pinned to INR on a rupee-only gateway; free text otherwise, Stripe included (see `currencyFor`). */
function CurrencyField({
  block,
  account,
  patch,
}: {
  block: PaymentBlock;
  account: PaymentAccount | undefined;
  patch: (p: Partial<Block>, coalesceKey?: string) => void;
}) {
  const current = block.currency.toUpperCase();
  const supported = account && INR_ONLY_PROVIDERS.has(account.provider) ? ["INR"] : [];

  if (supported.length === 0) {
    return (
      <TextField
        label="Currency"
        value={block.currency}
        onChange={(v) => patch({ currency: v.toUpperCase().slice(0, 3) } as Partial<Block>, `cur:${block.ref}`)}
        maxLength={3}
      />
    );
  }

  return (
    <div className="space-y-2">
      <SelectField
        label="Currency"
        value={current}
        onChange={(v) => patch({ currency: v } as Partial<Block>)}
        options={[
          ...(supported.includes(current) ? [] : [{ value: current, label: `${current} (not supported)` }]),
          ...supported.map((c) => ({ value: c, label: c })),
        ]}
      />
      {!supported.includes(current) && (
        <p className="text-destructive text-xs">
          {PAYMENT_PROVIDER_LABELS[account!.provider]} can&apos;t charge in {current} on this account.
        </p>
      )}
    </div>
  );
}

/**
 * Make the respondent prove the value they typed.
 *
 * Locked rather than hidden below Business, like every other paid control in
 * the builder: an author should be able to see what the plan holds, and the
 * publish path strips it if they somehow get it switched on anyway.
 */
/**
 * The two rules an email answer can be held to, wherever one is asked for.
 *
 * One component because the rules are one idea: the standalone block and the
 * email inside a contact block should offer the same thing and word it the same
 * way. `allowedDomains` is the narrower of the two, so it sits underneath — an
 * author who knows the domain reaches for the box, and one who only knows "not
 * gmail" reaches for the switch above it.
 */
function CountryCodeHelp() {
  return (
    <InfoHint label="About the country code">
      <p>
        Lets someone type a national number — <code className="text-foreground">9876543210</code> —
        without the dialling code, and stores it in full.
      </p>
    </InfoHint>
  );
}

function EmailRuleFields({
  businessOnly,
  allowedDomains,
  onChange,
}: {
  businessOnly: boolean;
  allowedDomains: string[];
  onChange: (next: { businessOnly?: boolean; allowedDomains?: string[] }) => void;
}) {
  return (
    <>
      <SwitchField
        label="Business emails only"
        checked={businessOnly}
        onChange={(v) => onChange({ businessOnly: v })}
      />
      <TextField
        label="Accept only these domains"
        placeholder="acme.com, acme.edu"
        value={allowedDomains.join(", ")}
        onChange={(v) => onChange({ allowedDomains: parseEmailDomains(v) })}
        help={<DomainsHelp />}
      />
    </>
  );
}

function VerifyField({
  label,
  checked,
  patch,
}: {
  label: string;
  checked: boolean;
  patch: (p: Partial<Block>, coalesceKey?: string) => void;
}) {
  return (
    <LockedControl feature="verified_answers" chip="inline">
      <SwitchField
        label={label}
        checked={checked}
        onChange={(v) => patch({ verify: v } as Partial<Block>)}
      />
    </LockedControl>
  );
}

/**
 * "No two people can give the same answer" — checked against everybody else's
 * answers to this question on this form. One control rather than five copies.
 */
function UniqueField({
  checked,
  patch,
}: {
  checked: boolean;
  patch: (p: Partial<Block>, coalesceKey?: string) => void;
}) {
  return (
    <SwitchField
      label="No duplicate answers"
      checked={checked}
      onChange={(v) => patch({ unique: v } as Partial<Block>)}
    />
  );
}
