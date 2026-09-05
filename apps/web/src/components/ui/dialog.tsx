"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { XIcon } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        // The z-index scale in globals.css exists precisely so these layers
        // have a declared order. This was a bare `z-50` while the command
        // palette sits at `--z-modal` (60) — so the palette rendered *over*
        // an open dialog rather than under it.
        "fixed inset-0 z-[var(--z-overlay)] bg-black/50 backdrop-blur-[2px] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
        className
      )}
      {...props}
    />
  )
}

/**
 * Sizes, because callers were reaching past the component to set their own.
 *
 * `DialogContent` used to bake in one width (`sm:max-w-lg`), so anything
 * wider — DESIGN.md §2.2's create screen, §2.10's generate modal — had to
 * pass a `className` that raced the component's own class. Now the width is
 * a prop, and `lg` is the default so every existing call site is unchanged.
 *
 * `layout="panel"` drops the padding and switches to a column, for dialogs
 * that pin their own header and footer around a scrolling `DialogBody`.
 */
const dialogContentVariants = cva(
  [
    "fixed top-[50%] left-[50%] z-[var(--z-modal)] w-full max-w-[calc(100%-2rem)]",
    "translate-x-[-50%] translate-y-[-50%] border bg-background shadow-lg outline-none",
    // Modals are rounded-2xl (DESIGN.md §4.3) — cards are xl, modals are one
    // step softer.
    "rounded-2xl",
    "duration-[var(--duration-enter)] ease-[var(--ease-out)]",
    "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
    "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
  ],
  {
    variants: {
      size: {
        sm: "sm:max-w-sm",
        md: "sm:max-w-md",
        lg: "sm:max-w-lg",
        xl: "sm:max-w-xl",
        "2xl": "sm:max-w-2xl",
        "3xl": "sm:max-w-3xl",
        "4xl": "sm:max-w-4xl",
        full: "sm:max-w-[min(72rem,calc(100vw-4rem))]",
      },
      layout: {
        default: "grid gap-4 p-6",
        panel: "flex max-h-[min(46rem,calc(100dvh-4rem))] flex-col overflow-hidden p-0",
      },
    },
    defaultVariants: {
      size: "lg",
      layout: "default",
    },
  }
)

function DialogContent({
  className,
  children,
  size,
  layout,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> &
  VariantProps<typeof dialogContentVariants> & {
    showCloseButton?: boolean
  }) {
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        data-size={size ?? "lg"}
        className={cn(dialogContentVariants({ size, layout }), className)}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="absolute top-4 right-4 z-10 grid size-7 place-items-center rounded-full text-muted-foreground transition-colors duration-[var(--duration-micro)] hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  )
}

/**
 * The scrolling middle of a `layout="panel"` dialog. `min-h-0` is what lets
 * it actually shrink inside the flex column — without it the body grows and
 * the pinned footer is pushed off the bottom of the viewport.
 */
function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-body"
      className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">Close</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
  dialogContentVariants,
}
