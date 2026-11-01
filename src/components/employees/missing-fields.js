import { createContext, useContext } from "react";

// Fields of the open employee card that are still empty (a Set of profile columns). Provided by the card so
// that every field can outline itself in red without threading a prop through each section.
export const MissingFieldsContext = createContext(new Set());

export const useIsMissing = (field) => useContext(MissingFieldsContext).has(field);

// Red outline of the control(s) inside a labelled field.
export const MISSING_CONTROL = "[&_input]:border-destructive [&_input]:ring-1 [&_input]:ring-destructive [&_select]:border-destructive [&_select]:ring-1 [&_select]:ring-destructive";
