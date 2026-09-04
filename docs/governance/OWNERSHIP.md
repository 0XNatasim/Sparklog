# Ownership and approval gates (M0.3)

- **Status:** Active. Update when a responsibility changes hands.
- **Date:** 2026-09-04
- Companion to `docs/adr/0001-product-scope-timekeeping-and-payroll-export.md` and `GPT.md`.

Every responsibility below has a named owner. Work that touches an area must not ship
without its owner's approval (see "What each gate blocks").

## Owners

| Responsibility | Owner | Blocks |
|---|---|---|
| Product boundary and product decisions | simon1984bjeux@gmail.com | All releases |
| CCQ / legal interpretation | Karine Messier | Rule-engine behavior |
| Payroll validation | Karine Messier | Approved payroll basis / export |
| Security and privacy | simon1984bjeux@gmail.com | Sensitive-data and auth changes |
| Database migrations | simon1984bjeux@gmail.com | Production DB changes |
| Production deployment approval | simon1984bjeux@gmail.com | Production releases |
| Incident response | simon1984bjeux@gmail.com | Production operation |

> **Note on the CCQ/legal and payroll roles.** `GPT.md` calls for a *qualified*
> CCQ/payroll specialist to sign off on legal and compensation rules. Karine Messier
> is recorded here as the current authority for those decisions. Until a qualified
> specialist has validated a given rule with a cited source, no calculated value may
> be presented as finalized payroll — it stays labeled as an estimate / preview / not
> finalized / requires payroll review (per ADR 0001). Assigning an owner does not by
> itself constitute legal validation.

## What each gate blocks

- **Product boundary** — any change that would move SparkLog past "timekeeping +
  payroll export" (e.g. starting the full-payroll program) needs the product owner.
- **CCQ / legal** — any new or changed pay rule, premium, classification, overtime
  threshold, meal/travel rule, or CCQ calculation needs the legal owner *and* a cited
  source under `docs/rules/`. Enforced by the PR template's payroll-rule gate.
- **Payroll validation** — before any output is treated as an approved payroll basis
  or exported as such, the payroll owner signs off (parallel-run comparison per
  `GPT.md` M12 when the full engine exists).
- **Security and privacy** — RLS/policy changes, auth changes, and anything touching
  NAS/SIN, CCQ cards, or evidence images need the security owner. (Example: the
  `paused_employee_write_containment` migration.)
- **Database migrations** — production schema/RLS changes are applied only with the
  DB owner's approval, tested against a clean and an upgrade-path database first.
- **Production deployment** — releases go out only with the deployment owner's approval.
- **Incident response** — the incident owner leads any production incident.

## Escalation

1. Raise the issue with the responsible owner above.
2. Security incidents and suspected data exposure go to the security owner immediately,
   in parallel with the incident owner.
3. If an owner is unavailable and a release is blocked, the product owner decides
   whether to hold or proceed, and records the decision in the PR.

## Approval requirements

- Every PR uses `.github/pull_request_template.md`; the payroll-rule gate must be
  satisfied or the rule change is split out.
- Changes to this file require the product owner's approval.
- **Follow-up:** add a `CODEOWNERS` file once GitHub usernames for the owners are
  confirmed, so review requests route automatically. Not added yet to avoid recording
  guessed handles.
