// Public entry point for the payroll engine. Callers (Testing bench today; real
// pay runs, pay stubs, batch, DAS reports later) import from here only.
export { calculatePayroll } from "./engine/calculatePayroll.js";
export { getRules, QUEBEC_2026 } from "./rules/index.js";
export { RULE_VERSION, PAY_PERIODS_PER_YEAR } from "./rules/2026.js";
export { EARNING_TYPES, EARNING_TREATMENT } from "./earnings.js";
export { computeCcqBenefits, CCQ_BENEFIT_RATES } from "./ccq-benefits.js";
