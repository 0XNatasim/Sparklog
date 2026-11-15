// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useAnomaliesFolded } from "./anomaly-seen";

afterEach(() => window.localStorage.clear());

describe("fold state shared by « À regarder d'abord » (À traiter) and « À vérifier » (Fiches)", () => {
  it("starts open, folds, and remembers the choice in this browser", () => {
    const first = renderHook(() => useAnomaliesFolded());
    expect(first.result.current[0]).toBe(false);
    act(() => first.result.current[1]());
    expect(first.result.current[0]).toBe(true);
    first.unmount();
    const second = renderHook(() => useAnomaliesFolded());
    expect(second.result.current[0]).toBe(true);
    act(() => second.result.current[1]());
    expect(second.result.current[0]).toBe(false);
  });
});
