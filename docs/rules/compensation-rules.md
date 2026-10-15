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
| Meal 30 $ for an electrician | CC 20.07 3) c) i.: OT « consécutives à une journée de dix heures » | Messier rule since V2.4.110: 2 h 15 of overtime (1.5× or 2×) = ≥ 10 h 15 of work, return excluded (migration 0086); 2nd meal « après quatre autres heures » not coded |
| Team-leader premium 8 % (4,06 $ = 8 % × 50,79) | CC 22.03 1); 22.01: OT majoration applies to 22.03 premiums | ✅ rate; per-employee option `team_leader_premium_overtime` (V2.4.102) pays it majorée on OT; off = regular hours only (Messier stubs) |
| 13 % indemnity (6 + 5,5 + 1,5), base includes OT | CC 19.05 1) | ✅ confirmed |
| Wages 50,79 / 25,40 / 30,47 / 35,55 / 43,17 | CC annexe C, ACQ (1) | ✅ confirmed |
| Pension 9 % compagnon / 4,5 % apprenti on wage + indemnity | CC 27.05 2) | ✅ (apprentice minimum 0,80 $/h not coded; never binding at current rates) |
| Employer avantages sociaux 8,875 $/h compagnon, **7,955 $/h apprentis** | ACQ (8) | ✅ per level since V2.4.101 |
| Taxable benefit 3,377 $/h | CCQ-AI, code 220, C3 | ✅ confirmed |
| Safety equipment 0,80 $/h | CC 25.05 3), ACQ (13) | ✅ confirmed |
| Prélèvement CCQ 0,75 % employee, on wage + CCQ team-leader premium + 13 % | ACQ (10): employer **also** pays 0,75 % of « salaire brut »; owner decision 2026-10-13 for the premium | ✅ the old « 1,5 % » = both shares; the non-CCQ premium stays out |
| CNT 0,06 %, max 103 000 $ | TP-1015.G §7 | ✅ confirmed |
| CNESST maximum assurable 103 000 $ per year per employee | ACQ note (16) | ⚠️ not coded: `calculateCnesst` assesses all pay. The Q3 report shows an « excédent » even for modest annual pay; hypothesis to verify against weekly stubs: a per-pay cap of 103 000 $ / 52 = 1 980,77 $ |
| FDRCMO 1 % above 2 M$ payroll | TP-1015.G §8; Loi D-8.3 art. 3 (masse salariale of a **calendar year**), 11 (excess expenses carried forward), 12 (**CCQ training-fund contributions — 0,20 $/h, ACQ (12) — count as eligible training expenses** if the CCQ attests disbursements that year), 14–16; Sommaire 1 (RLZ-1.S) lines 71–75 and 79.1–79.5 | ✅ rate/threshold. Neither the law nor the form prorates the 2 M$ threshold for a first partial year (the guide RLZ-1.S.G and règlement D-8.3, r. 4 were not readable here): accountant to confirm. The engine does not deduct the CCQ training-fund credit (annual reconciliation on the Sommaire 1, not per pay) |
| MÉDIC employee 0,68 $/h | CC 27.03 A) 2) schedules 0,86 $ from 2026-04-26, but annexe R lets the parties reduce it; CCQ notice « Conventions collectives : du nouveau pour le rapport mensuel de mai 2026 » (2026-04-20): CASIC decision keeps 0,68 $ salarié / 2,93 $ patronal **until 2027-04-24** | ✅ dated since V2.4.130 (`MEDIC_RATES` / `medicRatesOn` in `src/payroll/ccq-benefits.js`): 0,68 $ / 2,93 $ until 2027-04-24, then **1,06 $ / 3,31 $ from the pay week of 2027-04-25** (convention; CCQ date — FIPOE writes April 30). The 9 % insurance tax applies to both parts. Only the employee part is withheld; the employer part is already inside ACQ (8). Confirm with the CCQ before 2027-04-25 that the CASIC freeze is not extended |
| Return-to-warehouse time | CC 23.04 2) a), 23.15: requested travel after the normal day is « temps de transport », « payé au taux de salaire non majoré, sans avantages sociaux ni indemnité de congés » | ✅ since V2.4.101 (engine 2.2.0): never overtime; default without benefits; Messier bonus option keeps benefits up to 8h — see RETURN below |
| No weekend / holiday work | CC 21.01, 21.02 b): Saturday is OT; Sunday/holidays 200 % from the first hour | ⚠️ the engine has no day-of-week rule; it relies on entry being blocked |

