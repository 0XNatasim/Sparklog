import { describe, expect, it } from "vitest";
import { activePeopleOnLeave, dayStatus, liveRoster, missingEntryDays, notSubmittedYesterday } from "./live-crew";

const person = (id, extra = {}) => ({ id, role: "employee", is_paused: false, show_on_boards: true, ...extra });
const people = [
  person("crew"),
  person("owner", { role: "owner" }),
  person("owner-optout", { role: "owner", show_on_boards: false }),
  person("admin", { role: "admin" }),
  person("off"),
  person("paused", { is_paused: true }),
];
const ids = (list) => list.map((p) => p.id);

describe("liveRoster", () => {
  it("shows only the regular crew when nobody else has a job", () => {
    expect(ids(liveRoster(people, { offUserIds: new Set(["off"]) }))).toEqual(["crew"]);
  });

  it("shows owners, admins, opted-out and off-today people once they enter a job", () => {
    const jobUserIds = new Set(["owner", "owner-optout", "admin", "off"]);
    expect(ids(liveRoster(people, { jobUserIds, offUserIds: new Set(["off"]) })))
      .toEqual(["crew", "owner", "owner-optout", "admin", "off"]);
  });

  it("never shows a paused account", () => {
    expect(ids(liveRoster(people, { jobUserIds: new Set(["paused"]) }))).not.toContain("paused");
  });
});

describe("notSubmittedYesterday", () => {
  it("expects the regular crew, not owners, admins or people off yesterday", () => {
    expect(ids(notSubmittedYesterday(people, { offUserIds: new Set(["off"]) }))).toEqual(["crew"]);
  });

  it("also expects anyone who logged a job yesterday without submitting it", () => {
    const yesterdayJobs = [
      { user_id: "owner", status: "saved" },
      { user_id: "off", status: "saved" },
      { user_id: "crew", status: "submitted" },
      { user_id: "admin", status: "approved" },
    ];
    expect(ids(notSubmittedYesterday(people, { yesterdayJobs, offUserIds: new Set(["off"]) }))).toEqual(["owner", "off"]);
  });
});

describe("dayStatus", () => {
  it("is submitted only when every job of the day is submitted or approved", () => {
    expect(dayStatus([])).toBe("none");
    expect(dayStatus([{ status: "submitted" }, { status: "approved" }])).toBe("submitted");
    expect(dayStatus([{ status: "submitted" }, { status: "saved" }])).toBe("saved");
    expect(dayStatus([{ status: "updated" }])).toBe("saved");
  });
});

describe("activePeopleOnLeave", () => {
  it("includes full and partial leave, excludes paused accounts, and sorts by name", () => {
    const leave = [
      { user_id: "crew", kind: "date_range", start_date: "2026-09-30", end_date: "2026-09-30" },
      { user_id: "off", kind: "date_range", start_date: "2026-09-30", end_date: "2026-09-30", start_time: "13:00", end_time: "16:00" },
      { user_id: "paused", kind: "date_range", start_date: "2026-09-30", end_date: "2026-09-30" },
    ];
    const namedPeople = people.map((p) => ({ ...p, full_name: { crew: "Zoé", off: "Alice", paused: "Bob" }[p.id] }));

    expect(activePeopleOnLeave(namedPeople, leave, "2026-09-30")).toEqual([
      { id: "off", name: "Alice" },
      { id: "crew", name: "Zoé" },
    ]);
  });
});

describe("missingEntryDays", () => {
  it("counts jobless board days from September 28 while excluding leave and inactive people", () => {
    const leave = [
      { user_id: "crew", kind: "date_range", start_date: "2026-09-29", end_date: "2026-09-29" },
      { user_id: "off", kind: "date_range", start_date: "2026-09-29", end_date: "2026-09-29", start_time: "13:00" },
    ];
    const jobs = [{ user_id: "crew", job_date: "2026-09-30" }];

    expect(missingEntryDays(people, jobs, leave, "2026-09-22", "2026-09-30")).toEqual([
      { id: "off", name: "off", count: 3 },
      { id: "crew", name: "crew", count: 1 },
    ]);
  });

  it("reports zero when the requested period ends before tracking started", () => {
    expect(missingEntryDays([person("crew")], [], [], "2026-09-20", "2026-09-27"))
      .toEqual([{ id: "crew", name: "crew", count: 0 }]);
  });
});

describe("weekCellSummary", () => {
  it("ignores drafts and reports the day status", async () => {
    const { weekCellSummary } = await import("./live-crew");
    expect(weekCellSummary([])).toEqual({ count: 0, status: "none" });
    expect(weekCellSummary([{ status: "draft" }])).toEqual({ count: 0, status: "none" });
    expect(weekCellSummary([{ status: "saved" }, { status: "submitted" }])).toEqual({ count: 2, status: "saved" });
    expect(weekCellSummary([{ status: "submitted" }, { status: "approved" }])).toEqual({ count: 2, status: "submitted" });
  });
});
