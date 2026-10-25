import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Every action that approves, refuses or deletes something asks « Êtes-vous sûr ? » first
// (V2.4.147). This guard reads each handler's body and checks that it awaits confirm() before
// the write, so a future edit cannot silently drop the question.
const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");

// Body of `function name(` up to the closing brace at the same indentation.
function handlerBody(source, name) {
  const start = source.search(new RegExp(`\\n(\\s*)(?:async )?function ${name}\\(`));
  if (start < 0) throw new Error(`handler ${name} not found`);
  const indent = source.slice(start + 1).match(/^\s*/)[0];
  const end = source.indexOf(`\n${indent}}\n`, start + 1);
  return source.slice(start, end);
}

const HANDLERS = {
  "../components/manager/TodoInbox.jsx": ["approve", "returnDay", "reviewMeal", "reviewParking"],
  "../pages/ManagerDashboard.jsx": ["approve", "reviewParking", "unlock", "approveWeekAll"],
  "../components/MealClaimsManager.jsx": ["review"],
  "../components/UnlockDayManager.jsx": ["removeUnlock"],
  "../components/TimeOffControls.jsx": ["remove"],
  "../components/CongesManager.jsx": ["remove"],
  "../components/TalonTab.jsx": ["toggleOfficial"],
  "../components/PayrollEngineTester.jsx": ["confirmPostPayroll", "keepValidatedWeek"],
  "../components/manager/PayrollWeek.jsx": ["postReady", "approveOfficial"],
  "../pages/History.jsx": ["deleteJob"],
  "../components/BroadcastManager.jsx": ["deleteTemplate", "remove"],
  "../components/FormsManager.jsx": ["remove"],
  "../components/ReferencesManager.jsx": ["remove"],
  "../components/EmergencyTimesheet.jsx": ["remove"],
  "../components/InventoryScreenshotsPanel.jsx": ["removeShots"],
};

describe("approve / refuse / delete actions ask for confirmation", () => {
  for (const [file, names] of Object.entries(HANDLERS)) {
    const source = read(file);
    for (const name of names) {
      it(`${file.split("/").pop()} › ${name}`, () => {
        expect(handlerBody(source, name)).toMatch(/await confirm\(/);
      });
    }
  }

  it("À traiter always passes a question when approving a day (not only on an anomaly)", () => {
    const body = handlerBody(read("../components/manager/TodoInbox.jsx"), "approveDay");
    expect(body).toContain('"todo.confirm.approveDay"');
  });

  it("the Comptabiliser button goes through the confirmation; only the opt-in print hook posts silently", () => {
    const source = read("../components/PayrollEngineTester.jsx");
    expect(source).toContain("onClick={confirmPostPayroll}");
    expect(source).not.toContain("onClick={() => postPayroll()}");
  });

  it("deleting an employee keeps its two-step confirmation", () => {
    const source = read("../components/employees/EmployeeDetails.jsx");
    expect(source).toMatch(/confirmDelete === p\.id \?/);
  });
});
