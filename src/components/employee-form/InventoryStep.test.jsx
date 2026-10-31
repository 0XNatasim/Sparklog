// @vitest-environment jsdom
// End-of-shift inventory step (0117): a line the reading could not read is named, « Continuer » waits
// for a complément screenshot, then « Continuer quand même » lets the employee go on.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { dictionaries } from "@/lib/i18n";

vi.mock("@/supabaseClient", () => ({ supabase: {} }));
vi.mock("@/components/ui/dialog", () => ({
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <h2>{children}</h2>,
  DialogFooter: ({ children }) => <div>{children}</div>,
}));

const { default: InventoryStep } = await import("./InventoryStep");

const fr = (key, vars = {}) => String(dictionaries.fr[key] || key).replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? "");
const reviewReading = {
  state: "review", count: 17, expected: 17, missing: 0, probable: [],
  unreadable: [{ code: "EQ000041", name: "Module d'expansion pour planchers" }],
};

function setup({ rows = [{ slot: 1 }, { slot: 2 }], reading = reviewReading } = {}) {
  const inventory = {
    rows, busySlot: null, reading, defectiveAnswer: "no", setDefectiveAnswer: vi.fn(), notice: "", error: "",
    inputRef: { current: null }, multiInputRef: { current: null },
    pickSlot: vi.fn(), pickFiles: vi.fn(), pickComplement: vi.fn(), handleFile: vi.fn(), handleFiles: vi.fn(),
  };
  inventory.recordContinue = vi.fn();
  const onContinue = vi.fn();
  render(<InventoryStep t={fr} inventory={inventory} onContinue={onContinue} />);
  return { inventory, onContinue };
}

afterEach(cleanup);

describe("InventoryStep — unreadable lines", () => {
  it("names the line and holds « Continuer » until a complément screenshot is sent", () => {
    const { inventory } = setup();
    expect(screen.getByText("Module d'expansion pour planchers")).toBeTruthy();
    expect(screen.getByRole("button", { name: fr("form.inventory.continue") }).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: fr("form.inventory.retakeButton") }));
    expect(inventory.pickComplement).toHaveBeenCalledTimes(1);
  });

  it("lets the employee continue anyway once the complément was sent", () => {
    const { onContinue } = setup({ rows: [{ slot: 1 }, { slot: 5 }] });
    expect(screen.getByText(fr("form.inventory.retakeAgain"))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: fr("form.inventory.continueAnyway") }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("waits while the screenshots are being read, and continues normally when complete", () => {
    setup({ reading: { state: "reading" } });
    expect(screen.getByRole("button", { name: fr("form.inventory.continue") }).disabled).toBe(true);
    cleanup();
    const { onContinue } = setup({ reading: { state: "ok", count: 17, expected: 17, missing: 0, unreadable: [], probable: [] } });
    expect(screen.queryByRole("button", { name: fr("form.inventory.retakeButton") })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: fr("form.inventory.continue") }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("lists the probable missing lines when some were not read at all", () => {
    setup({ reading: { state: "review", count: 16, expected: 17, missing: 1, unreadable: [], probable: [{ code: "EQ000046", name: "Sinope - 3000W" }] } });
    expect(screen.getByText(fr("form.inventory.missingLines", { count: 1 }))).toBeTruthy();
    expect(screen.getByText(/Sinope - 3000W/)).toBeTruthy();
  });
});

describe("InventoryStep — nothing read, and what is recorded", () => {
  const nothing = { state: "photos", count: 0, expected: null, missing: 0, probable: [], unreadable: [] };

  it("asks for the list again when no line could be read, holding « Continuer »", () => {
    const { inventory } = setup({ reading: nothing });
    expect(screen.getByText(fr("form.inventory.nothingRead"))).toBeTruthy();
    expect(screen.getByRole("button", { name: fr("form.inventory.continue") }).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: fr("form.inventory.retakeListButton") }));
    expect(inventory.pickComplement).toHaveBeenCalledTimes(1);
  });

  it("records what the step asked when the employee continues anyway, and when all was read", () => {
    const first = setup({ reading: nothing, rows: [{ slot: 1 }, { slot: 5 }] });
    fireEvent.click(screen.getByRole("button", { name: fr("form.inventory.continueAnyway") }));
    expect(first.inventory.recordContinue).toHaveBeenCalledWith("override");
    cleanup();
    const second = setup({ reading: { state: "ok", count: 17, expected: 17, missing: 0, unreadable: [], probable: [] } });
    fireEvent.click(screen.getByRole("button", { name: fr("form.inventory.continue") }));
    expect(second.inventory.recordContinue).toHaveBeenCalledWith(null);
  });
});
