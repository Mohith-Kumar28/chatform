"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Check, ChevronRight, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CopyButton } from "@/components/ui/copy-button";
import { InfoHint } from "@/components/ui/info-hint";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { API_ORIGIN, customFetch } from "@/lib/api/mutator";
import { formatRelative } from "@/lib/format";

/**
 * Connect your AI: Chatform's MCP server, for people who have never heard the
 * acronym.
 *
 * One link is the whole integration. Every assistant that speaks MCP (Claude,
 * ChatGPT, Cursor, Codex…) takes the same URL, opens the browser on Chatform's
 * own "Allow" page, and keeps itself signed in after that. What differs between
 * them is only where their "add a connector" button lives, so that is all the
 * per-app tabs say.
 *
 * The URL is the API's `/mcp` (see `apps/api/src/mcp/oauth.ts`). Connections
 * are organization-wide, not per form, but they are made here because this is
 * where someone wonders what else their responses could go into.
 */

export const MCP_URL = `${API_ORIGIN}/mcp`;

type App = "claude" | "chatgpt" | "cursor" | "more";

const APPS: { value: App; label: string }[] = [
  { value: "claude", label: "Claude" },
  { value: "chatgpt", label: "ChatGPT" },
  { value: "cursor", label: "Cursor & VS Code" },
  { value: "more", label: "Other" },
];

interface Connection {
  id: string;
  client: string;
  connectedBy: string | null;
  lastUsedAt: number | null;
  connectedAt: number;
}

export function AiConnectPanel({ formTitle }: { formTitle: string }) {
  const [app, setApp] = useState<App>("claude");

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h3 className="text-h3">Your Chatform link</h3>
        {/* Not an input: the sheet focuses its first field on open, which selected the link and lit it up. */}
        <div className="flex gap-2">
          <code className="bg-muted text-caption min-w-0 flex-1 truncate rounded-xl px-3 py-2 font-mono">{MCP_URL}</code>
          <CopyButton value={MCP_URL} label="Copy" variant="outline" toastMessage="Link copied" />
        </div>
      </section>

      <section className="space-y-3">
        <SegmentedControl options={APPS} value={app} onChange={setApp} size="sm" ariaLabel="Your AI app" className="w-full" />
        {app === "claude" && <ClaudeSteps />}
        {app === "chatgpt" && <ChatGptSteps />}
        {app === "cursor" && <EditorSteps />}
        {app === "more" && <OtherSteps />}
      </section>

      <hr className="border-border" />
      <TryAsking formTitle={formTitle} />

      <hr className="border-border" />
      <WhatItCanDo />

      <Connections />
    </div>
  );
}

// ─────────────────────────── steps ───────────────────────────

function Steps({ children, hint }: { children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <ol className="text-body space-y-2.5 [counter-reset:step]">{children}</ol>
      {hint && (
        <div className="text-muted-foreground text-caption flex items-center gap-1">
          Which plans?
          <InfoHint label="Which plans can connect" align="start">
            {hint}
          </InfoHint>
        </div>
      )}
    </div>
  );
}

function Step({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-3 [counter-increment:step] before:bg-muted before:text-caption before:grid before:size-5 before:shrink-0 before:place-items-center before:rounded-full before:font-medium before:content-[counter(step)]">
      <span className="min-w-0">{children}</span>
    </li>
  );
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium underline underline-offset-2">
      {children}
      <ArrowUpRight className="size-3" />
    </a>
  );
}

function ClaudeSteps() {
  return (
    <Steps
      hint={
        <>
          Every Claude plan, on the web and the desktop app. Free plans allow one custom connector. On Team and
          Enterprise, an owner adds it once under Organization settings, then everyone connects it themselves.
        </>
      }
    >
      <Step>
        Open <ExternalLink href="https://claude.ai/settings/connectors">Connectors</ExternalLink> in Claude.
      </Step>
      <Step>
        Click <b>Add custom connector</b>, name it <b>Chatform</b> and paste your link.
      </Step>
      <Step>
        Click <b>Connect</b>, then <b>Allow</b> on the Chatform page that opens.
      </Step>
    </Steps>
  );
}

