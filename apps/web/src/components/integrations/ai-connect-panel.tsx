"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Check, ChevronRight, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LockedControl } from "@/components/billing/gate";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CopyButton } from "@/components/ui/copy-button";
import { CodeBlock } from "@/components/ui/code-block";
import { InfoHint } from "@/components/ui/info-hint";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useEntitlements } from "@/hooks/use-entitlements";
import { getGetApiKeysQueryKey, useGetApiKeysScopes, usePostApiKeys } from "@/lib/api/dashboard/dashboard";
import { API_ORIGIN, ApiError, customFetch } from "@/lib/api/mutator";
import { formatRelative } from "@/lib/format";

/**
 * Connect your AI: Chatform's MCP server, for people who have never heard the
 * acronym.
 *
 * One link is the whole integration. Every assistant that speaks MCP (Claude,
 * ChatGPT, Cursor, Codex…) takes the same URL, opens the browser on Chatform's
 * own "Allow" page, and keeps itself signed in after that. What differs between
 * them is only where their "add a connector" button lives.
 *
 * So the sheet is one thing: pick your app, follow its steps. The first tab is
 * a prompt to paste into any AI, because that is what most people do. Everything
 * else (what it can do, the tool list, API keys, prompts to try) is folded away
 * or waits until something is connected.
 *
 * The URL is the API's `/mcp` (see `apps/api/src/mcp/oauth.ts`). Connections
 * are organization-wide, not per form, but they are made here because this is
 * where someone wonders what else their responses could go into.
 */

export const MCP_URL = `${API_ORIGIN}/mcp`;

const CLAUDE_CONNECTORS_URL = "https://claude.ai/new#customize/connectors/yours";
const CHATGPT_SETTINGS_URL = "https://chatgpt.com/#settings/Connectors";

type App = "prompt" | "claude" | "chatgpt" | "cursor" | "more";

const APPS: { value: App; label: string }[] = [
  { value: "prompt", label: "Prompt" },
  { value: "claude", label: "Claude" },
  { value: "chatgpt", label: "ChatGPT" },
  { value: "cursor", label: "Editors" },
  { value: "more", label: "Other" },
];

const PLAN_HINTS: Record<"claude" | "chatgpt", string> = {
  claude:
    "Every Claude plan, on the web and the desktop app. Free plans allow one custom connector. On Team and Enterprise, an owner adds it once under Organization settings, then everyone connects it themselves.",
  chatgpt:
    "Needs ChatGPT's developer mode, on a paid plan, on the web. On Business, Enterprise and Edu, a workspace admin may have to add it for everyone.",
};

interface Connection {
  id: string;
  client: string;
  connectedBy: string | null;
  lastUsedAt: number | null;
  connectedAt: number;
}

export function AiConnectPanel({ formTitle }: { formTitle: string }) {
  const [app, setApp] = useState<App>("prompt");
  const { data } = useAiConnections();
  const connected = Array.isArray(data) && data.length > 0;

  return (
    <div className="space-y-8">
      {connected && <Connections />}

      <section className="space-y-4">
        {connected && <h3 className="text-h3">Connect another app</h3>}
        <SegmentedControl options={APPS} value={app} onChange={setApp} size="sm" ariaLabel="Your AI app" className="w-full" />
        {app === "prompt" && <PromptSteps />}
        {app === "claude" && <ClaudeSteps />}
        {app === "chatgpt" && <ChatGptSteps />}
        {app === "cursor" && <EditorSteps />}
        {app === "more" && <OtherSteps />}
      </section>

      {connected && <TryAsking formTitle={formTitle} />}

      <WhatItCanDo />
    </div>
  );
}

// ─────────────────────────── steps ───────────────────────────

function Steps({ children }: { children: React.ReactNode }) {
  return <ol className="space-y-5 [counter-reset:step]">{children}</ol>;
}

/** A numbered step: a short title, and below it the one thing to click or copy. */
function Step({ title, children }: { title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <li className="flex gap-3 [counter-increment:step] before:bg-foreground before:text-background before:text-micro before:grid before:size-6 before:shrink-0 before:place-items-center before:rounded-full before:font-semibold before:content-[counter(step)]">
      <div className="min-w-0 flex-1 space-y-2 pt-0.5">
        <p className="text-body font-medium">{title}</p>
        {children}
      </div>
    </li>
  );
}