## OVERTIME — thresholds and rates
- Regular hours: up to **8h/day (480 min)**.
- **Trigger:** hours **over 8h in a day are always overtime**, regardless of the weekly
  total.
- **Rate split (weekly):** across a week's total overtime, the **first 60 minutes are at
  1.5×**, and **everything beyond that is at 2×**.
- Normal week = 40h (5 × 8h, Monday–Friday). Employee entry is blocked on weekends and
  holidays, but the engine (2.3.0, V2.4.102) pays them per convention 21.01 / 21.02 b):
  **Saturday** — every minute is overtime (the week's 1.5× hour if unused, then 2×);
  **Sunday and statutory holidays** (`company_holidays`) — 2× from the first hour, without
  using the 1.5× hour. Return time on those days has no benefits.

**Worked examples (golden cases):**
| Input | Regular | @1.5× | @2× |
|---|---|---|---|
| 9h each day Mon–Fri (45h) | 40h | 1h | 4h |
| 12h Mon, then 24h Tue–Fri (36h) | 32h | 1h | 3h |

> ✅ **Fixed 2026-09-04.** `src/lib/payroll-calculations.js` now applies the 1.5× hour
> per **week** (accumulator scoped to the week ending Saturday), matching this rule. The
> golden cases above are pinned as tests in `payroll-calculations.test.js`. Previously
> the 1.5× hour reset each day, which under-paid overtime on multi-day-OT weeks.

## RETURN — return-to-warehouse time (owner decision 2026-10-13)
- Return time (`return_time_minutes`, logged inside Départ→Fin) is **never overtime** and is
  left out of the 8h/overtime split, which uses the work only.
- **Default (everyone):** paid at the base rate **without social benefits** (no 13 %,
  no CCQ benefits) — convention ICI 23.04 2) a), 23.15.
- **Option `return_with_benefits_to_8h`** (Règles de temps, unchecked for everyone at
  rollout): Messier bonus — return time is paid as regular time **with** benefits while the
  day's work + return stays within 8h; the part beyond 8h is paid without benefits.
  **Only for days from 2026-10-04 (CCQ week 42)** — owner decision 2026-10-14, when the option
  was checked for every employee; earlier days keep the default (`RETURN_WITH_BENEFITS`, engine 2.5.0).
- Work always takes the 8h first, whatever the job order. An unpaid first trip is removed
  before the 8h room is measured. Subcontractors: always the default.
- The >8h overtime-proof threshold still counts return time; the supper never does (owner
  decisions 2026-10-13, see SUPPER).
- Examples: 6h30 job + 1h return → default 6h30 regular + 1h without benefits; checked
  7h30 regular. 6h30 job + 2h return → checked 8h regular + 0h30 without benefits.
  9h job + 1h return → 8h regular + 1h overtime + 1h return without benefits.
- Engine: `calculatePayrollEntries` (`payroll_engine.js` 2.2.0); tests in
  `src/lib/payroll-calculations.test.js`.

