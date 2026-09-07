"use client";

import { Eye, EyeOff } from "lucide-react";
import { useId, useState } from "react";
import { Label } from "@/components/ui/label";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { PasswordStrengthMeter } from "./password-strength-meter";

/**
 * A password input with the three things a password input owes you.
 *
 * The reveal toggle, because typing a password you cannot see is how you get a
 * typo you cannot find. The strength meter, because "at least 8 characters"
 * reads as a target rather than a floor and people hit it exactly. And, on the
 * screens that ask you to *choose* one, a second field, because the cost of
 * mistyping a new password is discovering it at the next sign-in with no way
 * back except a reset email.
 *
 * The meter itself is Better Auth UI's — same component, same scoring, as the
 * account screens use — so a password judged "good" here is judged "good" when
 * you change it later. Two screens carry their own password form for reasons
 * that have nothing to do with passwords (`/signin` prefills an invitation's
 * address; `/reset-password` redeems a token from an email), and this is what
 * keeps those two from drifting from the rest.
 */
export function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  autoFocus,
  disabled,
  minLength = 8,
  strength = false,
  labelAction,
  placeholder = "••••••••",
}: {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  minLength?: number;
  /** Only on forms that choose a *new* password. Meaningless next to one you already know. */
  strength?: boolean;
  /** The "Forgot?" link, and nothing else so far. */
  labelAction?: React.ReactNode;
  placeholder?: string;
}) {
  const generated = useId();
  const fieldId = id ?? generated;
  const [visible, setVisible] = useState(false);

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <Label htmlFor={fieldId}>{label}</Label>
        {labelAction}
      </div>

      <InputGroup>
        <InputGroupInput
          id={fieldId}
          type={visible ? "text" : "password"}
          required
          autoFocus={autoFocus}
          autoComplete={autoComplete}
          disabled={disabled}
          minLength={minLength}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="icon-xs"
            aria-label={visible ? "Hide password" : "Show password"}
            title={visible ? "Hide password" : "Show password"}
            onClick={() => setVisible((v) => !v)}
          >
            {visible ? <EyeOff /> : <Eye />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>

      {strength && <PasswordStrengthMeter password={value} />}
    </div>
  );
}
