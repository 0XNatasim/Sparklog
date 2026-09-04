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

> ⚠️ **Known code discrepancy (to fix in M4 / a targeted fix).**
> `src/lib/payroll-calculations.js` currently applies the 1.5× hour **per day** (first
> 60 min of *each day's* overtime), not per week. That over-counts 1.5× hours and
> under-counts 2× hours for anyone with overtime on more than one day in a week — i.e.
> the app currently **mis-pays overtime**. The fix must move the 1.5× allowance to a
> weekly accumulator and be proven against the golden cases above before shipping.

## SUPPER — meal eligibility
- Eligible when a person works **≥ 615 min (10h15) in a weekday**.
- Weekdays only; no weekend work.

## TRADE_SECTOR — classification default
- All employees, for now: **trade 220, sector C (commercial)**.

## TEAM_LEADER_PREMIUM — premium application
- The per-employee team-leader premium ($/h) is added to the base hourly rate and paid
  on **all hours** (regular and overtime).

## Pending / not yet specified (do not guess — `requires_review`)
- CCQ primary-source citations (document + section + effective dates) for every rule above.
- Statutory holidays, vacation pay, and any premium other than team-leader.
- Apprentice-level rate steps (only "all trade 220 / sector C" is confirmed today).
