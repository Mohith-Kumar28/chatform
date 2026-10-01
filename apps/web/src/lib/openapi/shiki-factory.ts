import { createShikiFactory } from "fumadocs-core/highlight/shiki";
import { createBundledHighlighter } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

/**
 * Stands in for `fumadocs-core/highlight/shiki/full` (aliased in next.config.ts).
 *
 * That module builds its highlighter from the whole `shiki` bundle, and every
 * one of shiki's ~200 grammars came with it: 8MB of language files and 1.4MB of
 * themes in the server bundle, where they only ever run while the docs are
 * prerendered at build. The worker's size is its cold start, so this keeps the
 * same two exports with the languages the API reference actually prints
 * (fumadocs-openapi's code samples: curl, JS, Python, Go, Java, C#, Rust, and
 * JSON bodies) and the two themes it renders in.
 *
 * A language not listed here is printed as plain text, which is what fumadocs
 * already does for a language shiki does not know.
 */
const bash = () => import("shiki/langs/bash.mjs");
const javascript = () => import("shiki/langs/javascript.mjs");
const typescript = () => import("shiki/langs/typescript.mjs");
const python = () => import("shiki/langs/python.mjs");
const csharp = () => import("shiki/langs/csharp.mjs");
const rust = () => import("shiki/langs/rust.mjs");

/** Keyed by every name a code sample may ask for, aliases included. */
const langs = {
  bash,
  sh: bash,
  shell: bash,
  shellscript: bash,
  zsh: bash,
  curl: bash,
  javascript,
  js: javascript,
  typescript,
  ts: typescript,
  json: () => import("shiki/langs/json.mjs"),
  python,
  py: python,
  go: () => import("shiki/langs/go.mjs"),
  java: () => import("shiki/langs/java.mjs"),
  csharp,
  cs: csharp,
  "c#": csharp,
  rust,
  rs: rust,
  http: () => import("shiki/langs/http.mjs"),
  yaml: () => import("shiki/langs/yaml.mjs"),
};

const themes = {
  "github-light": () => import("shiki/themes/github-light.mjs"),
  "github-dark": () => import("shiki/themes/github-dark.mjs"),
};

const createHighlighter = createBundledHighlighter<keyof typeof langs, keyof typeof themes>({
  langs,
  themes,
  engine: () => createJavaScriptRegexEngine(),
});

function init(options?: { langAlias?: Record<string, string> }) {
  return createHighlighter({ langs: [], themes: [], langAlias: options?.langAlias });
}

export const defaultShikiFactory = createShikiFactory({ init });
/** fumadocs exports a WASM-engine variant too; the JS engine serves both here. */
export const wasmShikiFactory = defaultShikiFactory;