function ChatGptSteps() {
  return (
    <Steps
      hint={
        <>
          Needs ChatGPT&apos;s developer mode, on a paid plan, on the web. On Business, Enterprise and Edu, a
          workspace admin may have to add it for everyone.
        </>
      }
    >
      <Step>
        In ChatGPT, open <b>Settings → Apps → Advanced settings</b> and turn on <b>Developer mode</b>.
      </Step>
      <Step>
        Click <b>Create</b>, name it <b>Chatform</b>, paste your link and choose <b>OAuth</b>.
      </Step>
      <Step>
        Click <b>Create</b>, then <b>Allow</b> on the Chatform page that opens.
      </Step>
    </Steps>
  );
}

const CURSOR_LINK = `cursor://anysphere.cursor-deeplink/mcp/install?name=Chatform&config=${encodeURIComponent(
  typeof btoa === "function" ? btoa(JSON.stringify({ url: MCP_URL })) : "",
)}`;
const VSCODE_LINK = `https://vscode.dev/redirect/mcp/install?name=chatform&config=${encodeURIComponent(
  JSON.stringify({ type: "http", url: MCP_URL }),
)}`;

function EditorSteps() {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" shape="pill" asChild>
          <a href={CURSOR_LINK}>Add to Cursor</a>
        </Button>
        <Button size="sm" shape="pill" variant="outline" asChild>
          <a href={VSCODE_LINK} target="_blank" rel="noreferrer">
            Add to VS Code
          </a>
        </Button>
      </div>
      <p className="text-muted-foreground text-caption">Then click Connect when it asks, and Allow in the browser.</p>
    </div>
  );
}

function OtherSteps() {
  const commands = [
    { app: "Claude Code", command: `claude mcp add --transport http chatform ${MCP_URL}`, then: "then /mcp to sign in" },
    { app: "Codex", command: `codex mcp add chatform --url ${MCP_URL}`, then: "then codex mcp login chatform" },
    { app: "Gemini CLI", command: `gemini mcp add --transport http chatform ${MCP_URL}`, then: "then /mcp auth chatform" },
  ];
  return (
    <div className="space-y-4">
      <p className="text-body">
        Any app that supports MCP: add a remote server with your link. It signs in through the browser on its own.
      </p>
      {commands.map((c) => (
        <div key={c.app} className="space-y-1">
          <div className="text-caption flex items-baseline justify-between gap-2">
            <span className="font-medium">{c.app}</span>
            <span className="text-muted-foreground font-mono text-[0.6875rem]">{c.then}</span>
          </div>
          <CommandLine value={c.command} />
        </div>
      ))}
      <SetupPrompt />
      <ApiKeyOption />
    </div>
  );
}

function CommandLine({ value }: { value: string }) {
  return (
    <div className="flex gap-2">
      <pre className="bg-muted text-caption min-w-0 flex-1 overflow-x-auto rounded-xl px-3 py-2 font-mono">
        <code>{value}</code>
      </pre>
      <CopyButton value={value} variant="outline" size="icon-sm" className="self-center" />
    </div>
  );
}

/**
 * For coding agents, which can run the install themselves. A chat app cannot
 * add a connector from inside a conversation, so this is not offered there.
 */
const SETUP_PROMPT = [
  `Connect yourself to Chatform's MCP server so you can work with my forms and responses.`,
  `It's a remote MCP server (streamable HTTP) at ${MCP_URL} and it signs in with OAuth in the browser, so no API key is needed.`,
  `Add it with your own MCP command (for example \`claude mcp add --transport http chatform ${MCP_URL}\` in Claude Code, or \`codex mcp add chatform --url ${MCP_URL}\` in Codex), then start the sign-in so my browser opens.`,
  `When it's connected, call the whoami tool and tell me which organization you can see.`,
].join(" ");

