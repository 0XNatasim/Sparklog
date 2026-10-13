# Compensation rules (approved — interim authority)

- **Source of values:** interim CCQ/payroll authority `simon1984bjeux@gmail.com`,
  confirmed 2026-09-04. **CCQ primary-source citation still pending** — a qualified
  specialist should review these against the collective-agreement text before any
  output is treated as finalized payroll (per ADR 0001).
- **System of record:** table `public.payroll_rules` (migrations 0019–0021). This file
  is the human-readable companion. Update both together.

## Primary-source citations (checked 2026-10-13)

Sources, filed in `docs/reference/`:
- **CC** = *Convention collective 2025-2029, secteur institutionnel et commercial* (ACQ) —
  `convention-collective-ici-2025-2029.pdf`.
- **ACQ** = *Taux horaires suggérés de la main-d'œuvre*, 26 avril 2026 —
  `acq-grilles-taux-ici-2026-04-26.pdf` (ligne Électricien).
- **TP-1015.G** = Revenu Québec, *Guide de l'employeur* 2026-01 — `TP-1015.G(2026-01).pdf`.
- **CCQ-AI** = CCQ, avantages imposables ICI 2026-04-26 → 2027-04-24 —
  `tests/Tableau-Institutionnel-Commercial-2026-2027.pdf`.

| Rule in the app | Source | Verdict |
|---|---|---|
| 8 h/day, 40 h/week, Mon–Fri | CC 20.02 1), 2) | ✅ confirmed |
| First OT hour of the **week** at 1.5×, then 2× | CC 21.02 a) | ✅ confirmed |
| Meal 30 $ for an electrician | CC 20.07 3) c) i. | ✅ amount; ⚠️ the text says OT « consécutives à une journée de dix heures » (10 h, not 10 h 15) and a 2nd meal « après quatre autres heures » |
| Team-leader premium 8 % (4,06 $ = 8 % × 50,79) | CC 22.03 1) | ✅ rate; ❌ CC 22.01: OT majoration **does** apply to 22.03 premiums — the app pays the premium on regular hours only |
| 13 % indemnity (6 + 5,5 + 1,5), base includes OT | CC 19.05 1) | ✅ confirmed |
| Wages 50,79 / 25,40 / 30,47 / 35,55 / 43,17 | CC annexe C, ACQ (1) | ✅ confirmed |
| Pension 9 % compagnon / 4,5 % apprenti on wage + indemnity | CC 27.05 2) | ✅ (apprentice minimum 0,80 $/h not coded; never binding at current rates) |
| Employer avantages sociaux 8,875 $/h compagnon, **7,955 $/h apprentis** | ACQ (8) | ✅ per level since V2.4.101 |
| Taxable benefit 3,377 $/h | CCQ-AI, code 220, C3 | ✅ confirmed |
| Safety equipment 0,80 $/h | CC 25.05 3), ACQ (13) | ✅ confirmed |
| Prélèvement CCQ 0,75 % employee, on wage + 13 % | ACQ (10): employer **also** pays 0,75 % of « salaire brut » | ✅ the old « 1,5 % » = both shares; premium in/out of the base still unsourced |
| CNT 0,06 %, max 103 000 $ | TP-1015.G §7 | ✅ confirmed |
| FDRCMO 1 % above 2 M$ payroll | TP-1015.G §8 | ✅ confirmed |
| MÉDIC employee 0,68 $/h | CC 27.03 A) 2): « augmentée à 0,86 $ à compter du 26 avril 2026 » | ⚠️ conflicts with the CCQ hold noted in `ccq-benefits.js`; confirm with the CCQ |
| Return-to-warehouse time | CC 23.04 2) a), 23.15: requested travel after the normal day is « temps de transport », « payé au taux de salaire non majoré, sans avantages sociaux ni indemnité de congés » | ⚠️ matches the per-employee `returnOtNoBenefits` option, not the default (default can create OT) — owner decision |
| No weekend / holiday work | CC 21.01, 21.02 b): Saturday is OT; Sunday/holidays 200 % from the first hour | ⚠️ the engine has no day-of-week rule; it relies on entry being blocked |

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

## HOLIDAY_INDEMNITY — indemnité de congés ✅ approved
- **13% of the gross salary earned each week**, split:
  - **6.0%** annual vacations
  - **5.5%** paid statutory holidays
  - **1.5%** sick leave
- Same 13% rate for **every level**; the dollar amount differs only because wages
  differ. (The `Testing.jsx` "Vacances" row 6,60 / 3,30 / 3,96 / 4,62 / 5,61 is just 13%
  pre-expressed as $/h per level.)
- Remittance: employer remits monthly to the CCQ; the CCQ pays workers twice a year
  (end of June, end of November). SparkLog computes/shows the estimate; it does not
  remit.
- Source: CCQ *Chèque de vacances* — https://www.ccq.org/en/avantages-sociaux/salaire-taux/cheque-vacances
  and collective agreements; values confirmed by interim authority 2026-09-05.
- Calculation: `calculateCongesIndemnity(weeklyWageDollars)` in
  `src/lib/payroll-calculations.js`, tested. e.g. $1000 → **$130** (60 / 55 / 15).
- **Base — confirmed 2026-09-05:** the 13% is on **gross wages earned, which include
  overtime** (salaire brut incl. temps supplémentaire). So overtime premium dollars are
  in the base (Option 1). Sources: CCQ via construmd.com "Paie CCQ" (2026-06-30) and
  mobilepunch.com "How to calculate CCQ vacation pay in 2026". The one fully airtight
  check remains a real remittance on an overtime week.
- **It is employer-paid, on top of wages — NOT deducted from the worker.** In SparkLog
  it is shown as an employer cost (costing dashboard), never as a payroll deduction.
- Surfaced in the UI: "Leave 13%" column in the costing dashboard.

## TRADE_SECTOR — classification default
- All employees, for now: **trade 220, sector C (commercial)**.

## TEAM_LEADER_PREMIUM — premium application
- The per-employee team-leader premium ($/h) is added to the base hourly rate and paid
  on **all hours** (regular and overtime).

## Pending / not yet specified (do not guess — `requires_review`)
- CCQ primary-source citations (document + section + effective dates) for every rule above.
- Statutory holidays, vacation pay, and any premium other than team-leader.
- Apprentice-level rate steps (only "all trade 220 / sector C" is confirmed today).
