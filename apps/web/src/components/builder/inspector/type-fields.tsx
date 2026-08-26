"use client";

import type { Block } from "@repo/form-schema";
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
            <TextField
              label="Pattern"
              value={block.pattern ?? ""}
              onChange={(v) => patch({ pattern: v || undefined } as Partial<Block>, key("pattern"))}
            />
          )}
        </>
      );

    case "email":
      return (
        <SwitchField
          label="Business emails only"
          checked={block.businessOnly}
          onChange={(v) => patch({ businessOnly: v } as Partial<Block>)}
        />
      );

    case "phone":
      return (
        <TextField
          label="Country hint"
          value={block.countryHint ?? ""}
          onChange={(v) =>
            patch({ countryHint: v.toUpperCase().slice(0, 2) || undefined } as Partial<Block>, key("countryHint"))
          }
          maxLength={2}
        />
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
            value={block.currency ?? ""}
            onChange={(v) =>
              patch({ currency: v.toUpperCase().slice(0, 3) || undefined } as Partial<Block>, key("currency"))
            }
            maxLength={3}
          />
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
              hint="ISO date"
              value={block.min ?? ""}
              onChange={(v) => patch({ min: v || undefined } as Partial<Block>, key("dmin"))}
            />
            <TextField
              label="Latest"
              hint="ISO date"
              value={block.max ?? ""}
              onChange={(v) => patch({ max: v || undefined } as Partial<Block>, key("dmax"))}
            />
          </div>
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
              label={'Allow an "Other" answer'}
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
            label="Amount"
            value={block.amountMode}
            onChange={(v) => patch({ amountMode: v } as Partial<Block>)}
            options={[
              { value: "fixed", label: "Fixed amount" },
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

    case "legal_consent":
      return (
        <TextField
          label="Consent text"
          value={block.consentText}
          onChange={(v) => patch({ consentText: v } as Partial<Block>, key("consent"))}
          multiline
          maxLength={10000}
        />
      );

    default:
      return null;
  }
}
