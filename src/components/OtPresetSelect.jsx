import React from "react";
import { Select } from "@/components/ui/select";
import { matchPreset } from "@/lib/preset-work-orders";
import { useT } from "@/lib/use-t";

// « OT prédéfini » drop-down next to the OT field: picking a label writes it as the OT. It shows the label when the
// OT typed is one of them, and nothing is shown at all when the list is empty.
export default function OtPresetSelect({ ot, presets, onPick, disabled, id = "ot-preset", className }) {
  const t = useT();
  if (!presets?.length) return null;
  return (
    <Select
      id={id}
      aria-label={t("form.otPreset")}
      value={matchPreset(ot, presets) || ""}
      onChange={(event) => { if (event.target.value) onPick(event.target.value); }}
      disabled={disabled}
      className={className || "h-9 text-xs sm:h-10 sm:text-sm"}
    >
      <option value="">{t("form.otPresetPlaceholder")}</option>
      {presets.map((label) => <option key={label} value={label}>{label}</option>)}
    </Select>
  );
}
