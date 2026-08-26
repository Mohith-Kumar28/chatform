import { Loader2 } from "lucide-react";

export default function BuilderTabLoading() {
  return (
    <div className="text-muted-foreground flex min-h-[60vh] items-center justify-center gap-2 text-sm">
      <Loader2 className="size-4 animate-spin" />
      Loading…
    </div>
  );
}
