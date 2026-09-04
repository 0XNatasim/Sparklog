# Inventory — calculations and exports (M0.4)

- **Status:** Living document. Snapshot 2026-09-04. Update it whenever a calculator
  or export surface is added, changed, or retired.
- **Purpose:** Map every place SparkLog turns raw work facts into hours, pay, cost, or
  an external payload, so duplicate transformations are visible before the authoritative
  engine work (`GPT.md` Milestone 4) begins. See `docs/adr/0001-...` for scope.

> Nothing below is finalized payroll. Every money/hours value in these surfaces is an
> **estimate / preview** pending payroll and legal sign-off.

## A. Authoritative-ish calculators (shared library)

### `src/lib/payroll-calculations.js`
The closest thing to a single source of truth today. Pure functions, unit-tested
(`payroll-calculations.test.js`).

| Function | What it computes | Rule constants baked in |
|---|---|---|
| `minutesBetween(depart, fin)` | Worked minutes for one interval; wraps past midnight (adds 24h if negative) | — |
| `calculatePayrollEntries(jobs)` | Per-job split into regular / OT@1.5 / OT@2, accumulated per calendar day, jobs sorted chronologically | **480 min/day** regular cap; first **60 min** of daily OT at 1.5×, remainder at 2× |
| `calculateDailyTotals(jobs)` | Per-day roll-up (paid, regular, return, ot50, ot100 minutes) | via `calculatePayrollEntries` |
| `isMealEligible({jobDate, dailyWorkMinutes})` | Whether a supper claim is allowed | weekday + **≥615** daily worked minutes |
| `roundHours(minutes)` | Minutes → rounded hours | rounding rule lives here |
| `getKilometreBreakdown(job)` | Splits km into client vs return | handles legacy `km_aller` |

**Consumers:** `CostingDashboard` (entries), `Week` (daily totals), `EmployeeForm`
(meal eligibility), `MealClaimsManager` / `ManagerDashboard` / `History` (km breakdown),
`ccq-export.js` (entries).

### `src/lib/ccq-export.js`
| Function | What it computes |
|---|---|
| `buildCcqWeeklyRecords(jobs, profilesById)` | Groups jobs into weekly CCQ records (week ending Saturday), attaches NAS / trade `220` / sector `C` / region / annexe | 
| `weekEndingSaturday(date)` | Week-ending date |
| `formatAppendixCode(code)` | `C3` → `C-3` for the report |
| `missingCcqFields(record)` | Flags records missing required export fields |

**Consumer:** `CcqJsonExport`. Depends on `calculatePayrollEntries`.

### `src/lib/ccq-rates.js`
Rate extraction from the CCQ rate JSON (`extractRegularHourlyRate`, `extractRateAnnexes`,
`LEVEL_TO_SKILL`). Feeds employee hourly-rate autofill.

## B. Display-only time helpers

### `src/lib/time.js`  ⚠️ duplicate of the interval math in A
| Function | Notes |
|---|---|
| `hoursBetween(start, end)` | Decimal hours, 2-dp. Returns **0** when `diff <= 0` (does NOT wrap past midnight, unlike `minutesBetween`) |
| `formatHours`, `hhmmFromDayjs` | Formatting |

**Consumers:** `ManagerDashboard.jsx:693` and `:801` display "total hours" from
`hoursBetween`, i.e. a **different interval calculator** than the payroll one.

## C. Cost / preview UI surfaces

| Surface | File | Output | Labeling |
|---|---|---|---|
| Costing dashboard | `components/CostingDashboard.jsx` | Estimated labor $ = `(base+premium) × (reg + ot50×1.5 + ot100×2)` + km | Labeled "Estimated labor cost / Requires payroll review" |
| CCQ JSON preview | `components/CcqJsonExport.jsx` | Downloadable weekly CCQ records JSON | Labeled "Internal CCQ preview / Not finalized" |
| Employer cost sheet | `components/ElectricianCostSheet.jsx` | **Static** ACQ employer-cost reference grid (editable inputs), not derived from live jobs | Reference values, not employee pay |

## D. Export / integration surfaces (server)

| Function | Trigger | What it does | Sensitive config |
|---|---|---|---|
| `push_approved_to_sheet` | Manager action, one job | Pushes an approved job's **raw fields** (depart/arrivee/fin/km/ot) to Google Sheets via Apps Script; marks `exported_to_sheet` only on `success:true` | `APPS_SCRIPT_URL`, `APPS_SCRIPT_TOKEN` |
| `push_approved_batch` | Manager action, many jobs | Batch counterpart; idempotent dedup | same |
| `ccq_rates` | On-demand | Fetches CCQ rate table | CCQ endpoint |
| `ccq_rates_daily_sync` | **pg_cron**, each morning | Syncs CCQ rates | CCQ endpoint |
| `process_overtime_evidence` | On new evidence | OCR via `api.ocr.space` (external) | OCR key |
| `cleanup_overtime_evidence` | Retention | Deletes expired evidence + storage | — |
| `delete_user`, `send_announcement` | Manager actions | Not calculators/exports of pay | — |

**Scheduled jobs (pg_cron):** `ccq-card-renewals` (daily 12:00, migration 0009);
CCQ daily rate sync (function `ccq_rates_daily_sync`; scheduling migration currently in
`migrations/_archive/0004_ccq_daily_cron.sql` — confirm whether it is live in prod).

## E. Duplicate transformations to retire / converge

These are the reason M0.4 exists. Each needs a plan before Milestone 4 builds the single
authoritative engine.

1. **Two interval calculators.** `time.js:hoursBetween` (display) vs
   `payroll-calculations.js:minutesBetween` (pay). They disagree on past-midnight
   intervals (wrap vs return 0). *Plan:* display hours should be derived from the
   authoritative minutes, not recomputed. Do not "fix" one in isolation without a test
   that pins the intended overnight behavior.
2. **Sheet export is a second pay derivation.** The Google Sheets Apps Script lays out /
   derives values spreadsheet-side, independent of `calculatePayrollEntries`. So overtime
   can be computed in two places (app vs sheet). *Plan (M4/M5):* export the app's
   authoritative snapshot instead of raw fields the sheet re-derives.
3. **Two rounding helpers.** `payroll-calculations.roundHours` vs `time.formatHours`.
   *Plan:* one documented rounding rule.
4. **Inline minute→hour math.** `Week.jsx` (`/60` inline) and `EmployeeForm.jsx`
   (`overtimeDailyMinutes` computed locally). *Plan:* consume the shared calculator.

## F. Rule constants that currently live in code (need a cited source under `docs/rules/`)

- 480 min/day regular cap; 60 min OT@1.5 then 2× (`payroll-calculations.js`)
- 615 min weekday supper eligibility (`payroll-calculations.js`)
- Trade code `220`, sector `C`, appendix formatting (`ccq-export.js`, `ccq-rates.js`)
- Team-leader premium added into hourly rate (`CostingDashboard.jsx`, migration 0003)

None of these carry a primary-source citation yet. They are documented here as
*existing behavior*, not as validated rules — that validation is Milestone 1.

## Exit status for M0.4

- [x] Every calculator, preview, export, scheduled job, and external caller catalogued.
- [ ] A retirement/migration plan is *executed* for each duplicate in section E
  (tracked, not done — belongs to M4/M5).