function SetupPrompt() {
  return (
    <div className="space-y-1">
      <div className="text-caption flex items-center gap-1 font-medium">
        Or let your coding agent do it
        <InfoHint label="About the setup prompt" align="start">
          Paste this into Claude Code, Codex or another agent that can run commands. It adds Chatform and opens the
          sign-in for you.
        </InfoHint>
      </div>
      <div className="flex gap-2">
        <p className="bg-muted text-caption min-w-0 flex-1 rounded-xl px-3 py-2">
          <span className="line-clamp-2">{SETUP_PROMPT}</span>
        </p>
        <CopyButton value={SETUP_PROMPT} variant="outline" size="icon-sm" className="self-center" toastMessage="Prompt copied" />
      </div>
    </div>
  );
}

function ApiKeyOption() {
  const header = `Authorization: Bearer sk_live_…`;
  return (
    <details className="group">
      <summary className="text-muted-foreground hover:text-foreground text-micro cursor-pointer list-none underline underline-offset-2">
        Use an API key instead
      </summary>
      <div className="text-caption mt-2 space-y-2">
        <p>
          For an app that can&apos;t sign in through the browser, send a secret key with every request. Keys need a
          plan with API access.
        </p>
        <CommandLine value={header} />
        <Link href="/settings/api-keys" className="inline-flex items-center gap-0.5 font-medium underline underline-offset-2">
          Create a key
          <ArrowUpRight className="size-3" />
        </Link>
      </div>
    </details>
  );
}

// ─────────────────────────── try asking ───────────────────────────

function TryAsking({ formTitle }: { formTitle: string }) {
  const name = formTitle.trim() || "my form";
  const prompts = [
    `Summarise this week's responses to "${name}".`,
    `What are the most common answers in "${name}", and what stands out?`,
    `Where do people drop off in "${name}"?`,
    `Add a question to "${name}" asking how people heard about us, then publish it.`,
  ];
  return (
    <section className="space-y-3">
      <h3 className="text-h3">Try asking</h3>
      <ul className="space-y-2">
        {prompts.map((p) => (
          <li key={p} className="bg-muted/60 flex items-center gap-2 rounded-xl py-1.5 pr-1.5 pl-3">
            <span className="text-body min-w-0 flex-1">{p}</span>
            <CopyButton value={p} size="icon-sm" toastMessage="Copied" />
          </li>
        ))}
      </ul>
    </section>
  );
}

// ─────────────────────────── capabilities ───────────────────────────

const CAN = [
  "Read your forms, responses and analytics",
  "Search and summarise answers",
  "Create, edit and publish forms",
  "Export responses and set up webhooks",
];

/** Every tool the server registers, minus the one a connector is not granted (`generate_form_with_ai`). */
const TOOLS: { group: string; tools: [string, string][] }[] = [
  {
    group: "Forms",
    tools: [
      ["list_forms", "List forms"],
      ["get_form", "Read a form"],
      ["create_form", "Create a form"],
      ["update_form", "Change a form's questions"],
      ["update_form_settings", "Change a form's settings"],
      ["publish_form", "Publish a form"],
      ["list_form_settings", "List a form's settings"],
      ["list_blocks", "Question types"],
      ["list_templates", "Templates"],
      ["use_template", "Start from a template"],
      ["list_form_versions", "Published versions"],
      ["restore_form_version", "Roll back a version"],
    ],
  },
  {
    group: "Responses",
    tools: [
      ["list_responses", "List responses"],
      ["search_responses", "Search answers"],
      ["get_response", "Read one response"],
      ["get_file", "Open an uploaded file"],
      ["submit_response", "Submit a response"],
      ["export_responses", "Export responses"],
      ["check_export", "Check an export"],
      ["create_spreadsheet_feed", "Live spreadsheet feed"],
    ],
  },
  { group: "Analytics", tools: [["get_form_analytics", "Views, completions and drop-off"]] },
  {
    group: "Webhooks",
    tools: [
      ["list_webhooks", "List webhooks"],
      ["create_webhook", "Create a webhook"],
      ["list_webhook_deliveries", "Delivery log"],
      ["replay_webhook_delivery", "Retry a delivery"],
      ["list_events", "Event types"],
    ],
  },
  {
    group: "Everything else",
    tools: [
      ["whoami", "Which organization it's connected to"],
      ["chatform_api_search", "Find an API endpoint"],
      ["chatform_api_details", "Read an endpoint's schema"],
      ["chatform_api_read", "Call a read endpoint"],
      ["chatform_api_write", "Call a write endpoint"],
    ],
  },
];

