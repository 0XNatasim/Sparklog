import React, { useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { matchPreset } from "@/lib/preset-work-orders";
import { useT } from "@/lib/use-t";

// The OT field: free text (a work order number) and, in the same box, a small arrow that opens the pre-made
// work orders (0124). Picking one writes its label as the OT. Without any pre-made label there is no arrow.
export default function OtField({ id = "ot", value, onChange, presets, disabled, className, ...props }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const hasPresets = Boolean(presets?.length);
  const picked = matchPreset(value, presets || []);
  const closeOnLeave = (event) => { if (!box.current?.contains(event.relatedTarget)) setOpen(false); };
  return (
    <div ref={box} className="relative" onBlur={closeOnLeave} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}>
      <Input id={id} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}
        className={cn(hasPresets && "pr-9", className)} {...props} />
      {hasPresets && (
        <button type="button" aria-label={t("form.otPreset")} aria-haspopup="listbox" aria-expanded={open} disabled={disabled}
          onClick={() => setOpen((current) => !current)}
          className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-50">
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} aria-hidden="true" />
        </button>
      )}
      {hasPresets && open && (
        <ul role="listbox" aria-label={t("form.otPreset")} className="absolute left-0 right-0 z-30 mt-1 max-h-56 overflow-auto rounded-md border bg-popover p-1 text-sm text-popover-foreground shadow-md">
          {presets.map((label) => (
            <li key={label} role="option" aria-selected={label === picked}>
              <button type="button" className={cn("w-full rounded-sm px-2 py-1.5 text-left hover:bg-muted", label === picked && "font-semibold")}
                onClick={() => { onChange(label); setOpen(false); }}>
                {label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
