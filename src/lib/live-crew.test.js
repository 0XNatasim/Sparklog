import { describe, expect, it } from "vitest";
import { liveRoster, notSubmittedYesterday } from "./live-crew";

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
