import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { SettingsNav } from "@/components/settings/settings-nav";

/**
 * One area for everything that is not a form.
 *
 * ## Why these screens are together now
 *
 * They were spread over five entry points: three primary-nav slots (Team, API
 * keys, Usage), the avatar dropdown (Account, Workspace), and two tab strips
 * nested inside those. Three of the five nav slots were low-frequency admin
 * crowding out the job the product is for, while account and workspace settings
 * — the things you genuinely go looking for — were the ones hidden in a menu.
 * Worse, two different members-and-invites screens shipped at once, writing the
 * same rows, neither aware of the other.
 *
 * DESIGN.md §1.2 had described this shell from the start ("Settings shells:
 * left vertical menu, right content pane"); it just never got built.
 *
 * ## Why a layout rather than a catch-all route
 *
 * The rail lives here so it survives a section change — no remount, no scroll
 * reset — and each section gets to own its own `loading` and `error` states
 * instead of sharing one skeleton shaped like nothing in particular. It also
 * means an unknown segment 404s on its own, rather than through the
 * hand-assembled allow-lists this replaces.
 *
 * `/usage` deliberately stays outside: it is the one admin surface people check
 * repeatedly rather than once, so it keeps its nav slot and its full-width page.
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      {/* Settings is somewhere you go and then leave, not a tab you switch off.
          With the header's pills gone the logo is the only other way back, and
          asking someone to work that out is asking them to guess. */}
      <Link
        href="/dashboard"
        className="text-muted-foreground hover:text-foreground text-caption mb-3 inline-flex items-center gap-1 transition-colors duration-[var(--duration-micro)]"
      >
        <ChevronLeft className="size-3.5" strokeWidth={2} aria-hidden />
        Forms
      </Link>
      <h1 className="text-h1 mb-6">Settings</h1>

      {/* The frame is desktop-only. A card inset inside 375px is spent width. */}
      <div className="md:bg-card md:shadow-xs flex flex-col md:flex-row md:gap-0 md:overflow-hidden md:rounded-xl">
        <SettingsNav />

        {/*
          `@container/settings`, because the pane is not the viewport.

          With the rail present the pane is ~830px inside a 1152px page; without
          it, at 375px, the pane *is* the page. A section that splits into columns
          has to measure the space it actually has, or it stacks when there is
          room and crams when there is not.
        */}
        <div className="@container/settings min-w-0 flex-1 md:p-6">{children}</div>
      </div>
    </div>
  );
}
