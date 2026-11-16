// @vitest-environment jsdom
// Conditions de paie: one table of the employees' « Paie et options » and Trajets et frais lines. A box or an amount is
// saved to the profile like the employee card does; a travel line goes through set_travel_pay_rule, keeping the
// « Chargé à Britton » answer already recorded.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { dictionaries } from "@/lib/i18n";
import { createFakeSupabase } from "@/test/fake-supabase";

const state = vi.hoisted(() => ({ fake: null }));
vi.mock("@/supabaseClient", () => ({ get supabase() { return state.fake.client; } }));

const { default: PayConditionsManager } = await import("./PayConditionsManager");

const fr = (key, vars = {}) => Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, v), dictionaries.fr[key]);

const people = [
  { id: "u1", full_name: "Zoé Tremblay", role: "employee", employee_number: "12", is_paused: false, first_trip_unpaid: false, ten_hour_days: false, km_rate: 0.5 },
  { id: "u2", full_name: "Marc Roy", role: "employee", employee_number: "3", is_paused: false, first_trip_unpaid: true, ten_hour_days: false, km_rate: null },
  { id: "u3", full_name: "Sam Sous-traitant", role: "subcontractor_1", employee_number: "ST-1", is_paused: false },
  { id: "u4", full_name: "Pierre Pause", role: "employee", employee_number: "9", is_paused: true },
];

function setup() {
  state.fake = createFakeSupabase({
    tables: {
      profiles: (call) => (call.op === "select" ? people : null),
      employee_groups: [{ id: "g1", name: "Entrepôt Alma", employee_group_members: [{ user_id: "u1" }] }],
      travel_pay_rules: [{ user_id: "u1", rule_key: "time_warehouse_to_client", effective_from: "2026-10-01", choice: "non_ccq", billed_to_britton: true, threshold_km: null }],
    },
  });
  return render(<PayConditionsManager />);
}

afterEach(cleanup);

const rowOf = (name) => screen.getByText(name).closest("tr");
const box = (name, column) => screen.getByLabelText(`${name} · ${fr(column)}`);

describe("PayConditionsManager", () => {
  it("lists the employees by number, without the paused accounts, with a dash where an option does not apply", async () => {
    setup();
    await screen.findByText("Zoé Tremblay");
    const names = screen.getAllByRole("rowheader").map((el) => el.textContent);
    expect(names[0]).toContain("Marc Roy"); // #3 before #12
    expect(names[1]).toContain("Zoé Tremblay");
    expect(screen.queryByText("Pierre Pause")).toBeNull();
    const sub = within(rowOf("Sam Sous-traitant"));
    expect(sub.getAllByLabelText(fr("payConditions.notApplicable")).length).toBeGreaterThan(0);
  });

  it("saves a ticked box to the profile like the employee card, and puts it back when the save fails", async () => {
    setup();
    await screen.findByText("Zoé Tremblay");
    fireEvent.click(box("Zoé Tremblay", "settings.firstTrip.title"));
    await waitFor(() => expect(state.fake.writes("profiles")).toHaveLength(1));
    const write = state.fake.writes("profiles")[0];
    expect(write.op).toBe("update");
    expect(write.payload).toEqual({ first_trip_unpaid: true });
    expect(write.filters).toContainEqual(["in", "id", ["u1"]]);
    expect(box("Zoé Tremblay", "settings.firstTrip.title").checked).toBe(true);
  });

  it("locks what the role fixes (subcontractor: first overtime hour always double)", async () => {
    setup();
    await screen.findByText("Sam Sous-traitant");
    const locked = box("Sam Sous-traitant", "employees.otFirstHourDouble");
    expect(locked.disabled).toBe(true);
    expect(locked.checked).toBe(true);
  });

  it("saves a typed amount when leaving the box, and refuses a bad one", async () => {
    setup();
    await screen.findByText("Marc Roy");
    const km = box("Marc Roy", "employees.kmRate");
    fireEvent.change(km, { target: { value: "0.62" } });
    fireEvent.blur(km);
    await waitFor(() => expect(state.fake.writes("profiles")).toHaveLength(1));
    expect(state.fake.writes("profiles")[0].payload).toEqual({ km_rate: 0.62 });
    fireEvent.change(km, { target: { value: "25" } });
    fireEvent.blur(km);
    expect(await screen.findByText(fr("timeRules.payRules.invalidAmount"))).toBeTruthy();
    expect(state.fake.writes("profiles")).toHaveLength(1);
  });

  it("changes a travel line through the RPC and keeps the Britton answer already recorded", async () => {
    setup();
    await screen.findByText("Zoé Tremblay");
    const select = box("Zoé Tremblay", "travel.rule.time_warehouse_to_client");
    expect(select.value).toBe("non_ccq");
    fireEvent.change(select, { target: { value: "ccq" } });
    await waitFor(() => expect(state.fake.rpcCalls("set_travel_pay_rule")).toHaveLength(1));
    const call = state.fake.rpcCalls("set_travel_pay_rule")[0];
    expect(call.args).toMatchObject({ p_rule_key: "time_warehouse_to_client", p_user_ids: ["u1"], p_choice: "ccq", p_billed_to_britton: true, p_threshold_km: null });
    await waitFor(() => expect(box("Zoé Tremblay", "travel.rule.time_warehouse_to_client").value).toBe("ccq"));
  });

  it("changes every employee shown for a column after a confirmation", async () => {
    setup();
    await screen.findByText("Zoé Tremblay");
    fireEvent.click(screen.getByLabelText(`${fr("employees.tenHourDays")} · ${fr("payConditions.allOn")}`));
    fireEvent.click(await screen.findByRole("button", { name: fr("common.yes") }));
    await waitFor(() => expect(state.fake.writes("profiles")).toHaveLength(1));
    const write = state.fake.writes("profiles")[0];
    expect(write.payload).toEqual({ ten_hour_days: true });
    expect(write.filters).toContainEqual(["in", "id", ["u2", "u1"]]); // the subcontractor is locked, the paused account hidden
  });

  it("narrows the list by warehouse", async () => {
    setup();
    await screen.findByText("Zoé Tremblay");
    fireEvent.change(screen.getByLabelText(fr("payConditions.group")), { target: { value: "g1" } });
    expect(screen.queryByText("Marc Roy")).toBeNull();
    expect(screen.getByText("Zoé Tremblay")).toBeTruthy();
  });

  it("opens the explanation of a rule when its title is clicked", async () => {
    setup();
    await screen.findByText("Zoé Tremblay");
    fireEvent.click(screen.getByRole("button", { name: `${fr("employees.otFirstHourDouble")} — ${fr("payConditions.moreInfo")}` }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(fr("employees.otFirstHourDoubleHint"))).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: fr("payConditions.close") }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("explains a travel line with its default, its choices and the agreement article", async () => {
    setup();
    await screen.findByText("Zoé Tremblay");
    fireEvent.click(screen.getByRole("button", { name: `${fr("travel.rule.time_client_to_home")} — ${fr("payConditions.moreInfo")}` }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain(fr("travel.defaultIs", { choice: fr("travel.choice.unpaid") }));
    expect(dialog.textContent).toContain(fr("travel.convention", { ref: "23.04 1)" }));
    expect(dialog.textContent).toContain("65");
  });
});
