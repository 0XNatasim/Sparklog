import { createContext, useContext } from "react";

// Is the desktop Gestion sidebar shown (full or rail)? It then lists the tabs of a many-tab page under
// its entry, so the page hides its own row on desktop. false while the desktop menu is folded away.
export const SidebarTabsContext = createContext(false);
export const useSidebarTabs = () => useContext(SidebarTabsContext);
