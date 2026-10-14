import { describe, expect, it } from "vitest";
import { scopeCss, talonsDocument } from "./talon-print";

describe("scopeCss", () => {
  it("prefixes rules and @media blocks, maps html/body/* to the scope, leaves @page alone", () => {
    const css = "* { a: 1; }\n html, body { b: 2; }\n .sheet { c: 3; }\n @media (max-width: 640px) { .hd, .cols { d: 4; } }\n @page { size: letter; }";
    const out = scopeCss(css, ".kept");
    expect(out).toContain(".kept { a: 1; }");
    expect(out).toContain(".kept, .kept { b: 2; }");
    expect(out).toContain(".kept .sheet { c: 3; }");
    expect(out).toContain("@media (max-width: 640px) { .kept .hd, .kept .cols { d: 4; } }");
    expect(out).toContain("@page { size: letter; }");
  });
});

describe("talonsDocument", () => {
  it("puts kept and live talons in one document, one page each", () => {
    const kept = { header: { name: "Alice <A>", source: "calcul" }, transactions: [], sommaire: [] };
    const html = talonsDocument([{ kind: "kept", data: kept }, { kind: "kept", data: kept }], "Talons");
    expect(html.match(/class="page kept"/g)).toHaveLength(2);
    expect(html).toContain(".page + .page");
    expect(html).toContain("Alice &lt;A&gt;");
  });
});