function WhatItCanDo() {
  return (
    <section className="space-y-3">
      <h3 className="text-h3">What it can do</h3>
      <ul className="text-body space-y-2">
        {CAN.map((line) => (
          <li key={line} className="flex items-start gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-[var(--success)]" />
            {line}
          </li>
        ))}
        <li className="text-muted-foreground flex items-start gap-2">
          <X className="mt-0.5 size-4 shrink-0" />
          Delete anything
        </li>
      </ul>
      <details className="group">
        <summary className="text-muted-foreground hover:text-foreground text-caption flex cursor-pointer list-none items-center gap-1">
          <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" />
          All {TOOLS.reduce((n, g) => n + g.tools.length, 0)} tools
        </summary>
        <div className="mt-3 space-y-4">
          {TOOLS.map((g) => (
            <div key={g.group} className="space-y-1.5">
              <p className="text-micro text-muted-foreground font-medium tracking-wide uppercase">{g.group}</p>
              <dl className="text-caption grid grid-cols-[12.5rem_1fr] gap-x-3 gap-y-1">
                {g.tools.map(([tool, what]) => (
                  <div key={tool} className="contents">
                    <dt className="font-mono text-[0.6875rem] leading-5">{tool}</dt>
                    <dd className="text-muted-foreground leading-5">{what}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}

// ─────────────────────────── connections ───────────────────────────

export function useAiConnections() {
  return useQuery({
    queryKey: ["mcp-connections"],
    queryFn: () => customFetch<Connection[]>("/api/mcp/connections"),
    retry: false,
  });
}

function Connections() {
  const queryClient = useQueryClient();
  const { data } = useAiConnections();
  const [confirm, setConfirm] = useState<Connection | null>(null);
  const rows = Array.isArray(data) ? data : [];

  const disconnect = useMutation({
    mutationFn: (id: string) => customFetch(`/api/mcp/connections/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Disconnected.");
      void queryClient.invalidateQueries({ queryKey: ["mcp-connections"] });
    },
    onError: () => toast.error("Couldn't disconnect. Try again."),
  });

  if (rows.length === 0) return null;

  return (
    <>
      <hr className="border-border" />
      <section className="space-y-3">
        <h3 className="text-h3">Connected</h3>
        <ul className="divide-border divide-y">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center gap-3 py-2.5">
              <span className="size-2 shrink-0 rounded-full bg-[var(--success)]" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-body truncate font-medium">{row.client}</p>
                <p className="text-muted-foreground text-caption truncate">
                  {[
                    row.connectedBy ? `By ${row.connectedBy}` : null,
                    row.lastUsedAt ? `used ${formatRelative(row.lastUsedAt)}` : `connected ${formatRelative(row.connectedAt)}`,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setConfirm(row)}>
                Disconnect
              </Button>
            </li>
          ))}
        </ul>
      </section>
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={`Disconnect ${confirm?.client ?? "this app"}?`}
        description="It loses access right away. Connect it again any time with the same link."
        confirmLabel="Disconnect"
        onConfirm={async () => {
          if (confirm) await disconnect.mutateAsync(confirm.id);
          setConfirm(null);
        }}
      />
    </>
  );
}
