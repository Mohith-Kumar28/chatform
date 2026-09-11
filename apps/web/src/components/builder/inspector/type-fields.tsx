"use client";

import { isValidUpiId, UPI_CURRENCY, type Block } from "@repo/form-schema";
import { LockedControl } from "@/components/billing/gate";
import { GroupFieldsEditor, PatternHelp, patternIsValid } from "./group-fields";
import {
  CheckboxGroup,
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
          <SwitchField
            label="Business emails only"
            checked={block.businessOnly}
            onChange={(v) => patch({ businessOnly: v } as Partial<Block>)}
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
      return (
        <>
          <SelectField
            label="Method"
            value={block.method}
            onChange={(v) =>
              patch({
                method: v,
                // UPI settles in rupees only, so switching to it and leaving the
                // currency at USD would show a price nobody can actually be charged.
                ...(v === "upi" && block.currency !== UPI_CURRENCY ? { currency: UPI_CURRENCY } : {}),
              } as Partial<Block>)
            }
            options={[
              { value: "link", label: "Payment link" },
              { value: "upi", label: "UPI ID (QR + link)" },
            ]}
          />

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
            <TextField
              label="Variable name"
              value={block.amountVariable ?? ""}
              onChange={(v) => patch({ amountVariable: v || undefined } as Partial<Block>, key("amountVar"))}
            />
          )}
          <TextField
            label="Currency"
            value={block.currency}
            onChange={(v) => patch({ currency: v.toUpperCase().slice(0, 3) } as Partial<Block>, key("cur"))}
            maxLength={3}
          />
        </>
      );

    case "scheduling":
      return (
        <TextField
          label="Booking link"
          value={block.url}
          placeholder="https://cal.com/your-handle"
          onChange={(v) => patch({ url: v } as Partial<Block>, key("url"))}
        />
      );

    case "contact_info":
      return (
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
      );

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

/**
 * Make the respondent prove the value they typed.
 *
 * Locked rather than hidden below Business, like every other paid control in
 * the builder: an author should be able to see what the plan holds, and the
 * publish path strips it if they somehow get it switched on anyway.
 */
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
