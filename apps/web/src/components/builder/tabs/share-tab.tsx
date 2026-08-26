"use client";

import { useEffect, useState } from "react";
import { ShareClient } from "../share-client";
import { useBuilderStore } from "@/stores/builder-store";
import { useGetApiFormsById } from "@/lib/api/dashboard/dashboard";

export function ShareTab() {
  const formId = useBuilderStore((s) => s.formId);
  const { data } = useGetApiFormsById(formId as never);
  const row = data as { slug: string; status: string } | undefined;

  // window.location is not available during SSR.
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  if (!row) return null;
  return (
    <div className="mx-auto w-full max-w-3xl p-6">
      <ShareClient slug={row.slug} appOrigin={origin} status={row.status} />
    </div>
  );
}
