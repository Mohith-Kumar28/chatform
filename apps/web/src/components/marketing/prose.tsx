import { cn } from "@/lib/utils";

/**
 * Long-form body copy, on the marketing side of the site.
 *
 * The docs get Fumadocs' own typography, which is tuned for reference material
 * — dense, tight leading, a heading every few lines. An essay wants the
 * opposite, and it wants to sit inside a `Band` rather than inside a docs
 * shell, so this styles the rendered MDX directly rather than borrowing the
 * docs layout.
 *
 * Written as arbitrary-variant utilities rather than a `@utility` block in
 * globals.css because this is the only thing that uses it, and a global class
 * name is a promise that other things may.
 */
export function Prose({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "text-body-lg max-w-2xl leading-[1.7]",
        "[&>*+*]:mt-5",
        "[&_h2]:font-display [&_h2]:text-display [&_h2]:mt-12 [&_h2]:font-bold [&_h2]:tracking-[-0.02em] [&_h2]:text-balance",
        "[&_h3]:text-h1 [&_h3]:font-display [&_h3]:mt-9 [&_h3]:font-bold",
        "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4",
        "[&_strong]:font-semibold",
        "[&_ul]:flex [&_ul]:flex-col [&_ul]:gap-2.5 [&_ul]:pl-5 [&_ul]:list-disc",
        "[&_ol]:flex [&_ol]:flex-col [&_ol]:gap-2.5 [&_ol]:pl-5 [&_ol]:list-decimal",
        "[&_li]:pl-1 [&_li>ul]:mt-2.5",
        "[&_code]:font-mono [&_code]:text-[0.86em] [&_code]:bg-muted [&_code]:rounded [&_code]:px-1.5 [&_code]:py-0.5",
        "[&_pre]:bg-foreground [&_pre]:text-background [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:p-5",
        "[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-[0.82em]",
        "[&_blockquote]:border-primary/40 [&_blockquote]:text-muted-foreground [&_blockquote]:border-l-2 [&_blockquote]:pl-5",
        "[&_hr]:border-border/70 [&_hr]:my-10",
        className,
      )}
    >
      {children}
    </div>
  );
}
