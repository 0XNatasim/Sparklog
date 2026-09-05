# ADR 0001 — Product scope: timekeeping and payroll export, not a payroll engine

- **Status:** Accepted
- **Date:** 2026-09-04
- **Deciders:** simon1984bjeux@gmail.com (product owner)
- **Work package:** M0.1 (see `GPT.md`)

## Context

SparkLog records work facts for an electrical contractor's field crew and helps a
manager review and export those hours. There is pressure to grow it toward a full
Québec construction payroll system. Doing so without qualified payroll and legal
review would mean shipping statutory calculations (deductions, remittances, CCQ
rules) that no specialist has validated — a correctness and compliance risk that
the application, as a field tool, is not positioned to carry today.

We need an explicit, written boundary so that later work does not quietly turn
review previews into authoritative payroll.

## Decision

SparkLog is a **timekeeping and payroll-export system first**, not a complete Québec
construction payroll engine. Within that boundary it:

1. Records authoritative work facts (who, when, hours, travel, evidence).
2. Classifies hours **for review**.
3. Produces reproducible approval snapshots.
4. Exports those results to an established, external payroll system.

Final deductions, remittances, and statutory payroll remain **outside** SparkLog
until a separately approved full-payroll program (see `GPT.md` Milestone 12) is
completed and signed off by payroll and legal specialists.

### Constraints this decision imposes

- **Do not rewrite the application.** Preserve the existing React / Vite / Supabase
  field workflow and deliver changes incrementally.
- **Every calculated value must be labeled** as one of the following until qualified
  payroll and legal reviewers sign off:
  - Estimated labor cost
  - Internal CCQ preview
  - Not finalized payroll
  - Requires payroll review
- **Do not invent or infer legal rules.** When a rule lacks approved documentation,
  surface a visible `requires_review` result instead of silently guessing.
- Authoritative logic (authorization, classification, approval, export) belongs on
  the server (Supabase). React owns presentation and input only.

## Consequences

- Costing and CCQ surfaces present **estimates**, not finalized pay. (Initial labeling
  landed in the M0.5 work; a full audit of every remaining report, notification, file
  name, and export is still open.)
- New premiums, deductions, schedules, or classifications may not ship without an
  approved rule and specialist review (tracked under `GPT.md` Milestones 1–2).
- A future full-payroll capability is a **separate program** with its own scope, legal
  specification, and sign-off — not an extension merged into this codebase by default.

## Ownership

This ADR is a product decision with a named accountable owner.

- Product owner: **simon1984bjeux@gmail.com**
- Accepted on: **2026-09-04**

## References

- `GPT.md` — Sparklog Payroll & CCQ Integrity Program (Milestones 0 and 12)
- Migration `supabase/migrations/0018_paused_employee_write_containment.sql` (M2 start)
