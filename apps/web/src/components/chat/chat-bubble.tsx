import type { CSSProperties, HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const SURFACE: Record<"bot" | "user", CSSProperties> = {
  bot: {
    background: "var(--cf-bot-bubble)",
    color: "var(--cf-bot-bubble-text)",
    borderColor: "var(--cf-bot-bubble-border)",
  },
  user: {
    background: "var(--cf-user-bubble)",
    color: "var(--cf-user-bubble-text)",
    borderColor: "transparent",
  },
};

/**
 * One chat bubble: the shape, size and colours a respondent sees.
 *
 * Everything that draws a conversation uses this (the hosted chat, the
 * builder's question preview, the embed preview, the marketing demo and the
 * dashboard card), so the form's corners, font and colours reach all of them
 * from `chatThemeVars` on an ancestor, and none can drift from the others.
 */
export function ChatBubble({
  from,
  className,
  style,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { from: "bot" | "user" }) {
  return (
    <div
      {...rest}
      className={cn(
        "max-w-[85%] px-4 py-2.5 text-[0.9375rem] leading-relaxed",
        from === "user" ? "bubble-user" : "bubble-bot border",
        className,
      )}
      style={{ ...SURFACE[from], ...style }}
    />
  );
}
