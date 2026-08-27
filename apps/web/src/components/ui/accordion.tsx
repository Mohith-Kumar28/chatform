"use client";

import { ChevronDown } from "lucide-react";
import { Accordion as AccordionPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * The FAQ pattern, and the only place in the product that needs one.
 *
 * Radix animates height through `--radix-accordion-content-height`; the
 * keyframes live here rather than in globals.css because nothing else uses
 * them, and the global reduced-motion collapse already neutralises both.
 */

function Accordion({ ...props }: React.ComponentProps<typeof AccordionPrimitive.Root>) {
  return <AccordionPrimitive.Root data-slot="accordion" {...props} />;
}

function AccordionItem({
  className,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Item>) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn("border-border/70 border-b last:border-b-0", className)}
      {...props}
    />
  );
}

function AccordionTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Trigger>) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          "text-h3 group flex flex-1 items-start justify-between gap-4 py-5 text-left",
          "transition-colors duration-[var(--duration-micro)] ease-[var(--ease-out)]",
          "hover:text-primary focus-visible:ring-ring/50 rounded-sm outline-none focus-visible:ring-[3px]",
          className,
        )}
        {...props}
      >
        {children}
        <ChevronDown
          className="text-muted-foreground mt-0.5 size-4 shrink-0 transition-transform duration-[var(--duration-standard)] ease-[var(--ease-out)] group-data-[state=open]:rotate-180"
          strokeWidth={1.75}
        />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

function AccordionContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Content>) {
  return (
    <AccordionPrimitive.Content
      data-slot="accordion-content"
      className="overflow-hidden data-[state=closed]:animate-[cf-accordion-up_180ms_var(--ease-out)] data-[state=open]:animate-[cf-accordion-down_180ms_var(--ease-out)]"
      {...props}
    >
      <div className={cn("text-body-lg text-muted-foreground max-w-2xl pb-5", className)}>
        {children}
      </div>
    </AccordionPrimitive.Content>
  );
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