function PlanHint({ app }: { app: keyof typeof PLAN_HINTS }) {
  return (
    <InfoHint label="Which plans can connect" align="start" className="ml-1 inline-grid align-middle">
      {PLAN_HINTS[app]}
    </InfoHint>
  );
}

function Detail({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground text-caption">{children}</p>;
}

/** The link itself. Not an input: the sheet focuses its first field on open, which selected the link and lit it up. */
function LinkBox() {
  return (
    <div className="flex gap-2">
      <code className="bg-muted text-caption min-w-0 flex-1 truncate rounded-xl px-3 py-2 font-mono">{MCP_URL}</code>
      <CopyButton value={MCP_URL} label="Copy" variant="outline" toastMessage="Link copied" />
    </div>
  );
}

function OpenButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Button size="sm" shape="pill" asChild>
      <a href={href} target="_blank" rel="noreferrer">
        {children}
        <ArrowUpRight />
      </a>
    </Button>
  );
}

function ClaudeSteps() {
  return (
    <Steps>
      <Step title="Copy your Chatform link">
        <LinkBox />
      </Step>
      <Step
        title={
          <>
            Add it as a custom connector in Claude
            <PlanHint app="claude" />
          </>
        }
      >
        <OpenButton href={CLAUDE_CONNECTORS_URL}>Open Claude connectors</OpenButton>
        <Detail>
          Click <b>Add custom connector</b>, name it <b>Chatform</b> and paste the link.
        </Detail>
      </Step>
      <Step title="Click Connect, then Allow" />
    </Steps>
  );
}

function ChatGptSteps() {
  return (
    <Steps>
      <Step title="Copy your Chatform link">
        <LinkBox />
      </Step>
      <Step
        title={
          <>
            Turn on Developer mode in ChatGPT
            <PlanHint app="chatgpt" />
          </>
        }
      >
        <OpenButton href={CHATGPT_SETTINGS_URL}>Open ChatGPT settings</OpenButton>
        <Detail>
          Under <b>Apps → Advanced settings</b>, turn on <b>Developer mode</b>.
        </Detail>
      </Step>
      <Step title="Create the app">
        <Detail>
          Click <b>Create</b>, name it <b>Chatform</b>, paste the link, choose <b>OAuth</b> and click <b>Create</b>.
        </Detail>
      </Step>
      <Step title="Click Allow on the Chatform page that opens" />
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
    <Steps>
      <Step title="Add Chatform to your editor">
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
      </Step>
      <Step title="Click Connect, then Allow in the browser" />
    </Steps>
  );
}

/**
 * One prompt for any AI. An agent that can run commands (Claude Code, Codex,
 * Cursor's agent) installs the server and starts the sign-in; a chat app that
 * cannot add a connector from inside a conversation (Claude, ChatGPT) answers
 * with the exact clicks for itself instead, so the same paste works in both.
 */
const SETUP_PROMPT = [
  `Connect yourself to Chatform so you can work with my forms and responses.`,
  `Chatform is a remote MCP server (streamable HTTP) at ${MCP_URL}. It signs in with OAuth in the browser, so no API key is needed.`,
  `If you can add MCP servers yourself, add it now with your own command (for example \`claude mcp add --transport http chatform ${MCP_URL}\` in Claude Code, \`codex mcp add chatform --url ${MCP_URL}\` in Codex, or \`gemini mcp add --transport http chatform ${MCP_URL}\` in Gemini CLI), then start the sign-in so my browser opens.`,
  `When it's connected, call the whoami tool and tell me which organization you can see.`,
  `If you can't add it yourself, give me short, exact steps to add it as a custom connector in the app I'm using right now, with the link above.`,
].join("\n\n");

function PromptSteps() {
  return (
    <Steps>
      <Step title="Copy this prompt">
        {/* The same scrolling block the embed and webhook prompts use, so the whole prompt is readable before it is pasted. */}
        <CodeBlock code={SETUP_PROMPT} copy={false} wrap className="max-h-64" />
        <CopyButton value={SETUP_PROMPT} label="Copy prompt" variant="default" size="sm" toastMessage="Prompt copied" />
      </Step>
      <Step title="Paste it into your AI">
        <Detail>Claude, ChatGPT, Cursor, Claude Code, Codex or any other. It adds Chatform, or tells you the exact clicks.</Detail>
      </Step>
      <Step title="Click Allow when Chatform asks" />
    </Steps>
  );
}

