# 2026 statutory payroll (DAS) rule set — Québec

> **Status: DRAFT — NOT VALIDATED. Do not use for finalized pay.**
>
> **Validation progress (2026):** RRQ, EI (QC) and RQAP verified against CRA
> **T4127 123e édition** (Tableaux 8.4 / 8.8 and the EI table). Federal income tax
> verified against **T4127 Tableau 8.1/8.2** — brackets + K, MPBF max 16 452 $,
> CCE 1 501 $, Québec abatement 16.5 %. **Still a placeholder:** the Québec income
> tax (TP-1015.F brackets, montant de base, déduction pour travailleur). The rule
> set stays `draft` (every result `requires_review`) until the Québec side is filled
> and a few pays are validated against WebRAS/PDOC with specialist sign-off.
>
> This document registers the constants and sources for the payroll (source
> deductions / DAS) engine under `src/payroll/`. Per
> [ADR 0001](../adr/0001-product-scope-timekeeping-and-payroll-export.md) and the
> PR payroll-rule gate, this engine is a **Testing-only test bench**. Every value
> in `src/payroll/rules/2026.js` is a **placeholder** seeded from a draft spec and
> **has not been checked against a primary source**. The engine flags every result
> `requires_review` while `RULE_VERSION.status === "draft"`.

## Scope

The engine implements, for an employee whose province of employment is Québec:

- **Employee deductions:** federal income tax, Québec income tax, RRQ (base + 1st
  and 2nd additional), Employment Insurance (Québec rate), RQAP.
- **Employer contributions:** RRQ, EI, RQAP (employer shares), FSS, labour
  standards (CNT), FDRCMO (workforce skills fund), CNESST.
- **DAS grouping:** Revenu Québec bucket vs. ARC (federal) bucket.

It is a pure, deterministic function (`calculatePayroll`). It is **not** wired to
real employees or timecards, and does not compute finalized pay.

## Sources of truth (to cite once validated)

| Area | Primary source | Notes |
|------|----------------|-------|
| Québec income tax, RRQ, RQAP, FSS | **Revenu Québec TP-1015.F** (2026-01) | Prevails over WebRAS on any discrepancy |
| Québec employer guide | TP-1015.G (2026) | Assujettissement, versements, obligations |
| Québec tables | TP-1015.TI / TP-1015.TR / TP-1015.TA | Income tax / RRQ / RQAP tables |
| Québec validation | WebRAS | Result comparison oracle |
| Federal tax + EI | **CRA T4127** (Payroll Deductions Formulas) | Primary federal formula source |
| Federal tables (QC) | T4032-QC / T4008-QC | |
| Federal validation | PDOC | Result comparison oracle |

## Placeholder constants register

Every constant below lives in `src/payroll/rules/2026.js` and is marked
`_PLACEHOLDER`. To validate: replace the value with the verified figure, record the
citation + effective date here, then flip `RULE_VERSION.status` to `"validated"`.

- **RRQ:** YMPE, basic exemption, tier-1 rate/max (employee + employer), tier-2
  band (YMPE → second ceiling), tier-2 rate/max.
- **EI (Québec):** max insurable earnings, employee/employer rate, employee/
  employer maximum.
- **RQAP:** max insurable earnings, employee/employer rate, employee/employer max.
- **Federal tax:** brackets `{upTo, rate, K}`, lowest rate, basic personal amount,
  Canada employment amount.
- **Québec tax:** brackets `{upTo, rate, K}`, lowest rate, basic personal amount,
  worker deduction.
- **FSS:** general low/high payroll thresholds + rates + sliding-scale base/factor;
  primary-manufacturing and public flat rates.
- **Labour standards (CNT):** rate, max assessable per employee.
- **FDRCMO:** payroll threshold, rate.
- **CNESST:** no statutory default — employer-file specific; missing rate returns
  `requires_review`.

## CCQ benefit accounting (upstream of the tax engine)

The tax engine is fed pre-computed gross earnings plus optional **base adjustments**
(`calculatePayroll({ baseAdjustments })`). The CCQ layer (`src/payroll/ccq-benefits.js`)
folds collective-agreement benefits into the correct statutory bases *before* the
engine runs, keeping construction rules out of the tax engine (spec step 17: TIME →
CCQ → GROSS → PAYROLL). For the ICI sector, électricien (métier 220), annexe C3:

| Benefit | Rate | Bases affected | Source / status |
|---------|------|----------------|-----------------|
| Indemnité de congés (vacances) | 13 % of the **base wage** (hours × base rate, excl. premium/OT multiplier) | RRQ pensionable, EI + RQAP insurable, Québec taxable | 13 % = 6 % + 5,5 % + 1,5 % (`conges_indemnity_rate`, migration 0038); verified to the cent against the stub |
| Avantage imposable additionnel | 3,377 $/h | RRQ pensionable, Québec taxable | `tests/Tableau-Institutionnel-Commercial-2026-2027.pdf` ("Avantage imposable", ligne Électricien C3); verified to the cent |
| Déduction avantages sociaux | 5,797 $/h | Québec taxable (reduces it) | ⚠️ **DERIVED** to reproduce the stub; not yet cross-checked against a published CCQ avantages-sociaux schedule |
| Federal taxable | — | (unchanged) | Indemnity/benefit are taxed federally on payout, not in the period earned |

Validation against Simon Bellerive's D0033-0007 stub (week 2026-08-30 → 09-05, 40 h,
base 50,79 $ + prime 4,06 $, seeded YTD through 2026-08-29): **RRQ, EI, RQAP and
Québec income tax all reproduce to the cent**; federal income tax lands within CRA
table-rounding tolerance (~1 $ of 259,95 $). Per-level (apprenti) rates and the
avantages-sociaux déduction schedule still need sourcing before sign-off. The rule
set stays `draft` (every result `requires_review`).

## Validation checklist (before flipping to `validated`)

1. Replace every `_PLACEHOLDER` with a verified 2026 figure + citation above.
2. Build WebRAS fixtures for the Québec side (tax, RRQ, RQAP, FSS).
3. Build PDOC fixtures for the federal side (tax, EI).
4. Assert every scenario within **≤ $0.01** of the official calculator.
5. Cover the scenario matrix: standard weekly/26/52 periods, RRQ near/at tier-1
   max, RRQ tier-2, RRQ2 max, EI max, RQAP max, bonus, overtime, vacation, taxable
   benefit, mid-year new hire, 65+/72+ RRQ rules, final pay, retroactive.
6. Obtain **named** qualified payroll/legal specialist sign-off (PR gate).

## Engine architecture

```
TIME / CCQ  →  GROSS PAY  →  [ PURE PAYROLL ENGINE ]  →  employee deductions + net
                                                          employer contributions
                                                          DAS (Québec / ARC)
```

The Testing → Payroll tab contains no tax logic; it only calls
`calculatePayroll(input)` and renders the result. The same engine is intended to
back real pay runs, pay stubs, batch and DAS reports **only after** validation and
sign-off, as a separate approved program (see `GPT.md` Milestone 12).
