import React from "react";
import { useT } from "@/lib/use-t";
import { cn } from "@/lib/utils";
import { MISSING_CONTROL, useIsMissing } from "./missing-fields";

// A labelled field of an employee card (Gestion › Employés). `name` = the profile column: when it is one of
// the required fields still empty, the label turns red and the control gets a red outline.
export default function EmployeeField({ label, name, children }) {
  const t = useT();
  const missing = useIsMissing(name);
  return (
    <label className={cn("block space-y-1", missing && MISSING_CONTROL)}>
      <span className={cn("text-xs font-medium uppercase tracking-wide text-muted-foreground", missing && "text-destructive")}>
        {label}{missing && <span className="ms-1 normal-case tracking-normal">· {t("employees.toFill")}</span>}
      </span>
      {children}
    </label>
  );
}
