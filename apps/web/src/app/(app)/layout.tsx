import { DashboardShell } from "@/components/dashboard/dashboard-shell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
