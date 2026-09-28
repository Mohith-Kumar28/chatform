"use client";

import { useMemo, useState } from "react";
import { keepPreviousData, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Archive } from "lucide-react";
import {
  getGetApiAdminCampaignsQueryKey,
  useDeleteApiAdminCampaignsById,
  useGetApiAdminCampaigns,
  usePostApiAdminCampaigns,
} from "@/lib/api/admin/admin";
import type { GetApiAdminCampaigns200 } from "@/lib/api/generated.schemas";
import { ChartCard } from "@/components/charts/chart-kit";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { apiData } from "@/lib/api/payload";
import { SITE_ORIGIN } from "@/lib/seo";
import { DataTable } from "./data-table";
import { RangePicker, useRange, type Range } from "./range-picker";
import { compact } from "./format";

/**
 * Campaign links, and what each one brought: visitors, then the accounts that
 * signed up from it and how far each got, the same stages as the overview
 * funnel. Below, the mail we send, and how many visits it started.
 *
 * A link is only its UTMs. Saving one names it so it is listed before its
 * first visitor; the counting works on any tagged link, saved or not.
 */

const RANGES = ["1d", "7d", "30d", "90d"] as const satisfies readonly Range[];
type Report = GetApiAdminCampaigns200;

/** Suggestions only; anything typed is kept (lowercased, spaces as dashes). */
const SOURCES = ["instagram", "youtube", "tiktok", "linkedin", "x", "reddit", "whatsapp", "facebook", "google", "newsletter"];
const MEDIUMS = ["ugc", "social", "paid", "influencer", "email", "referral", "community"];
const DESTINATIONS = [
  { label: "Home", path: "/" },
  { label: "Pricing", path: "/pricing" },
  { label: "Templates", path: "/form-templates" },
  { label: "Sign up", path: "/signin" },
];

const clean = (v: string) => v.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9_.\-+]/g, "");

export function buildCampaignUrl(link: { destination: string; source: string; medium: string; campaign: string; content?: string | null }) {
  const url = new URL(link.destination || "/", SITE_ORIGIN);
  url.searchParams.set("utm_source", link.source);
  url.searchParams.set("utm_medium", link.medium);
  url.searchParams.set("utm_campaign", link.campaign);
  if (link.content) url.searchParams.set("utm_content", link.content);
  return url.toString();
}

/** The funnel's stages, short enough for a table header. The full names are in the hint. */
const SHORT_STAGE: Record<string, string> = {
  signed_up: "Sign-ups",
  created_form: "Built a form",
  published: "Published",
  form_opened: "Got opened",
  first_response: "1st response",
  ten_responses: "10 responses",
  paid: "Paid",
};

/** Mail kinds as the sender would name them. */
const MAIL_LABEL: Record<string, string> = {
  followup: "Follow-up to a respondent",
  submission: "New response, to the form owner",
  submission_receipt: "Receipt, to the respondent",
  invitation: "Team invitation",
  invitation_accepted: "Invitation accepted",
  access_granted: "Access granted",
  plan_upgraded: "Plan upgraded",
  plan_lapse: "Plan ending",
  password_reset: "Password reset",
  otp: "Sign-in code",
};

