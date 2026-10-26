import { createContext, useContext } from "react";

// Does the Gestion sidebar (desktop rail or full, phone drawer) list the tabs of a many-tab page
// under its entry? false while the desktop menu is folded away, so the page shows its own tabs then.
export const SidebarTabsContext = createContext(false);
export const useSidebarTabs = () => useContext(SidebarTabsContext);
