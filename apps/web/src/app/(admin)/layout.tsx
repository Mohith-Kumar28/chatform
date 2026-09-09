import { AdminShell } from "@/components/admin/admin-shell";

/**
 * The platform console's own route group.
 *
 * Separate from `(app)` because it is not part of the product: it does not want
 * the organization switcher, the plan badge or the usage pill, all of which
 * describe *an* account on a surface that is about every account at once.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
