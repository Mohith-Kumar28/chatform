"use client";

import { SettingsPanel } from "../settings-panel";
import { useBuilderStore } from "@/stores/builder-store";

export function SettingsTab() {
  const doc = useBuilderStore((s) => s.doc);
  const edit = useBuilderStore((s) => s.edit);
  if (!doc) return null;

  return (
    <div className="mx-auto w-full max-w-5xl p-6">
      <SettingsPanel
        settings={doc.settings}
        formTitle={doc.title}
        hiddenFields={doc.hiddenFields}
        variables={doc.variables}
        onChange={(settings) => edit((d) => { d.settings = settings; })}
        onHiddenFieldsChange={(hiddenFields) => edit((d) => { d.hiddenFields = hiddenFields; })}
        onVariablesChange={(variables) => edit((d) => { d.variables = variables; })}
      />
    </div>
  );
}
