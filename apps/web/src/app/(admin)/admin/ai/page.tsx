import { Suspense } from "react";
import { AiClient } from "@/components/admin/ai-client";

export default function AdminAiPage() {
  return (
    <Suspense fallback={null}>
      <AiClient />
    </Suspense>
  );
}
