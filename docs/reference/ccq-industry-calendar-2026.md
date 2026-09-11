# CCQ — Construction Industry Calendar 2026

Reference copy of the CCQ *Calendrier de l'industrie de la construction 2026*
(official document `111230-PD5010F (2510)`). The PDF lives next to this file:
[`ccq-industry-calendar-2026.pdf`](./ccq-industry-calendar-2026.pdf).

Kept for reference only — it drives real-world dates for mandatory vacation
shutdowns, statutory holidays, and monthly reporting, which the timekeeping /
payroll-export flow has to line up with. It is **not** a source of pay-rule
calculations (see `docs/rules/` for those). Verify against the PDF before acting
on any date; the shaded per-month cells (see "monthly report period" below) are
only fully legible in the PDF itself.

## Legend (Légende)

| Marker (FR) | Meaning |
|---|---|
| Congés annuels obligatoires | Mandatory annual vacation shutdowns |
| Jours fériés chômés | Paid statutory holidays (not worked) |
| Cotisation annuelle AECQ | Annual AECQ employer dues |
| Période de rapport mensuel | Monthly reporting period |

## Mandatory annual vacations (Congés annuels obligatoires)

| Period | Dates |
|---|---|
| Winter 2025–2026 (*hiver*) | **21 December 2025 → 3 January 2026** |
| Summer 2026 (*été*) | **19 July 2026 → 1 August 2026** |
| Winter 2026–2027 (*hiver*) | **20 December 2026 → 2 January 2027** |

Notes from the calendar:
- During the 2025–2026 winter shutdown, **25 December** and **1 January** are also statutory holidays.
- During the 2026–2027 winter shutdown, **25 December** is also a statutory holiday.

## Month-specific events

| Month | Event(s) on the calendar |
|---|---|
| May (Mai) | Avis d'assurabilité (insurability notices) |
| June (Juin) | Cartes MÉDIC Construction · Indemnités de congés annuels (vacation-pay indemnities) |
| September (Septembre) | Relevés annuels de retraite (annual pension statements) |
| November (Novembre) | Avis d'assurabilité · Indemnités de congés annuels |
| December (Décembre) | Cartes MÉDIC Construction |

## Monthly report period (Période de rapport mensuel)

Each month carries a highlighted **monthly reporting period** (employer monthly
report to the CCQ). **Rule: the period always ends on the last Saturday of the
month.** This matches the app's payroll week, which also ends on Saturday
(`payrollWeekKey` in `src/lib/payroll-calculations.js`).

End date (last Saturday) for each month of 2026:

| Month | Period ends |
|---|---|
| January (janvier) | Sat 31 Jan 2026 |
| February (février) | Sat 28 Feb 2026 |
| March (mars) | Sat 28 Mar 2026 |
| April (avril) | Sat 25 Apr 2026 |
| May (mai) | Sat 30 May 2026 |
| June (juin) | Sat 27 Jun 2026 |
| July (juillet) | Sat 25 Jul 2026 |
| August (août) | Sat 29 Aug 2026 |
| September (septembre) | Sat 26 Sep 2026 |
| October (octobre) | Sat 31 Oct 2026 |
| November (novembre) | Sat 28 Nov 2026 |
| December (décembre) | Sat 26 Dec 2026 |

---

*Source: Commission de la construction du Québec (CCQ). Summary transcribed from
the 2026 calendar PDF; the PDF is authoritative.*