function OtherSteps() {
  return (
    <div className="space-y-6">
      <Steps>
        <Step title="Copy your Chatform link">
          <LinkBox />
        </Step>
        <Step title="Add it as a remote MCP server in your app" />
        <Step title="Click Allow when Chatform asks" />
      </Steps>
      <Folded title="App can't sign in through the browser? Use an API key">
        <ApiKeyOption />
      </Folded>
    </div>
  );
}

/** What a connector gets through OAuth, so a key made here does the same job. Mirrors `MCP_SCOPES`. */
const MCP_KEY_SCOPES: Record<string, string[]> = {
  form: ["read", "write", "publish"],
  response: ["read", "write", "export"],
  session: ["create", "write", "read"],
  webhook: ["read", "write"],
  file: ["read"],
  analytics: ["read"],
};

/**
 * A key made on the spot, shown in full once.
 *
 * It used to print `Authorization: Bearer sk_live_…` with a Copy button, which
 * copied the literal ellipsis. A stored key cannot be shown again (only its
 * hash is kept), so the honest one-click answer is a new key, here, in full.
 */
function ApiKeyOption() {
  const queryClient = useQueryClient();
  const ent = useEntitlements();
  const canCreate = ent.allows("apikey", "create");
  const { data: vocab } = useGetApiKeysScopes();
  const scopes = (vocab as { presets?: Record<string, Record<string, string[]>> } | undefined)?.presets?.agent ?? MCP_KEY_SCOPES;
  const createKey = usePostApiKeys({
    mutation: { onSuccess: () => void queryClient.invalidateQueries({ queryKey: getGetApiKeysQueryKey() }) },
  });
  const [key, setKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setError(null);
    try {
      const result = (await createKey.mutateAsync({
        data: { name: "AI assistant (MCP)", keyType: "sk_live", scopes } as never,
      })) as unknown as { key: string };
      setKey(result.key);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create a key. Try again.");
    }
  }

  if (key) {
    return (
      <div className="space-y-2">
        <div className="flex gap-2">
          <code className="bg-muted text-caption min-w-0 flex-1 rounded-xl px-3 py-2 font-mono break-all">{key}</code>
          <CopyButton value={key} label="Copy" variant="outline" className="self-start" toastMessage="Key copied" />
        </div>
        <Detail>
          Save it now: it won&apos;t be shown again. Your app sends it as <code className="font-mono">Authorization: Bearer</code>{" "}
          with your link.
        </Detail>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {canCreate ? (
        <LockedControl feature="api_access" chip="inline">
          <Button size="sm" shape="pill" variant="outline" onClick={create} disabled={createKey.isPending}>
            {createKey.isPending ? "Creating…" : "Create a key"}
          </Button>
        </LockedControl>
      ) : (
        <Detail>Only an owner or admin can create keys. Ask one to make one for you.</Detail>
      )}
      {error && (
        <p className="text-destructive text-caption" role="alert">
          {error}
        </p>
      )}
      <div>
        <Link href="/settings/api-keys" className="text-muted-foreground hover:text-foreground text-caption inline-flex items-center gap-0.5 underline underline-offset-2">
          Manage keys
          <ArrowUpRight className="size-3" />
        </Link>
      </div>
    </div>
  );
}

/** A section that stays closed until asked for. */
function Folded({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group">
      <summary className="text-muted-foreground hover:text-foreground text-caption flex cursor-pointer list-none items-center gap-1 font-medium">
        <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" />
        {title}
      </summary>
      <div className="mt-3">{children}</div>
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
    <div className="border-border border-t pt-5">
      <Folded title="What can it do?">
        <div className="space-y-4">
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
          <Folded title={`All ${TOOLS.reduce((n, g) => n + g.tools.length, 0)} tools`}>
            <div className="space-y-4">
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
          </Folded>
        </div>
      </Folded>
    </div>
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
