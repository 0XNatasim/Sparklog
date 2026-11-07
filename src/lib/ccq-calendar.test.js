import { describe, expect, it } from "vitest";
import { calendarBlocks, daysUntil, reminderBlock, upcomingBlocks } from "./ccq-calendar";

const row = (holiday_date, label) => ({ holiday_date, label });
const winter = ["2026-12-20", "2026-12-21", "2026-12-22"].map((d) => row(d, "Vacances — hiver"));
const rows = [row("2026-11-13", "Jour du Souvenir"), ...winter, row("2027-01-01", "Jour de l'An")];

describe("ccq calendar", () => {
  it("groups consecutive days with the same label into one block", () => {
    expect(calendarBlocks(rows)).toEqual([
      { start: "2026-11-13", end: "2026-11-13", label: "Jour du Souvenir", days: 1 },
      { start: "2026-12-20", end: "2026-12-22", label: "Vacances — hiver", days: 3 },
      { start: "2027-01-01", end: "2027-01-01", label: "Jour de l'An", days: 1 },
    ]);
  });

  it("does not merge adjacent days with different labels", () => {
    expect(calendarBlocks([row("2026-12-24", "A"), row("2026-12-25", "B")])).toHaveLength(2);
  });

  it("lists blocks not over yet, an ongoing one included", () => {
    const blocks = calendarBlocks(rows);
    expect(upcomingBlocks(blocks, "2026-12-21").map((b) => b.label)).toEqual(["Vacances — hiver", "Jour de l'An"]);
    expect(upcomingBlocks(blocks, "2026-12-21", 1)).toHaveLength(1);
  });

  it("reminds exactly from 7 days before the first day", () => {
    const blocks = calendarBlocks(rows);
    expect(reminderBlock(blocks, "2026-11-05")).toBeNull(); // 8 days
    expect(reminderBlock(blocks, "2026-11-06").label).toBe("Jour du Souvenir"); // 7 days
    expect(reminderBlock(blocks, "2026-11-13").label).toBe("Jour du Souvenir"); // starts today
    expect(daysUntil(blocks[0], "2026-11-06")).toBe(7);
  });

  it("does not remind for a block already under way", () => {
    expect(reminderBlock(calendarBlocks(winter), "2026-12-21")).toBeNull();
  });
});
