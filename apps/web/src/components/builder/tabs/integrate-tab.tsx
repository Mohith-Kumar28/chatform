"use client";

import { IntegrationsWorkspace } from "@/components/integrations/integrations-workspace";
import { useBuilderStore } from "@/stores/builder-store";
import { useGetApiFormsById } from "@/lib/api/dashboard/dashboard";
import { useClientValue } from "@/hooks/use-client-value";

/**
 * The builder's Integrate tab — the embed, and where the answers go.
 *
 * It used to be a webhook form plus a hardcoded snippet pointing at a hostname
 * that stopped existing when the domain changed, so the one thing people
 * copied from this tab produced a form that never loaded.
 */
export function IntegrateTab() {
  const formId = useBuilderStore((s) => s.formId);
  // The working document, not the published row: the preview draws the form's
  // own theme and its own first questions, and both of those are being edited
  // one tab away.
  const doc = useBuilderStore((s) => s.doc);
  // The embed snippet addresses a form by slug, not by id — the same way the
  // Share tab does, from the same source.
  const { data } = useGetApiFormsById(formId as never);
  const row = data as { slug: string; title: string; status: string } | undefined;

  // window.location is not available during SSR; "" is what the server renders.
  const origin = useClientValue(() => window.location.origin, "");

  if (!formId || !row || !doc) return null;
  return (
    <div className="mx-auto w-full max-w-6xl p-6">
      <IntegrationsWorkspace
        formId={formId}
        slug={row.slug}
        formTitle={doc.title || row.title}
        status={row.status}
        appOrigin={origin}
        theme={doc.theme}
        blocks={doc.blocks}
      />
    </div>
  );
}
