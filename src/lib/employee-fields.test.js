import { describe, expect, it } from "vitest";
import { getMissingEmployeeFields, getMissingEmployeeItems, missingCountByTab } from "./employee-fields.js";

const t = (key) => key;
const complete = {
  employee_number: "09", phone: "514", email: "a@b.c", birth_date: "1990-01-01", ccq_expiration_date: "2027-01-01",
  apprentice_level: "journeyman", work_region: "06", union_association: "ftq_fipoe", wage_schedule: "C3", hourly_rate: 50, km_rate: 0.65,
};

describe("employee fields still to fill", () => {
  it("is empty for a complete profile", () => {
    expect(getMissingEmployeeItems(complete, t)).toEqual([]);
  });
  it("names each missing field with the tab that holds it", () => {
    const items = getMissingEmployeeItems({ ...complete, phone: " ", wage_schedule: null, km_rate: undefined }, t);
    expect(items.map((i) => [i.field, i.tab])).toEqual([["phone", "identity"], ["wage_schedule", "ccq"], ["km_rate", "pay"]]);
    expect(getMissingEmployeeFields({ ...complete, phone: "" }, t)).toEqual(["manager.tbl.phone"]);
  });
  it("counts the missing fields per tab", () => {
    const items = getMissingEmployeeItems({}, t);
    expect(missingCountByTab(items)).toEqual({ identity: 4, ccq: 6, pay: 1 });
  });
});