## DAY_ROUNDING — each day paid to the nearest 15 minutes (owner decision 2026-10-14)
- Each day's paid time (Départ→Fin spans, **return included**, unpaid first trip removed) is paid to
  the nearest 15 minutes, and the difference is carried in a **counter per employee, never reset**:
  `paid = round15(worked − counter)`, `counter += paid − worked`. Up to 7 minutes rounds down, 8 and
  more rounds up, so the counter stays within ±7 minutes and no minute is lost over time.
  Example: Monday 8 h 07 → 8 h 00 (counter −7, owed to the employee); Tuesday 7 h 53 + 7 = 8 h 00 →
  8 h 00 (counter 0); 8 h 08 → 8 h 15 (counter +7, paid more by the employer).
- The minutes added or removed go to the day's **return time** when it has some (removed from the
  return first, then from the end of the work if the return is shorter); without return, to the **end
  of the day's work**: overtime when the day is over 8 h, regular time otherwise (owner, 2026-10-14).
- From **2026-10-04 (CCQ week 42)** — moved from week 41 by the owner on 2026-10-14 (engine 2.5.0);
  earlier days are paid to the minute and the counter starts at 0 on 2026-10-04. Days that count for
  the counter: every job except drafts.
- Engine 2.4.0 (start date 2.5.0): `DAY_ROUNDING`, `buildDayRounding`, option `rounding` of `calculatePayrollEntries`;
  counters loaded by `src/lib/day-rounding.js` for every pay screen (Calcul, Talons, DAS, Paie de la
  semaine, Coûts, Semaine/mois, Vue semaine, RE, export CCQ, sommaire imprimable, page Semaine de
  l'employé). Not applied: overtime-proof threshold, supper threshold, anomalies (real minutes), the
  Google Sheet export (computed by Apps Script) and the unused `classify_week` Edge Function.

## SUPPER — meal eligibility
- Eligible on a weekday once the day has **2 h 15 of overtime — at 1.5× or 2×, both are work
  time** — i.e. **at least 10 h 15 (615 min) of paid work**. **Return-to-warehouse time never
  counts.** Owner decision 2026-10-13 (revised the same day; `payroll_rules` SUPPER v3,
  migration 0086), **applied from CCQ week 41 — 2026-09-27** (migration 0087: pending claims
  since that date re-checked, those below the threshold withdrawn; reviewed claims kept). The
  unpaid first trip (option) is not work either.
- History: v1 ≥ 615 paid min (return included) until 2026-09-26; v2 > 600 paid min with return
  included, replaced the same day (empty range kept for the record).
- Twins: `isMealEligible` / `dayWorkMinutesWithoutReturn` (engine, used through
  `src/lib/meal-eligibility.js`) and `reconcile_overtime_meal` (same 615-minute test).
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

## TEAM_LEADER_PREMIUM — premium application (owner decisions 2026-10-13)
Two separate per-employee premiums ($/h, Règles de temps › Chef d'équipe):
- **Non-CCQ premium** (`team_leader_premium`, e.g. 4,06 $/h on stub D0033-0007): paid on
  regular hours at the flat rate (« Régulier à taux horaire »); **outside** the 13 % indemnity
  and the CCQ prélèvement, as Messier's stubs print it.
- **CCQ team-leader premium** (`team_leader_premium_ccq`, convention 22.03, V2.4.103): paid
  on regular hours on its own line (« Prime chef d'équipe CCQ »); **included in the 13 %
  indemnity and the 0,75 % CCQ prélèvement** bases.
- Option `team_leader_premium_overtime` (unchecked by default): both premiums are also paid on
  **overtime hours, majorées** like the wage (×1,5 / ×2) — convention 22.01.
- Union dues and the pension contribution are unchanged (wage only) — not specified.
- Lunch (dîner): 20.02 3) ½ h or 1 h unpaid — employees already leave it out of their
  Départ→Fin entries (owner confirmation 2026-10-13); nothing to deduct in the app.

## Pending / not yet specified (do not guess — `requires_review`)
- CCQ primary-source citations (document + section + effective dates) for every rule above.
- Statutory holidays, vacation pay, and any premium other than team-leader.
- Apprentice-level rate steps (only "all trade 220 / sector C" is confirmed today).
