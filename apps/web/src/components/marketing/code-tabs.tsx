"use client";

import { useState } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import { SegmentedControl } from "@/components/ui/segmented-control";

/**
 * Real snippets, not illustrative ones.
 *
 * The endpoints come from the committed `openapi.json`, the embed snippet from
 * `public/embed.js`'s own header comment, and the webhook payload from the
 * signature scheme in `apps/api/src/lib/webhooks.ts`.
 */

type TabId = "api" | "embed" | "webhook";

const SNIPPETS: Record<TabId, { label: string; lang: string; code: string }> = {
  api: {
    label: "Headless API",
    lang: "bash",
    code: `# Start a conversation from your own backend
curl -X POST https://api.chatform.in/v1/forms/frm_8Kd2/chat/sessions \\
  -H "Authorization: Bearer $CHATFORM_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "hiddenFields": { "plan": "trial" } }'

# Answer, and get the next question back synchronously
curl -X POST https://api.chatform.in/v1/chat/sessions/ses_91xQ/messages \\
  -H "Authorization: Bearer $CHATFORM_API_KEY" \\
  -d '{ "text": "we are about a dozen people right now" }'
# => { "messages": [...], "recorded": { "team_size": 12 }, "done": false }`,
  },
  embed: {
    label: "Embed",
    lang: "html",
    code: `<!-- popup · side-tab · inline · full page -->
<script
  src="https://chatform.in/embed.js"
  data-form="team-onboarding"
  data-mode="side-tab"
  data-color="#f97316"
  data-label="Chat with us"
></script>`,
  },
  webhook: {
    label: "Webhooks",
    lang: "json",
    code: `POST https://yours.example.com/hooks/chatform
x-chatform-signature: t=1756281600, v1=9f2c…

{
  "event": "submission.completed",
  "formId": "frm_8Kd2",
  "submissionId": "sub_4821",
  "answers": { "team_size": 12, "reason": "Replacing a tool" },
  "transcript": [ { "role": "bot", "text": "How big is…" } ],
  "respondent": { "provider": "google", "email": "maya@northwind.co" }
}`,
  },
};

const OPTIONS = (Object.keys(SNIPPETS) as TabId[]).map((id) => ({
  value: id,
  label: SNIPPETS[id].label,
}));

export function CodeTabs() {
  const [tab, setTab] = useState<TabId>("api");
  const snippet = SNIPPETS[tab];

  return (
    <div className="border-border/70 bg-card overflow-hidden rounded-2xl border shadow-sm">
      <div className="border-border/60 flex flex-wrap items-center gap-3 border-b px-3 py-3">
        <SegmentedControl
          options={OPTIONS}
          value={tab}
          onChange={setTab}
          size="sm"
          ariaLabel="Code example"
        />
        <span className="text-micro text-muted-foreground font-mono">{snippet.lang}</span>
        <CopyButton
          value={snippet.code}
          label="Copy"
          toastMessage="Snippet copied"
          className="ml-auto"
        />
      </div>
      <pre className="overflow-x-auto px-4 py-4 text-[0.8125rem] leading-relaxed">
        <code className="font-mono">{snippet.code}</code>
      </pre>
    </div>
  );
}
