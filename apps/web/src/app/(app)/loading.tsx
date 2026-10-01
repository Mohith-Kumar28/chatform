import { Spinner } from "@/components/ui/spinner";

/** Inside the dashboard shell, so the nav stays put and a click answers at once. */
export default function AppLoading() {
  return (
    <div className="flex flex-1 items-center justify-center py-24">
      <Spinner className="text-muted-foreground size-5" />
    </div>
  );
}
