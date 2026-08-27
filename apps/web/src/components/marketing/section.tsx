import { cn } from "@/lib/utils";
import { Reveal } from "./reveal";

/**
 * One section shell so the page keeps a single vertical rhythm and a single
 * heading treatment. Every band on the landing page goes through this.
 */
export function Section({
  id,
  eyebrow,
  title,
  lede,
  children,
  align = "left",
  tone = "default",
  className,
  containerClassName,
}: {
  id?: string;
  eyebrow?: string;
  title?: React.ReactNode;
  lede?: React.ReactNode;
  children?: React.ReactNode;
  align?: "left" | "center";
  tone?: "default" | "muted" | "ink";
  className?: string;
  containerClassName?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        "scroll-mt-20 px-6 py-20 sm:py-28",
        tone === "muted" && "bg-muted/40",
        tone === "ink" && "bg-foreground text-background dark:bg-card dark:text-foreground",
        className,
      )}
    >
      <div className={cn("mx-auto max-w-6xl", containerClassName)}>
        {(eyebrow || title || lede) && (
          <Reveal className={cn("max-w-2xl", align === "center" && "mx-auto text-center")}>
            {eyebrow && (
              <p className="text-primary text-micro mb-3 font-semibold tracking-[0.14em] uppercase">
                {eyebrow}
              </p>
            )}
            {title && (
              <h2 className="text-display-lg text-balance">{title}</h2>
            )}
            {lede && (
              <p
                className={cn(
                  "text-body-lg mt-4 text-balance",
                  tone === "ink" ? "opacity-70" : "text-muted-foreground",
                )}
              >
                {lede}
              </p>
            )}
          </Reveal>
        )}
        {children && <div className={cn(title && "mt-12 sm:mt-16")}>{children}</div>}
      </div>
    </section>
  );
}
