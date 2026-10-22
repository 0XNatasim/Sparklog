import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/supabaseClient", () => ({ supabase: { rpc: vi.fn() } }));

import { NEW_HIRE, employeeStatus, employmentChoice, employmentUpdate, groupBadgeTotal, isNewHire, pendingSignupCount } from "./signups";

const pending = new Map([
  ["new-ok", { user_id: "new-ok", email_confirmed: true }],
  ["new-wait", { user_id: "new-wait", email_confirmed: false }],
]);

describe("employee status (0109)", () => {
  it("tells active, new sign-up, email not validated, former employee and other inactive apart", () => {
    expect(employeeStatus({ id: "a", is_paused: false }, pending)).toBe("active");
    expect(employeeStatus({ id: "new-ok", is_paused: true }, pending)).toBe("pending");
    expect(employeeStatus({ id: "new-wait", is_paused: true }, pending)).toBe("unconfirmed");
    expect(employeeStatus({ id: "x", is_paused: true, departure_status: "mise_a_pied" }, pending)).toBe("mise_a_pied");
    expect(employeeStatus({ id: "y", is_paused: true, departure_status: "depart" }, pending)).toBe("depart");
    // Paused after having worked (not in pending_signups): plain inactive, never a new sign-up.
    expect(employeeStatus({ id: "z", is_paused: true }, pending)).toBe("inactive");
  });

  it("counts only validated sign-ups for the side-menu badge", () => {
    expect(pendingSignupCount([...pending.values()])).toBe(1);
    expect(pendingSignupCount(null)).toBe(0);
  });

  it("adds the badges of a closed menu group (Équipe holds Employés and Inventaire)", () => {
    const items = [{ id: "v3-team" }, { id: "inventory" }, { id: "messages" }];
    expect(groupBadgeTotal(items, { "v3-team": 3, inventory: 2 })).toBe(5);
    expect(groupBadgeTotal(items, {})).toBe(0);
  });
});

describe("migration 0109 and wiring", () => {
  const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
  const sql = read("../../supabase/migrations/20261022160000_0109_signups_and_former_employees.sql");

  it("keeps former-employee marks to the two values, re-activation clears them, and logs every change", () => {
    expect(sql).toContain("departure_status in ('mise_a_pied', 'depart')");
    expect(sql).toMatch(/old\.is_paused and not coalesce\(new\.is_paused, false\) then\s+new\.departure_status := null/);
    expect(sql).toMatch(/new\.departure_status is not null[\s\S]*?new\.is_paused := true/);
    expect(sql).toContain("'departure_change'");
  });

  it("lists only never-activated, inactive, non-former accounts, to managers only", () => {
    expect(sql).toMatch(/where public\.get_my_role\(\) = 'manager'\s+and p\.is_paused\s+and p\.first_activated_at is null\s+and p\.departure_status is null/);
    expect(sql).toMatch(/revoke all on function public\.pending_signups\(\) from public, anon/);
  });

  it("shows the badge on Employés (V2) and Équipe › Employés (V3), and refreshes it after an activation", () => {
    const layout = read("../components/manager/ManagerLayout.jsx");
    expect(layout).toMatch(/employees: isManagerRole\(role\) \? pendingSignups : 0/);
    expect(layout).toMatch(/"v3-team": isManagerRole\(role\) \? pendingSignups : 0/);
    expect(layout).toContain("window.addEventListener(SIGNUPS_EVENT, loadSignups)");
    const panel = read("../components/EmployeesPanel.jsx");
    expect(panel).toContain("window.dispatchEvent(new Event(SIGNUPS_EVENT))");
  });
});

describe("new hire and first day of work (0110)", () => {
  const today = "2026-10-22";

  it("is a new hire only while the first day is still to come and the person is not a former employee", () => {
    expect(isNewHire({ start_date: "2026-10-27" }, today)).toBe(true);
    expect(isNewHire({ start_date: "2026-10-22" }, today)).toBe(false);
    expect(isNewHire({ start_date: "2026-10-27", departure_status: "depart" }, today)).toBe(false);
    expect(isNewHire({}, today)).toBe(false);
    expect(employmentChoice({ start_date: "2026-10-27" }, today)).toBe(NEW_HIRE);
    expect(employmentChoice({ start_date: "2026-10-01" }, today)).toBe("");
    expect(employmentChoice({ departure_status: "mise_a_pied" }, today)).toBe("mise_a_pied");
  });

  it("writes nothing until the date is entered, and clears the right columns", () => {
    expect(employmentUpdate(NEW_HIRE, "", "")).toBeNull();
    expect(employmentUpdate(NEW_HIRE, "2026-10-27", "depart")).toEqual({ departure_status: null, start_date: "2026-10-27" });
    expect(employmentUpdate("depart", "", NEW_HIRE)).toEqual({ departure_status: "depart" });
    expect(employmentUpdate("", "", NEW_HIRE)).toEqual({ departure_status: null, start_date: null });
    // Leaving « former employee » keeps the hiring date already on file.
    expect(employmentUpdate("", "", "mise_a_pied")).toEqual({ departure_status: null });
  });

  it("adds the column, logs it to the Journal and passes the day to every board", () => {
    const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
    const sql = read("../../supabase/migrations/20261022190000_0110_new_hire_start_date.sql");
    expect(sql).toContain("add column if not exists start_date date");
    expect(sql).toMatch(/new\.start_date is distinct from old\.start_date[\s\S]*'start_date_change'/);
    // 0109 entries kept in the replaced trigger function.
    for (const action of ["'role_change'", "'pause_change'", "'departure_change'"]) expect(sql).toContain(action);
    expect(read("../components/LiveCrew.jsx")).toMatch(/offUserIds: offToday,\s+date: today/);
    expect(read("../components/LiveCrew.jsx")).toContain("offUserIds: offYesterday, date: yesterday");
    expect(read("../components/manager/TodoInbox.jsx")).toContain("offUserIds: offPrev, date: prevDay");
    expect(read("../components/WeekSnapshot.jsx")).toContain("date: days[6]");
    for (const file of ["../components/LiveCrew.jsx", "../components/WeekSnapshot.jsx", "../components/manager/TodoInbox.jsx", "../components/EmployeeActivityLog.jsx"]) {
      expect(read(file)).toMatch(/show_on_boards, start_date/);
    }
  });
});
