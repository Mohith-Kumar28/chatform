import { Suspense } from "react";
import { FeedbackClient } from "@/components/admin/feedback-client";

export default function AdminFeedbackPage() {
  return (
    <Suspense fallback={null}>
      <FeedbackClient />
    </Suspense>
  );
}
