<!--
SparkLog PR template. SparkLog is a timekeeping and payroll-EXPORT tool,
not a payroll engine — see docs/adr/0001-product-scope-timekeeping-and-payroll-export.md.
Fill in the sections that apply and delete the rest. Keep it short and honest.
-->

## Scope
- What this PR delivers (one outcome):
- Non-goals / what it deliberately does NOT change:

## Payroll-rule gate (required — do not delete)

Does this PR add or change any pay rule, premium, deduction, schedule, hourly
rate, classification, overtime threshold, meal/travel rule, or CCQ calculation?

- [ ] **No** — this PR does not touch compensation or classification logic.
- [ ] **Yes** — and I confirm ALL of the following, or this PR must not merge:
  - [ ] A primary-source citation and effective dates are recorded under `docs/rules/`.
  - [ ] A qualified payroll/CCQ specialist approved the rule (named, not assumed).
  - [ ] Ambiguous or undocumented cases return a visible `requires_review` result — not a guess.
  - [ ] Every calculated value stays labeled as one of: *Estimated labor cost · Internal CCQ preview · Not finalized payroll · Requires payroll review*.

> If you cannot check every box under "Yes", the rule change is out of scope for
> now. Split it out and open it against the rule-specification work (GPT.md M1).

## Risk review
- Authorization / privacy / data risks:
- Migration / backfill / compatibility risks (if any DB change):

## Verification
- Commands run and result (at minimum `npm test` and `npm run build`):
- Scenarios / identities tested:
- Screenshots for visible UI changes:

## Deployment notes
- Migrations or Supabase function deploys, and the order to apply them:
- Any secret/config change:
- Rollback / forward-fix plan:

## Follow-ups
- Known gaps or tracked next steps (never hide incomplete safety work):
