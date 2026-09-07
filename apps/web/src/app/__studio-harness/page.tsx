"use client";

import { FormDoc } from "@repo/form-schema";
import { IntegrationsWorkspace } from "@/components/integrations/integrations-workspace";

const doc = FormDoc.parse({
  title: "Memorie VIP Waitlist & Beta Access",
  blocks: [
    { id: "b1", ref: "name", type: "short_text", title: "What should we call you?", required: true },
    {
      id: "b2",
      ref: "role",
      type: "single_select",
      title: "What best describes what you do?",
      required: true,
      options: [
        { id: "o1", label: "Founder" },
        { id: "o2", label: "Designer" },
        { id: "o3", label: "Engineer" },
      ],
    },
    { id: "b3", ref: "email", type: "email", title: "Where should we send your invite?", required: true },
  ],
  endings: [{ id: "e1", ref: "end", title: "Thanks!" }],
});

export default function Harness() {
  return (
    <div className="bg-background min-h-svh">
      <div className="h-14 border-b" />
      <div className="mx-auto w-full max-w-6xl p-6">
        <IntegrationsWorkspace
          formId="frm_demo"
          slug="memorie-vip"
          formTitle={doc.title}
          status="published"
          appOrigin="https://chatform.in"
          theme={doc.theme}
          blocks={doc.blocks}
        />
      </div>
    </div>
  );
}
