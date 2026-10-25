import React from "react";

// A labelled field of an employee card (Gestion › Employés).
export default function EmployeeField({ label, children }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
