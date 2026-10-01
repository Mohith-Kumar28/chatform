import { Spinner } from "@/components/ui/spinner";

/**
 * Shown the moment a form or a builder tab is clicked.
 *
 * Without a loading boundary the App Router keeps the old page on screen until
 * the new route's payload arrives, so a click that waited on the server read as
 * a click that did nothing. This also lets the dashboard's prefetch carry the
 * builder shell itself, so opening a form paints the header at once.
 */
export default function BuilderLoading() {
  return (
    <div className="flex flex-1 items-center justify-center py-24">
      <Spinner className="text-muted-foreground size-5" />
    </div>
  );
}
