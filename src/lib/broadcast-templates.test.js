import { describe, expect, it } from "vitest";
import { addTemplate, moveTemplate, removeTemplate, resolveTemplates } from "./broadcast-templates";

const BUILT_INS = ["A", "B", "C"];

describe("resolveTemplates", () => {
  it("starts from the built-ins followed by the manager's v1 messages", () => {
    expect(resolveTemplates(null, ["mine", "B", ""], BUILT_INS)).toEqual({ items: ["A", "B", "C", "mine"], seen: BUILT_INS });
  });

  it("keeps a deleted built-in deleted and the saved order", () => {
    const stored = { items: ["C", "mine", "A"], seen: BUILT_INS };
    expect(resolveTemplates(stored, null, BUILT_INS).items).toEqual(["C", "mine", "A"]);
  });

  it("appends a built-in added in a later release", () => {
    const stored = { items: ["A"], seen: ["A", "B"] };
    expect(resolveTemplates(stored, null, ["A", "B", "NEW"])).toEqual({ items: ["A", "NEW"], seen: ["A", "B", "NEW"] });
  });
});

describe("list edits", () => {
  it("moves up and down, and ignores moves past either end", () => {
    expect(moveTemplate(["A", "B", "C"], 1, -1)).toEqual(["B", "A", "C"]);
    expect(moveTemplate(["A", "B", "C"], 1, 1)).toEqual(["A", "C", "B"]);
    expect(moveTemplate(["A", "B"], 0, -1)).toEqual(["A", "B"]);
    expect(moveTemplate(["A", "B"], 1, 1)).toEqual(["A", "B"]);
  });

  it("removes by position and adds only new, non-empty text", () => {
    expect(removeTemplate(["A", "B", "C"], 1)).toEqual(["A", "C"]);
    expect(addTemplate(["A"], "  B  ")).toEqual(["A", "B"]);
    expect(addTemplate(["A"], "A")).toEqual(["A"]);
    expect(addTemplate(["A"], "   ")).toEqual(["A"]);
  });
});
