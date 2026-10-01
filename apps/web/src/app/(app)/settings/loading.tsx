import { Spinner } from "@/components/ui/spinner";

/** Inside the settings rail, so switching section never blanks the menu. */
export default function SettingsLoading() {
  return (
    <div className="flex flex-1 items-center justify-center py-24">
      <Spinner className="text-muted-foreground size-5" />
    </div>
  );
}
