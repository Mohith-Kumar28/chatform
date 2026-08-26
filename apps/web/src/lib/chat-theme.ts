import type { CSSProperties } from "react";
import type { ThemeDoc } from "@repo/form-schema";

export const RADIUS_PX: Record<ThemeDoc["radius"], string> = {
  none: "0px",
  sm: "6px",
  md: "12px",
  lg: "18px",
  full: "9999px",
};

/** Maps a form ThemeDoc to the scoped --cf-* CSS variables the chat UI consumes. */
export function chatThemeVars(theme: ThemeDoc): CSSProperties {
  return {
    "--cf-bg": theme.background,
    "--cf-accent": theme.accent,
    "--cf-bot-bubble": theme.botBubble,
    "--cf-user-bubble": theme.userBubble,
    "--cf-user-bubble-text": theme.userBubbleText,
    "--cf-text": theme.text,
    "--cf-radius": RADIUS_PX[theme.radius],
    fontFamily: `${theme.fontBody}, ui-sans-serif, system-ui, sans-serif`,
  } as CSSProperties;
}
