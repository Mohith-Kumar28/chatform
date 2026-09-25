import type { GetApiFormsByIdSubmissions200SubmissionsItemMetadata } from "@/lib/api/generated.schemas";

export type ResponseMetadata = NonNullable<GetApiFormsByIdSubmissions200SubmissionsItemMetadata>;

const CHANNEL_LABELS: Record<string, string> = {
  link: "Direct link",
  inline: "Embedded on a page",
  popup: "Popup on a page",
  side_tab: "Side tab on a page",
  fullpage: "Full-page embed",
  embed: "Embedded on a page",
  api: "API",
};

const DEVICE_LABELS: Record<string, string> = {
  mobile: "Phone",
  tablet: "Tablet",
  desktop: "Computer",
  bot: "Bot or script",
};

export function countryName(code: string | null | undefined): string | null {
  if (!code) return null;
  if (code.length !== 2) return code;
  try {
    return new Intl.DisplayNames(undefined, { type: "region" }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

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
export function ResponseDetails({ metadata }: { metadata: ResponseMetadata | null | undefined }) {
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
        ["Country", countryName(geo.country)],
        ["Region", geo.region],
        ["City", join(geo.city, geo.postalCode)],
        [
          "Coordinates",
          geo.latitude !== null && geo.longitude !== null ? `${geo.latitude}, ${geo.longitude}` : null,
        ],
        ["Time zone", metadata.timezone ?? geo.timezone],
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
