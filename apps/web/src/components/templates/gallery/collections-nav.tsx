import Link from "next/link";
import {
  GOALS,
  ROLES,
  TEMPLATE_COUNT,
  TYPES,
  byCategory,
  byGoal,
  byRole,
  byType,
  categoryPath,
  goalPath,
  rolePath,
  typePath,
} from "@/content/templates";
import { cn } from "@/lib/utils";

/**
 * The three ways into the catalogue, as plain links with counts: by goal, by
 * role, by form type (and each type's categories).
 *
 * Plain links on purpose. Every hub is its own indexable page, and this list
 * is how a crawler reaches all of them from any page in the gallery.
 */
export function CollectionsNav({ current }: { current?: string }) {
  const groups = [
    {
      title: "By goal",
      links: GOALS.map((g) => ({ href: goalPath(g.slug), label: g.label, count: byGoal(g.slug).length })),
    },
    {
      title: "By role",
      links: ROLES.map((r) => ({ href: rolePath(r.slug), label: r.label, count: byRole(r.slug).length })),
    },
  ];

  return (
    <nav aria-label="Browse templates" className="flex flex-col gap-7 text-sm">
      {groups.map((group) => (
        <div key={group.title}>
          <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{group.title}</h2>
          <ul className="mt-2 flex flex-col">
            {group.links
              .filter((l) => l.count > 0)
              .map((l) => (
                <NavLink key={l.href} {...l} active={current === l.href} />
              ))}
          </ul>
        </div>
      ))}

      <div>
        <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">By form type</h2>
        <ul className="mt-2 flex flex-col">
          <NavLink href="/form-templates" label="All templates" count={TEMPLATE_COUNT} active={current === "/form-templates"} />
          {TYPES.map((t) => (
            <li key={t.type}>
              <ul className="flex flex-col">
                <NavLink href={typePath(t.type)} label={t.plural} count={byType(t.type).length} active={current === typePath(t.type)} strong />
                {t.categories
                  .map((c) => ({ ...c, count: byCategory(t.type, c.slug).length }))
                  .filter((c) => c.count > 0)
                  .map((c) => (
                    <NavLink
                      key={c.slug}
                      href={categoryPath(t.type, c.slug)}
                      label={c.label}
                      count={c.count}
                      active={current === categoryPath(t.type, c.slug)}
                      indent
                    />
                  ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

function NavLink({
  href,
  label,
  count,
  active,
  indent,
  strong,
}: {
  href: string;
  label: string;
  count: number;
  active?: boolean;
  indent?: boolean;
  strong?: boolean;
}) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "hover:bg-accent/60 flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 transition-colors duration-[var(--duration-micro)]",
          indent && "pl-5",
          strong && "font-medium",
          active ? "bg-accent text-foreground font-medium" : "text-foreground/85",
        )}
      >
        <span className="truncate">{label}</span>
        <span className="text-muted-foreground tabular text-xs">{count}</span>
      </Link>
    </li>
  );
}
