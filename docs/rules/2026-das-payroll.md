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
CCQ → GROSS → PAYROLL).

**Source:** CCQ, secteur institutionnel-commercial, électricien (métier 220), annexe
C3 (aussi C4-C5), en vigueur du **2026-04-26 au 2027-04-24**. Salaires C3 : compagnon
50,79 $, apprenti 1 25,40 $, apprenti 2 30,47 $, apprenti 3 35,55 $, apprenti 4 43,17 $.

| Benefit | Rate | Bases affected | Source / status |
|---------|------|----------------|-----------------|
| Indemnité de congés | 13 % of the **base wage** (vacances 6 % + fériés 5,5 % + maladie 1,5 %) | RRQ pensionable, EI + RQAP insurable, Québec taxable | CCQ; `conges_indemnity_rate` (migration 0038); verified to the cent |
| Avantage imposable additionnel | 3,377 $/h (all levels of the trade) | RRQ pensionable, Québec taxable | `tests/Tableau-Institutionnel-Commercial-2026-2027.pdf`; verified to the cent |
| Cotisation salariale au régime de retraite | wage × (1 + 13 %) × **9 %** compagnon / **4,5 %** apprenti (compagnon C3 = 5,165343 $/h) | Québec taxable (**reduces** it) + withheld from pay | CCQ agreement; deductible from taxable income. Computed from the wage — follows the annual increase, never hardcoded |
| MÉDIC Construction (employee) + Québec 9 % insurance tax | 0,68 $/h × 1,09 = 0,7412 $/h | **none** (net withholding only, not a tax deduction) | CCQ held the premium at 0,68 $/h through 2027-04-24 |
| Federal taxable | wages | (kept at wages) | ⚠️ The printed federal base is 2 203,56 $ (see the reconciliation below). Sourced T4127 components (U1 union dues, F pension, F5A enhancement) only reach 2 221,58 $ — an unconfirmed hypothesis, still 18 $ off; so `taxableFederal` stays 0 (no fabricated delta) pending the payroll provider's breakdown + PDOC validation |

**Correction (important):** an earlier draft used a reverse-engineered
`socialBenefitsDeductionPerHour = 5,797 $/h` chosen only to hit the stub's Québec
tax. It was removed for the sourced pension deduction (5,165343 $/h compagnon C3),
which left a ~6 $ Québec residual. That residual is now **explained and resolved**:
it was the **deduction for the RRQ enhancement** ("première cotisation
supplémentaire", 1,0 %), which Revenu Québec deducts from taxable income and the
engine was not applying.

### RRQ enhancement deduction (base plan credit vs enhancement deduction)

The 6,30 % tier-1 employee rate splits into the base plan (5,30 %, a non-refundable
tax credit) and the enhancement (1,00 %, the "première cotisation supplémentaire").
The enhancement — plus all of tier-2 — is **deducted from taxable income** for BOTH
Québec (TP-1015.F) and federal (T4127 factor F5), and only the base portion is
credited. `rrq.js` returns `baseCreditCents` + `enhancementDeductionCents`; the
engine credits the base and deducts the enhancement (annualized) from both tax
bases. The 5,30 % / 1,00 % split is **confirmed** against the Revenu Québec RRQ 2026
table (revenuquebec.ca): "taux de cotisation de base de 5,30 % et taux de première
cotisation supplémentaire de 1 %" (total 6,30 %). The same table confirms YMPE
74 600 $, exemption 3 500 $, max. cotisable 71 100 $, cotisation max 4 479,30 $, and
tier-2 (MSGA 85 000 $, 4 %, max 416 $); RQAP 2026 is confirmed at 103 000 $, 0,430 %
(employee) / 0,602 % (employer).

### Printed taxable-base reconciliation (D0033-0007)

The real stub prints two taxable-income bases for the period: **federal 2 203,56 $**
and **provincial 2 386,59 $** — the ground truth for factor A (T4127) and its Québec
equivalent (TP-1015.F). Period components: salaire 2 194,00 ; vacances CCQ 264,11 ;
avantage imposable additionnel CCQ 135,08 ; retraite CCQ 206,60 ; cotisation syndicale
29,93 ; prélèvement CCQ 17,22.

#### Provincial base — reproduced to the cent (rounding policy confirmed)

`2 194,00 + 264,11 + 135,08 − 206,60 = 2 386,59 $` = the printed provincial base,
**exactly**. This confirms the CCQ composition (vacances + avantage imposable −
retraite déductible) AND the payroll's **rounding policy**: each component is rounded
to the cent before the base is built. The retraite is the tell — the payroll rounds
the pensionable hourly base first (`50,79 × 1,13 = 57,3927 → 57,39`, then × 9 % × 40 h
= 206,60 $), whereas the engine's full-precision path gives 206,6137 → 206,61 and a
base of 2 386,57 $. The 2¢ is a per-component rounding difference (see the rounding
test in `ccq-benefits.test.js`), not a composition error.

#### Federal base — UNCONFIRMED hypothesis (not reconciled from sourced rules alone)

With only the components sourced against **T4127** (t4127-01-26f.pdf) — factor
`A = [P × (I − F − F2 − F5A − U1)] − HD − F1`, where `U1 = cotisations syndicales
versées pour la période`, `F` includes RPA/pension contributions, and `F5A =
déduction des cotisations supplémentaires du RRQ` — the federal base is:

`salaire 2 194,00 + vacances 264,11 − retraite 206,60 − U1 29,93 = 2 221,58 $`

which is **18,02 $ OVER** the printed 2 203,56 $. It only comes within **0,80 $** if
the **prélèvement CCQ (17,22 $)** is *also* deducted federally — and that deduction
is **not sourced**. So the federal base is **not** reconciled; three things remain
open, each needing a primary source (do not assume):

1. **Is the CCQ vacances (264,11 $) federal employment income this period?** (vs
   accrued/paid later). Assumed above; unconfirmed.
2. **Is the prélèvement CCQ (17,22 $) an admissible federal deduction?** Not sourced.
   Do not treat every CCQ withholding as deductible union dues — only the 29,93 $
   cotisation syndicale is sourced as U1.
3. **Why is the avantage imposable additionnel (135,08 $) taxable in Québec but not
   federally?** The likely nature is an **employer-paid group-insurance premium**
   (taxable QC benefit on the RL-1, exempt federally as an employer PHSP contribution)
   — but this must be confirmed against the CCQ benefit schedule / RL-1 guide, **not**
   inferred from the numeric reconciliation alone.

**Production stays honest (NOT hardcoded):** the engine keeps
`ccqBenefits.baseAdjustments.taxableFederal = 0` (federal base = wages) rather than
fabricate the +9,56 $ delta. F5A (the RRQ enhancement) **is** applied per T4127.
Federal computes **256,71 $** vs the stub's **259,95 $**; the ~3 $ gap is left
visible. Only once the three points above are sourced will the federal components be
modelled **separately** (federal-taxable indemnity, federally-deductible pension,
admissible U1 union dues) — never as a net delta.

**To close it, request from the payroll provider:** the period breakdown of the
"gains imposables — fédéral" line (2 203,56 $): which CCQ benefits are federal
taxable vs Québec-only, the exact federal deduction amounts (RPA, U1, and whether the
prélèvement is deductible), and the TD1 federal claim used. Then validate against
PDOC (federal) and WebRAS (Québec). The rule set stays `draft` (every result
`requires_review`).

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
