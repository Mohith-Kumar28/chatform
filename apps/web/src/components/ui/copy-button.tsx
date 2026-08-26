"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Copy-to-clipboard with inline confirmation. The check mark is the feedback;
 * the toast is for when the button is small enough that the swap is easy to
 * miss. `navigator.clipboard` throws on insecure origins, so failure is
 * surfaced rather than silently swallowed.
 */
export function CopyButton({
  value,
  label,
  toastMessage,
  className,
  variant = "ghost",
  size = "icon-sm",
}: {
  value: string;
  label?: string;
  toastMessage?: string;
  className?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (toastMessage) toast.success(toastMessage);
    } catch {
      toast.error("Couldn't copy — your browser blocked clipboard access.");
    }
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={label ? "sm" : size}
      onClick={copy}
      aria-label={label ?? "Copy"}
      className={cn(className)}
    >
      {copied ? <Check className="size-3.5 text-[var(--success)]" /> : <Copy className="size-3.5" />}
      {label && (copied ? "Copied" : label)}
    </Button>
  );
}
