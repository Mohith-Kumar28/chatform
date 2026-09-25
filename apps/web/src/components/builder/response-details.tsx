import {
  CHANNEL_LABELS,
  countryFlag,
  countryName,
  DEVICE_LABELS,
  respondentTimeZone,
  wallClockIn,
} from "@repo/form-schema";
import type { GetApiFormsByIdSubmissions200SubmissionsItemMetadata } from "@/lib/api/generated.schemas";
import { zoneCity } from "@/lib/format";

export type ResponseMetadata = NonNullable<GetApiFormsByIdSubmissions200SubmissionsItemMetadata>;

function join(...parts: Array<string | null | undefined>): string | null {
  const kept = parts.filter((p): p is string => Boolean(p));
  return kept.length > 0 ? kept.join(" ") : null;
}

/**
 * Where a response was filled in from, and on what.
 *
 * A plain labelled list in the same field-over-value style as the answers. A
 * row with nothing recorded is left out rather than printed as "Unknown", and
 * a section with no rows is left out with it.
 */
export function ResponseDetails({
  metadata,
  at,
}: {
  metadata: ResponseMetadata | null | undefined;
  /** When it was submitted (or started), for the "their local time" row. */
  at: number;
}) {
  if (!metadata) {
    return (
      <p className="text-muted-foreground text-sm">
        No details were recorded for this response. Responses from before details were collected only
        show a country, if that.
      </p>
    );
  }

  const { geo, device } = metadata;
  const utm = Object.entries(metadata.utm ?? {});
  const zone = respondentTimeZone(metadata);
  const flag = countryFlag(geo.country);
  const country = countryName(geo.country);

  const sections: Array<{ title: string; rows: Array<[string, string | null]> }> = [
    {
      title: "Where they filled it",
      rows: [
        ["Channel", CHANNEL_LABELS[metadata.channel] ?? metadata.channel],
        ["Page", metadata.pageUrl],
        ["Came from", metadata.referrer],
        ...utm.map(([key, value]): [string, string] => [`utm_${key}`, value]),
      ],
    },
    {
      title: "Location",
      rows: [
        ["Country", country && flag ? `${flag} ${country}` : country],
        ["Region", geo.region],
        ["City", join(geo.city, geo.postalCode)],
        [
          "Coordinates",
          geo.latitude !== null && geo.longitude !== null ? `${geo.latitude}, ${geo.longitude}` : null,
        ],
        ["Time zone", zone],
        ["Their local time", zone ? `${wallClockIn(at, zone)} (${zoneCity(zone)})` : null],
      ],
    },
    {
      title: "Device",
      rows: [
        ["Type", device.type ? (DEVICE_LABELS[device.type] ?? device.type) : null],
        ["Browser", join(device.browser, device.browserVersion)],
        ["Operating system", join(device.os, device.osVersion)],
        ["Screen", metadata.screen ? metadata.screen.replace("x", " × ") : null],
        ["Language", metadata.language],
        ["Network", metadata.network.organization],
      ],
    },
  ];

  return (
    <div className="space-y-6">
      {sections.map((section) => {
        const rows = section.rows.filter(([, value]) => value);
        if (rows.length === 0) return null;
        return (
          <section key={section.title}>
            <h3 className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
              {section.title}
            </h3>
            <dl className="divide-y">
              {rows.map(([label, value]) => (
                <div key={label} className="flex gap-4 py-2 first:pt-0 last:pb-0">
                  <dt className="text-muted-foreground text-caption w-32 shrink-0 pt-0.5">{label}</dt>
                  <dd className="min-w-0 flex-1 text-sm font-medium break-words">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        );
      })}
      <p className="text-muted-foreground text-caption">
        Location comes from the respondent&apos;s internet connection, so it is accurate to the city, not
        the street, and a VPN shows the VPN&apos;s location.
      </p>
    </div>
  );
}
