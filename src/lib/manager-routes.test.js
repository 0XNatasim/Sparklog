import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MANAGER_NAV, MANAGER_NAV_ITEMS, OLD_PATHS } from "./manager-nav";

// Source-level contract for the Gestion routes. Read as text because the page modules need a
// Supabase client to load.
const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const app = read("../App.jsx");
const pages = read("../pages/manager/ManagerPages.jsx");

function definition(source, name) {
  const one = source.match(new RegExp(`^export const ${name} = .*;$`, "m"));
  if (one) return one[0];
  const start = source.indexOf(`export function ${name}(`);
  if (start < 0) return null;
  return source.slice(start, source.indexOf("\n}\n", start) + 2);
}
const routeOf = (path) => app.match(new RegExp(`<Route path="${path.replace("/", "\\/")}" element=\\{<([A-Za-z]+) />\\} />`))?.[1] || null;

describe("Gestion routes", () => {
  it("routes every menu entry", () => {
    for (const item of MANAGER_NAV.flatMap((group) => group.items)) {
      expect(routeOf(item.path), item.path).not.toBeNull();
    }
  });

  it("gives every tab of every page a content component", () => {
    for (const item of MANAGER_NAV_ITEMS.filter((i) => i.tabs)) {
      const exportName = routeOf(item.path);
      const def = definition(pages, exportName);
      const table = def.match(/content=\{([A-Z_]+)\}/)[1];
      const body = pages.slice(pages.indexOf(`const ${table} = {`), pages.indexOf("};", pages.indexOf(`const ${table} = {`)));
      for (const t of item.tabs) {
        expect(new RegExp(`(^|[\\s{,])"?${t.key}"?:`).test(body), `${item.id}:${t.key}`).toBe(true);
      }
    }
  });

  it("redirects every old path (the V2 menu) instead of opening a page of its own", () => {
    expect(app).toContain("{Object.keys(OLD_PATHS).map((path) => <Route key={path} path={path} element={<OldPathRedirect />} />)}");
    for (const path of Object.keys(OLD_PATHS)) expect(routeOf(path), path).toBeNull();
    expect(definition(pages, "OldPathRedirect")).toContain("oldPathTarget(");
  });

  it("has no V2 / V3 switch left", () => {
    const layout = read("../components/manager/ManagerLayout.jsx");
    expect(layout).not.toMatch(/VersionSwitch|useManagerUiVersion|switchTarget/);
    expect(pages).not.toMatch(/useManagerUiVersion|MethodSwitch|compact/);
  });
});
