import React from "react";
import { ChevronDown } from "lucide-react";

// Foldable panel built on native <details> so there is no extra state to track.
export default function Fold({ icon: Icon, title, children, defaultOpen = false }) {
  return (
    <details className="group rounded-lg border bg-card" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm font-semibold select-none [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">{Icon && <Icon className="h-4 w-4" />}{title}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t p-3">{children}</div>
    </details>
  );
}
