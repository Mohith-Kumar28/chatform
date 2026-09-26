"use client";

import { useEffect } from "react";
import { rememberFirstTouch } from "@/lib/auth/client-context";

/** Notes the page and referrer this browser first arrived on, for its sign-up record. */
export function FirstTouch() {
  useEffect(() => rememberFirstTouch(), []);
  return null;
}
