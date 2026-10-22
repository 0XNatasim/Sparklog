import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/supabaseClient", () => ({ supabase: { rpc: vi.fn() } }));

import { employeeStatus, groupBadgeTotal, pendingSignupCount } from "./signups";

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
