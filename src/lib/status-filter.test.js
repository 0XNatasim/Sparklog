import { describe, expect, it } from "vitest";
import { initialPile } from "./status-filter";

describe("status-filter", () => {
  it("starts on « all » unless a link asks for one pile", () => {
    expect(initialPile(null)).toBe("all");
    expect(initialPile("all")).toBe("all");
    expect(initialPile("bogus")).toBe("all");
    expect(initialPile("updated")).toBe("updated");
  });
});
