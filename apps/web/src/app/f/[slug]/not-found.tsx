import { FormNotFound } from "@/components/chat/form-closed";

/**
 * Where `notFound()` in `page.tsx` lands — a slug that matches no published
 * form, or an API we could not reach at all.
 *
 * Scoped to `/f/` rather than the app root on purpose: this is the one URL
 * shape that strangers hold. Every other 404 in this product is somebody
 * already signed in mistyping a dashboard path, and the words here ("ask
 * whoever sent you the link") would be wrong for them.
 *
 * No `metadata` export. Next only reads one from `global-not-found`, and it
 * would be silently ignored here — the title and the `noindex` come from the
 * page's own `generateMetadata`, which already runs and already knows the
 * config could not be fetched.
 */
export default function FormNotFoundPage() {
  return <FormNotFound />;
}