function LinkBuilder({ onSaved }: { onSaved: () => void }) {
  const [destination, setDestination] = useState("/");
  const [source, setSource] = useState("");
  const [medium, setMedium] = useState("ugc");
  const [campaign, setCampaign] = useState("");
  const [content, setContent] = useState("");
  const save = usePostApiAdminCampaigns();

  const ready = clean(source) && clean(medium) && clean(campaign) && destination.startsWith("/");
  const url = ready
    ? buildCampaignUrl({ destination, source: clean(source), medium: clean(medium), campaign: clean(campaign), content: clean(content) || null })
    : null;

  return (
    <ChartCard
      title="New campaign link"
      hint="Give every creator or post its own content value, so each one gets its own row. Links to a form work too: use /f/ and the form's link name."
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-1.5">
          <Label htmlFor="cl-dest">Page</Label>
          <Input id="cl-dest" list="cl-dests" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="/pricing" />
          <datalist id="cl-dests">
            {DESTINATIONS.map((d) => (
              <option key={d.path} value={d.path}>
                {d.label}
              </option>
            ))}
          </datalist>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cl-source">Source</Label>
          <Input id="cl-source" list="cl-sources" value={source} onChange={(e) => setSource(e.target.value)} placeholder="instagram" />
          <datalist id="cl-sources">
            {SOURCES.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cl-medium">Medium</Label>
          <Input id="cl-medium" list="cl-mediums" value={medium} onChange={(e) => setMedium(e.target.value)} placeholder="ugc" />
          <datalist id="cl-mediums">
            {MEDIUMS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cl-campaign">Campaign</Label>
          <Input id="cl-campaign" value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder="october-ugc" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cl-content">Creator or post</Label>
          <Input id="cl-content" value={content} onChange={(e) => setContent(e.target.value)} placeholder="optional" />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <code className="bg-muted min-w-0 flex-1 truncate rounded-md px-3 py-2 text-xs" title={url ?? undefined}>
          {url ?? "Fill in source, medium and campaign"}
        </code>
        <Button
          disabled={!url || save.isPending}
          onClick={async () => {
            if (!url) return;
            try {
              await save.mutateAsync({
                data: {
                  name: content ? `${campaign} · ${content}` : campaign,
                  destination,
                  source: clean(source),
                  medium: clean(medium),
                  campaign: clean(campaign),
                  content: clean(content) || undefined,
                },
              });
              await navigator.clipboard.writeText(url).catch(() => {});
              toast.success("Saved and copied");
              setContent("");
              onSaved();
            } catch {
              toast.error("Could not save the link");
            }
          }}
        >
          Save and copy
        </Button>
      </div>
    </ChartCard>
  );
}

export function CampaignsClient() {
  const range = useRange(RANGES, "30d");
  const queryClient = useQueryClient();
  const params = { range: range as (typeof RANGES)[number] };
  const { data, isPending } = useGetApiAdminCampaigns(params, {
    query: { queryKey: getGetApiAdminCampaignsQueryKey(params), staleTime: 60_000, placeholderData: keepPreviousData },
  });
  const archive = useDeleteApiAdminCampaignsById();
  const report = apiData<Report | undefined>(data);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["/api/admin/campaigns"] });

  const rows = useMemo(() => {
    if (!report) return [];
    const statsOf = new Map(report.stats.map((s) => [s.campaign, s]));
    const linked = new Set<string>();
    type Link = Report["links"][number];
    const out: { key: string; link: Link | undefined; campaign: string; name: string; stats: Report["stats"][number] | undefined }[] = report.links.map((l) => {
      linked.add(l.campaign);
      return { key: l.id, link: l, campaign: l.campaign, name: l.name, stats: statsOf.get(l.campaign) };
    });
    // Tagged traffic nobody saved a link for still gets a row: somebody made that link by hand.
    for (const s of report.stats) {
      if (!linked.has(s.campaign)) out.push({ key: `c:${s.campaign}`, link: undefined, campaign: s.campaign, name: s.campaign, stats: s });
    }
    return out.sort((a, b) => (b.stats?.visitors ?? 0) - (a.stats?.visitors ?? 0));
  }, [report]);

  type Row = (typeof rows)[number];
  const stage = (r: Row, key: string) => r.stats?.stages[key] ?? 0;
  const labels = report?.stageLabels ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-h1">Campaigns</h1>
        <RangePicker ranges={RANGES} fallback="30d" />
      </div>

      <LinkBuilder onSaved={refresh} />

      {isPending || !report ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : (
        <>
          {!report.configured && (
            <p className="bg-muted text-muted-foreground rounded-lg px-4 py-3 text-sm">
              Visitor counts need <code>CF_ANALYTICS_TOKEN</code> on the API. Sign-ups below are counted already.
            </p>
          )}
          <ChartCard
            title="What each campaign brought"
            hint="Visitors who arrived on the campaign's link. Sign-ups are credited to the campaign of the visit they signed up on. Each later column is how many of those accounts got that far, at any time since."
          >
            <DataTable
              rows={rows}
              minWidth="60rem"
              empty="No campaigns yet. Make a link above and share it."
              columns={[
                {
                  key: "name",
                  header: "Campaign",
                  render: (r) => (
                    <div className="min-w-0">
                      <div className="truncate font-medium">{r.name}</div>
                      {r.link && (
                        <div className="text-muted-foreground truncate text-xs">
                          {r.link.source} · {r.link.medium} · {r.link.destination}
                        </div>
                      )}
                    </div>
                  ),
                },
                { key: "visitors", header: "Visitors", numeric: true, width: "5.5rem", render: (r) => compact(r.stats?.visitors ?? 0) },
                ...labels.map((l) => ({
                  key: l.key,
                  header: SHORT_STAGE[l.key] ?? l.label,
                  numeric: true,
                  width: "6.5rem",
                  render: (r: Row) => {
                    const n = stage(r, l.key);
                    const top = stage(r, "signed_up");
                    return l.key === "signed_up" || n === 0 || top === 0 ? n.toLocaleString() : `${n} (${Math.round((n / top) * 100)}%)`;
                  },
                })),
                {
                  key: "actions",
                  header: "",
                  width: "5.5rem",
                  render: (r) =>
                    r.link ? (
                      <div className="flex justify-end gap-1">
                        <CopyButton value={buildCampaignUrl(r.link)} toastMessage="Link copied" />
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Archive link"
                          onClick={async () => {
                            await archive.mutateAsync({ id: r.link!.id });
                            void refresh();
                          }}
                        >
                          <Archive className="size-4" />
                        </Button>
                      </div>
                    ) : null,
                },
              ]}
            />
          </ChartCard>

          <div className="grid gap-3 lg:grid-cols-3">
            <ChartCard
              className="min-w-0 lg:col-span-2"
              title="Mail we send"
              hint="Every link in our mail is tagged with the mail it came from. Visits are counted when the link is opened in a browser. Opens are not tracked: mail apps preload images, so an open count would be mostly machines."
            >
              <DataTable
                rows={report.email}
                minWidth="30rem"
                empty="No mail in this period."
                columns={[
                  { key: "kind", header: "Mail", render: (r) => MAIL_LABEL[r.kind] ?? r.kind },
                  { key: "sent", header: "Sent", numeric: true, width: "5.5rem", render: (r) => r.sent.toLocaleString() },
                  { key: "visits", header: "Visits", numeric: true, width: "5.5rem", render: (r) => r.visits.toLocaleString() },
                  {
                    key: "rate",
                    header: "Per mail",
                    numeric: true,
                    width: "5.5rem",
                    render: (r) => (r.sent > 0 ? `${Math.round((r.visits / r.sent) * 100)}%` : "–"),
                  },
                ]}
              />
            </ChartCard>
            <ChartCard title="Follow-ups" hint="Reminders sent to respondents who left a form unfinished.">
              <div className="grid grid-cols-3 gap-3">
                {(
                  [
                    ["Sent", report.followups.sent],
                    ["Clicked", report.followups.clicked],
                    ["Finished", report.followups.recovered],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label}>
                    <div className="text-2xl font-semibold tabular-nums">{value.toLocaleString()}</div>
                    <div className="text-muted-foreground text-caption">
                      {label}
                      {label !== "Sent" && report.followups.sent > 0 ? ` · ${Math.round((value / report.followups.sent) * 100)}%` : ""}
                    </div>
                  </div>
                ))}
              </div>
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}
