"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { GOOGLE_FONTS } from "@repo/form-schema";
import { ensureStylesheet, findFont, fontPreviewHref, fontStack, themeFontsHref } from "@/lib/theme-fonts";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

const CATEGORY_LABEL = {
  sans: "Sans",
  serif: "Serif",
  display: "Display",
  handwriting: "Handwriting",
  mono: "Mono",
} as const;

/**
 * One row, set in its own face.
 *
 * The face is fetched only once the row scrolls into view, and only the
 * glyphs of its own name (`text=`), so opening a list of six hundred fonts
 * costs a handful of sub-kilobyte requests rather than six hundred families.
 */
function FontRow({ family, category, selected, onPick }: {
  family: string;
  category: keyof typeof CATEGORY_LABEL;
  selected: boolean;
  onPick: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        ensureStylesheet(fontPreviewHref(family));
        setSeen(true);
        io.disconnect();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [family, seen]);

  return (
    <CommandItem ref={ref} value={family} keywords={[category, CATEGORY_LABEL[category]]} onSelect={onPick}>
      <Check className={cn("size-3.5", selected ? "opacity-100" : "opacity-0")} />
      <span className="min-w-0 flex-1 truncate text-[0.9375rem]" style={{ fontFamily: seen ? fontStack(family) : undefined }}>
        {family}
      </span>
      <span className="text-muted-foreground text-xs">{CATEGORY_LABEL[category]}</span>
    </CommandItem>
  );
}

/**
 * A searchable list of Google Fonts, each previewed in itself.
 *
 * A name typed before this existed and not in the catalogue is still shown as
 * the value, and still applied as a local font, so no form loses its setting.
 */
export function FontPicker({ id, value, onChange }: { id?: string; value: string; onChange: (family: string) => void }) {
  const [open, setOpen] = useState(false);
  const known = findFont(value);

  // The trigger wears the chosen face, which needs the full family, not a preview.
  useEffect(() => {
    const href = themeFontsHref({ fontHeading: value, fontBody: value });
    if (href) ensureStylesheet(href);
  }, [value]);

  return (
    // Modal because it opens inside the Design sheet, whose scroll lock ate
    // every wheel event aimed at a list portalled outside it: 600 fonts and no
    // way to scroll to the ninth. A modal popover carries its own lock, with
    // the list inside it.
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          // The Select trigger's own surface, so it sits in the panel like the
          // Corners and Pattern pickers beside it rather than as a hole in it.
          className="border-input dark:bg-input/30 dark:hover:bg-input/50 hover:bg-muted/40 flex h-9 w-full items-center gap-2 rounded-md border bg-transparent px-3 text-left text-sm shadow-xs transition-colors outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <span className="min-w-0 flex-1 truncate" style={{ fontFamily: fontStack(value) }}>
            {value || "Choose a font"}
          </span>
          {known && <span className="text-muted-foreground text-xs">{CATEGORY_LABEL[known[1]]}</span>}
          <ChevronsUpDown className="text-muted-foreground size-3.5 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search 600 fonts, or serif, mono…" />
          <CommandList className="max-h-72">
            <CommandEmpty>No font by that name.</CommandEmpty>
            {GOOGLE_FONTS.map(([family, category]) => (
              <FontRow
                key={family}
                family={family}
                category={category}
                selected={family === known?.[0]}
                onPick={() => {
                  onChange(family);
                  setOpen(false);
                }}
              />
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
