"use client";

import {
  useGetApiBillingEntitlements,
  getGetApiBillingEntitlementsQueryKey,
} from "@/lib/api/billing/billing";
import {
  FEATURES,
  LIMITS,
  minPlanFor,
  isAtLimit,
  type FeatureKey,
  type LimitKey,
  type MetricKey,
  type PlanId,
} from "@repo/entitlements";

/**
 * The one call the whole UI reads.
 *
 * Deliberately a single endpoint rather than four. Every gated control needs the plan, the
 * usage and the role together, and splitting them means a component can render with the
 * plan loaded but the usage not — which is exactly when a paywall flickers into view and
 * then out again.
 */
export interface EntitlementsPayload {
  planId: PlanId;
  planName: string;
  status: string;
  cycle: "monthly" | "yearly" | null;
  periodStart: number | null;
  periodEnd: number | null;
  cancelAtPeriodEnd: boolean;
  inGrace: boolean;
  seats: number;
  features: Record<FeatureKey, boolean>;
  limits: Record<LimitKey, number | null>;
  usage: Record<MetricKey, number>;
  gauges: Record<string, number>;
  periodResetsAt: number;
  role: string;
  roleLabel: string;
  permissions: Record<string, string[]>;
}

/** The query key, exported so a webhook-driven refetch can invalidate it by name. */
export const ENTITLEMENTS_KEY = getGetApiBillingEntitlementsQueryKey();

export interface Entitlements {
  data: EntitlementsPayload | undefined;
  isLoading: boolean;
  /** Does the plan include this feature? Optimistic while loading — see below. */
  can: (feature: FeatureKey) => boolean;
  /** Does the caller's role permit this? */
  allows: (resource: string, action: string) => boolean;
  limit: (key: LimitKey) => number | null;
  usage: (metric: MetricKey) => number;
  /** 0–1 of a metric's allowance consumed; 0 when unlimited. */
  ratio: (metric: MetricKey, limitKey: LimitKey) => number;
  atLimit: (metric: MetricKey, limitKey: LimitKey) => boolean;
  /** The cheapest plan that includes `feature`, for a lock chip. */
  requiredPlan: (feature: FeatureKey) => PlanId;
  label: (feature: FeatureKey) => string;
  limitLabel: (key: LimitKey) => string;
}

export function useEntitlements(): Entitlements {
  // Generated hook, per the project rule that no frontend data fetching is hand-written.
  const { data: raw, isLoading } = useGetApiBillingEntitlements({
    query: {
      queryKey: ENTITLEMENTS_KEY,
      staleTime: 60_000,
      // A failed entitlements fetch must not retry-storm behind every gated control.
      retry: 1,
    },
  });
  const data = raw as EntitlementsPayload | undefined;

  return {
    data,
    isLoading,
    /**
     * Optimistic while loading: `true` until we know otherwise.
     *
     * The alternative — assume locked — flashes a padlock over every paid control on every
     * page load for a paying customer, which is a worse failure than briefly showing a
     * control that then locks. The server is the boundary either way; this only decides
     * what the first paint looks like.
     */
    can: (feature) => (data ? data.features[feature] === true : true),
    allows: (resource, action) => (data ? (data.permissions[resource]?.includes(action) ?? false) : true),
    limit: (key) => data?.limits[key] ?? null,
    usage: (metric) => data?.usage[metric] ?? 0,
    ratio: (metric, limitKey) => {
      const lim = data?.limits[limitKey];
      if (!lim) return 0;
      return Math.min(1, (data?.usage[metric] ?? 0) / lim);
    },
    atLimit: (metric, limitKey) => isAtLimit(data?.usage[metric] ?? 0, data?.limits[limitKey] ?? null),
    requiredPlan: (feature) => minPlanFor(feature),
    label: (feature) => FEATURES[feature].label,
    limitLabel: (key) => LIMITS[key].label,
  };
}
