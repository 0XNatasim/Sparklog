import { describe, expect, it } from "vitest";
import { aecqOctoberReminder } from "./aecq-dues";

describe("AECQ annual dues reminder", () => {
  it("only fires for the October report", () => {
    expect(aecqOctoberReminder("2026-09")).toBeNull();
    expect(aecqOctoberReminder("2026-11")).toBeNull();
    expect(aecqOctoberReminder("")).toBeNull();
    expect(aecqOctoberReminder(undefined)).toBeNull();
  });

  it("gives the known amount of the year, or no amount for a year not published yet", () => {
    expect(aecqOctoberReminder("2026-10")).toEqual({ year: 2026, amount: 240 });
    expect(aecqOctoberReminder("2027-10")).toEqual({ year: 2027, amount: 245 });
    expect(aecqOctoberReminder("2030-10")).toEqual({ year: 2030, amount: null });
  });
});
