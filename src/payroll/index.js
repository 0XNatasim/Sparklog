// Public entry point for the payroll engine. Callers (Testing bench today; real
// pay runs, pay stubs, batch, DAS reports later) import from here only.
export { calculatePayroll } from "./engine/calculatePayroll.js";
export { getRules, QUEBEC_2026 } from "./rules/index.js";
export { RULE_VERSION, PAY_PERIODS_PER_YEAR } from "./rules/2026.js";
export { EARNING_TYPES, EARNING_TREATMENT } from "./earnings.js";
export { computeCcqBenefits, computeUnionDues, CCQ_ELECTRICIAN_IC_C3, CCQ_LEVELS, CCQ_UNIONS, CCQ_UNION_KEYS } from "./ccq-benefits.js";
