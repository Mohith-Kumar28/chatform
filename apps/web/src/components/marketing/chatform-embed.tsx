"use client";

import { useEffect } from "react";

type EmbedApi = { destroy: () => void };
type EmbedWindow = Window & {
  Chatform?: EmbedApi;
  __chatformInstances?: Record<string, EmbedApi>;
};

/**
 * Our own form, on our own site, through the same embed.js a customer pastes.
 *
 * Not `next/script`: it loads a given src once per app and never unloads it, so
 * the marketing corner button would follow a visitor onto `/contact` and into
 * the app, and `/contact`'s inline tag (same src) would never run. This adds
 * the tag on mount and tears the instance down on unmount instead.
 *
 * A removed script tag still executes once its fetch lands, so an unmount that
 * beats the load (StrictMode's double effect, a quick click away) destroys the
 * instance from the tag's own `load` event, which fires straight after it
 * registers itself.
 */
export function ChatformEmbed({
  form,
  attributes,
}: {
  form: string;
  /** Extra `data-*` overrides, keyed without the `data-` prefix. */
  attributes?: Record<string, string>;
}) {
  const attributesKey = JSON.stringify(attributes ?? {});

  useEffect(() => {
    const w = window as EmbedWindow;
    let instance: EmbedApi | undefined;
    let unmounted = false;

    const teardown = () => {
      if (!instance) return;
      instance.destroy();
      if (w.__chatformInstances?.[form] === instance) delete w.__chatformInstances[form];
      if (w.Chatform === instance) delete w.Chatform;
    };

    const script = document.createElement("script");
    script.src = "https://chatform.in/embed.js";
    script.setAttribute("data-form", form);
    for (const [name, value] of Object.entries(JSON.parse(attributesKey) as Record<string, string>)) {
      script.setAttribute(`data-${name}`, value);
    }
    script.addEventListener("load", () => {
      instance = w.__chatformInstances?.[form];
      if (unmounted) teardown();
    });
    document.body.appendChild(script);

    return () => {
      unmounted = true;
      teardown();
      script.remove();
    };
  }, [form, attributesKey]);

  return null;
}
