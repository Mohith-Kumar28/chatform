import { AuthGuard } from "@/components/dashboard/auth-guard";

export default function BuilderLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}
