# Compensation rules (approved — interim authority)

- **Source of values:** interim CCQ/payroll authority `simon1984bjeux@gmail.com`,
  confirmed 2026-09-04. **CCQ primary-source citation still pending** — a qualified
  specialist should review these against the collective-agreement text before any
  output is treated as finalized payroll (per ADR 0001).
- **System of record:** table `public.payroll_rules` (migrations 0019–0021). This file
  is the human-readable companion. Update both together.

## OVERTIME — thresholds and rates
- Regular hours: up to **8h/day (480 min)**.
- **Trigger:** hours **over 8h in a day are always overtime**, regardless of the weekly
  total.
- **Rate split (weekly):** across a week's total overtime, the **first 60 minutes are at
  1.5×**, and **everything beyond that is at 2×**.
- No weekend work, ever. Normal week = 40h (5 × 8h).

**Worked examples (golden cases):**
| Input | Regular | @1.5× | @2× |
|---|---|---|---|
| 9h each day Mon–Fri (45h) | 40h | 1h | 4h |
| 12h Mon, then 24h Tue–Fri (36h) | 32h | 1h | 3h |

> ✅ **Fixed 2026-09-04.** `src/lib/payroll-calculations.js` now applies the 1.5× hour
> per **week** (accumulator scoped to the week ending Saturday), matching this rule. The
> golden cases above are pinned as tests in `payroll-calculations.test.js`. Previously
> the 1.5× hour reset each day, which under-paid overtime on multi-day-OT weeks.

## SUPPER — meal eligibility
- Eligible when a person works **≥ 615 min (10h15) in a weekday**.
- Weekdays only; no weekend work.

## HOLIDAY — statutory holidays & construction vacation
- Employees **never work** statutory holidays or the construction vacation weeks
  (treated like weekends). The app already **blocks job entry** on `company_holidays`
  dates, and that calendar is populated from the CCQ calendar through 2029.
- Source: CCQ dates congés/vacances + FAQ fériés (see links in `payroll_rules`).

## HOLIDAY_INDEMNITY — holiday + vacation pay ⏳ requires_review
- Decision: **SparkLog should compute** the holiday/vacation indemnity (not left to
  external payroll).
- **Blocked on a value.** The indemnity percentage(s) and the base they apply to come
  from the CCQ *Chèque de vacances* page
  (`https://www.ccq.org/en/avantages-sociaux/salaire-taux/cheque-vacances`) and the
  collective agreements. `ccq.org` is blocked by the sandbox network policy, so the
  figure could not be fetched here. Recorded as **draft** until the interim authority
  supplies the percentage/base (and any per-annexe/level differences — cf. the
  `Vacances` row in `Testing.jsx`: 6,60 / 3,30 / 3,96 / 4,62 / 5,61).
- Until then, no indemnity is computed and nothing claims one (`requires_review`).

## TRADE_SECTOR — classification default
- All employees, for now: **trade 220, sector C (commercial)**.

## TEAM_LEADER_PREMIUM — premium application
- The per-employee team-leader premium ($/h) is added to the base hourly rate and paid
  on **all hours** (regular and overtime).

## Pending / not yet specified (do not guess — `requires_review`)
- CCQ primary-source citations (document + section + effective dates) for every rule above.
- Statutory holidays, vacation pay, and any premium other than team-leader.
- Apprentice-level rate steps (only "all trade 220 / sector C" is confirmed today).
