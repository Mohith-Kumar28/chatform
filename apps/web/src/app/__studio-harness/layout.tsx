import { AppProviders } from "@/components/providers/app-providers";

/**
 * The component harness renders real builder surfaces — the integrations
 * workspace, the webhooks and spreadsheet panels — and those read through
 * TanStack Query, so it needs the same providers the builder has.
 */
export default function StudioHarnessLayout({ children }: { children: React.ReactNode }) {
  return <AppProviders>{children}</AppProviders>;
}
