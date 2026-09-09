"use client";

import { SettingsPanel } from "../settings-panel";
import { useBuilderStore } from "@/stores/builder-store";
import { useGetApiFormsById } from "@/lib/api/dashboard/dashboard";

export function SettingsTab() {
  const doc = useBuilderStore((s) => s.doc);
  const edit = useBuilderStore((s) => s.edit);
  const formId = useBuilderStore((s) => s.formId);
  // The slug lives on the form row, not the document — link settings show the
  // real address the preview card will carry.
  const { data } = useGetApiFormsById(formId as never);
  const slug = (data as { slug?: string } | undefined)?.slug ?? null;

  if (!doc) return null;

  return (
    <>
      <SettingsPanel
        slug={slug}
        settings={doc.settings}
        formTitle={doc.title}
        onTitleChange={(title) => edit((d) => { d.title = title; }, "doc:title")}
        hiddenFields={doc.hiddenFields}
        variables={doc.variables}
        onChange={(settings) => edit((d) => { d.settings = settings; })}
        onHiddenFieldsChange={(hiddenFields) => edit((d) => { d.hiddenFields = hiddenFields; })}
        onVariablesChange={(variables) => edit((d) => { d.variables = variables; })}
      />
    </>
  );
}
