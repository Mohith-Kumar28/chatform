import { Activity, Blocks, CreditCard, Footprints, Gauge, LayoutDashboard, Megaphone, MessageSquareWarning, Sparkles, TrendingUp, Users } from "lucide-react";

/**
 * The console's destinations, in the order the questions get asked.
 *
 * Overview says how the business is doing. Traffic says who comes and from
 * where, Visitors who each of them is and what they looked at, and Campaigns
 * which of our links brought them. Directory says who it is doing it
 * with — organizations, people and forms, all searchable from one place, because
 * whichever of the three you happen to have is the one you search by. Product
 * says what they build, Feedback what the people using it say about it, Revenue
 * what it earns, AI cost what it costs to run, Latency how long respondents
 * wait for a reply, and Health whether the machinery
 * around it is keeping its promises.
 *
 * Deliberately not merged into `APP_NAV`, and deliberately absent from the
 * command palette. This is not a feature of the product with an access check on
 * it — it is a separate surface that happens to share a domain, and a customer
 * should never see a nav item, a palette entry or a locked door that tells them
 * it exists. `/admin` is reached by typing `/admin`.
 */
export const ADMIN_NAV = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/traffic", label: "Traffic", icon: TrendingUp },
  { href: "/admin/visitors", label: "Visitors", icon: Footprints },
  { href: "/admin/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/admin/accounts", label: "Directory", icon: Users },
  { href: "/admin/product", label: "Product", icon: Blocks },
  { href: "/admin/feedback", label: "Feedback", icon: MessageSquareWarning },
  { href: "/admin/revenue", label: "Revenue", icon: CreditCard },
  { href: "/admin/ai", label: "AI cost", icon: Sparkles },
  { href: "/admin/latency", label: "Latency", icon: Gauge },
  { href: "/admin/health", label: "Health", icon: Activity },
] as const;
