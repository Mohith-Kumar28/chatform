import Link from "next/link";
import { ChevronDown, Sparkles } from "lucide-react";
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
 * The three ways into the catalogue: by goal, by role, by form type, and the
 * categories inside each type folded away until they are wanted.
 *
 * Plain links in native disclosures. Every hub is its own indexable page, and
 * `<details>` keeps every link in the HTML whether a group is open or not, so
 * a crawler that lands on any hub still reaches them all.
 */
export function CollectionsNav({ current }: { current?: string }) {
  const goals = GOALS.map((g) => ({ href: goalPath(g.slug), label: g.label, count: byGoal(g.slug).length })).filter((l) => l.count > 0);
  const roles = ROLES.map((r) => ({ href: rolePath(r.slug), label: r.label, count: byRole(r.slug).length })).filter((l) => l.count > 0);
  const inCategories = TYPES.some((t) => t.categories.some((c) => current === categoryPath(t.type, c.slug)));

  return (
    <nav aria-label="Browse templates" className="flex flex-col gap-1 text-[0.9375rem]">
      <Group title="By goal" open>
        {goals.map((l) => (
          <NavLink key={l.href} {...l} active={current === l.href} />
        ))}
      </Group>
      <Group title="By role" open>
        {roles.map((l) => (
          <NavLink key={l.href} {...l} active={current === l.href} />
        ))}
      </Group>
      <Group title="By form type" open>
        <NavLink href="/form-templates" label="All templates" count={TEMPLATE_COUNT} active={current === "/form-templates"} showCount />
        {TYPES.map((t) => (
          <NavLink
            key={t.type}
            href={typePath(t.type)}
            label={t.plural}
            count={byType(t.type).length}
            active={current === typePath(t.type)}
            showCount
          />
        ))}
      </Group>
      <Group title="Browse by category" open={inCategories} divided>
        {TYPES.map((t) => (
          <div key={t.type} className="mt-2 first:mt-0">
            <p className="text-foreground/55 px-3 pt-1 pb-1 text-xs font-semibold tracking-wide uppercase">{t.plural}</p>
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
                  showCount
                />
              ))}
          </div>
        ))}
      </Group>

      <div className="border-border/70 mt-3 border-t pt-5">
        <p className="text-foreground/70 text-sm">Have something else in mind?</p>
        <Link href="/ai-form-builder" className="text-foreground hover:text-primary mt-1.5 inline-flex items-center gap-1.5 text-sm font-semibold">
          <Sparkles className="text-primary size-4" />
          Build it with AI
        </Link>
      </div>
    </nav>
  );
}

function Group({
  title,
  open,
  divided,
  children,
}: {
  title: string;
  open?: boolean;
  divided?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={open} className={cn("group/g", divided && "border-border/70 mt-2 border-t pt-3")}>
      <summary className="text-foreground flex cursor-pointer list-none items-center justify-between rounded-lg px-3 py-2 font-semibold [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown className="text-foreground/50 size-4 transition-transform duration-[var(--duration-micro)] group-open/g:rotate-180 motion-reduce:transition-none" />
      </summary>
      <ul className="mb-2 flex flex-col">{children}</ul>
    </details>
  );
}

function NavLink({
  href,
  label,
  count,
  active,
  showCount,
}: {
  href: string;
  label: string;
  count: number;
  active?: boolean;
  showCount?: boolean;
}) {
  return (
    <li className="list-none">
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center justify-between gap-3 rounded-lg px-3 py-1.5 transition-colors duration-[var(--duration-micro)]",
          active ? "bg-primary/10 text-foreground font-semibold" : "text-foreground/75 hover:text-foreground hover:bg-accent/50",
        )}
      >
        <span className="truncate">{label}</span>
        {showCount && <span className="text-foreground/50 tabular text-xs">{count}</span>}
      </Link>
    </li>
  );
}
