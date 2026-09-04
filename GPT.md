# Sparklog Payroll & CCQ Integrity Program

> Execution plan for Claude Code. Read this entire document before changing code.

## 1. Mission and product boundary

Sparklog is to become a **timekeeping and payroll-export system first**, not a complete
Québec construction payroll engine. It records authoritative work facts, classifies
hours for review, produces reproducible approval snapshots, and exports those results
to an established payroll system. Final deductions, remittances, and statutory payroll
remain outside Sparklog until a separately approved full-payroll program is completed.

Do not rewrite the application. Preserve the React/Vite/Supabase field workflow and
deliver the work below incrementally. Until qualified payroll and legal reviewers sign
off, every calculated value must be described as one of:

- **Estimated labor cost**
- **Internal CCQ preview**
- **Not finalized payroll**
- **Requires payroll review**

Do not invent or infer legal rules. When a rule lacks approved documentation, return a
visible `requires_review` result instead of silently guessing.

## 2. Instructions for Claude Code

For every work session:

1. Read this file, `README.md`, every applicable `AGENTS.md`, and the relevant existing
   migrations, functions, tests, and callers.
2. Inspect `git status` and recent history. Never overwrite unrelated work.
3. Select **one unchecked work package** whose prerequisites are complete. Do not mix
   schema foundations, calculation changes, and UI redesign in a single pull request.
4. Write a short implementation plan and identify security, migration, rollback, data
   backfill, privacy, and legal-review consequences before editing.
5. Add tests before or with implementation. Database authorization must be tested with
   direct Supabase requests, not merely by hiding controls in React.
6. Use additive, forward-only migrations. Never edit a migration already deployed.
7. Keep raw work facts immutable after approval; derived results belong in snapshots.
8. Update documentation and this checklist. Record decisions in ADRs under
   `docs/adr/`; record approved rules under `docs/rules/`.
9. Run the smallest relevant tests while developing, then the complete required gate.
10. Review the diff for secrets, PII, permissive RLS, destructive SQL, duplicate rule
    implementations, and accessibility regressions.
11. Commit a coherent change and open a pull request with migration order, deployment
    steps, rollback/forward-fix instructions, test evidence, screenshots for visible
    changes, and unresolved risks.

Never place service-role keys, payroll-provider secrets, NAS/SIN data, production
records, or real evidence images in the repository, logs, fixtures, screenshots, or PRs.
Never bypass RLS from a browser. Never put authoritative payroll logic in React.

## 3. Mandatory human ownership and approval gates

Create `docs/governance/OWNERSHIP.md` and replace each placeholder with a named person
before the corresponding production release:

| Responsibility | Required owner | Blocks |
|---|---|---|
| Product boundary and product decisions | `TBD` | All releases |
| CCQ/legal interpretation | `TBD` qualified specialist | Rule-engine behavior |
| Payroll validation | `TBD` payroll specialist | Approved payroll basis/export |
| Security and privacy | `TBD` | Sensitive-data and auth changes |
| Database migrations | `TBD` | Production DB changes |
| Production deployment approval | `TBD` | Production releases |
| Incident response | `TBD` | Production operation |

No compensation or classification rule may ship without a primary-source citation,
effective dates, approved examples, reviewer, automated fixtures, and immutable rule
version. Claude Code may build the schema and mark fixtures pending, but must not claim
legal validation or fill approval fields on behalf of a human.

## 4. Repository architecture target

Gradually move toward this organization without a big-bang rewrite:

```text
src/
  domain/time/          # raw intervals, normalization, overlap validation
  domain/payroll/       # preview types and API clients, no authoritative approval
  domain/ccq/           # CCQ presentation/export adapters
  domain/expenses/      # meal/parking models and views
  domain/employees/     # employee-facing domain UI
  services/             # Supabase and sync adapters
  components/           # small presentation components
supabase/
  functions/            # authenticated orchestration and authoritative calculation
  migrations/           # forward-only schema/RLS changes
tests/
  rls/                  # direct multi-identity authorization tests
  integration/          # Edge Function/database workflows
  e2e/                  # critical browser flows
docs/
  adr/ rules/ runbooks/ privacy/ threat-model/
```

Use integer minutes and integer currency minor units for persisted calculations. Define
rounding rules explicitly; do not use floating-point money. All server timestamps use
UTC, while work dates and legal day/week boundaries use the approved Québec timezone
policy. Store stable identifiers and hashes, not locale-formatted values.

## 5. Program backlog and delivery order

Checkboxes are evidence-based: mark an item complete only when its acceptance tests,
documentation, review, and deployment prerequisites are satisfied.

### Milestone 0 — Freeze and governance

- [ ] **M0.1 — Declare product scope.** Add an ADR selecting timekeeping/payroll export,
  describe excluded deductions/remittances, and expose the boundary in operator docs.
- [ ] **M0.2 — Freeze payroll-rule expansion.** Add a PR template checklist that rejects
  new premiums, deductions, schedules, or classifications without the rule gate.
- [ ] **M0.3 — Assign owners.** Add the ownership document above, CODEOWNERS where
  appropriate, escalation paths, and approval requirements.
- [ ] **M0.4 — Inventory current calculations and exports.** Map every calculator,
  dashboard, preview, Edge Function, Apps Script, cron, and external caller. Identify
  duplicate transformations and give each a retirement or migration plan.
- [x] **M0.5 — Label known previews as estimates.** Existing UI copy provides an initial
  warning. Audit every remaining report, notification, file name, API response, and
  export before considering the labeling work complete.

**Exit:** scope is approved, named owners exist, no unreviewed rule can enter unnoticed,
and all current calculation surfaces are catalogued.

### Milestone 1 — Legally validated specification

- [ ] **M1.1 — Rules schema/document format.** Define fields: `rule_code`, `title`,
  `sector`, `trade`, `appendix`, `schedule_type`, `effective_from`, `effective_to`,
  `source_document`, `source_section`, `approved_by`, `approved_at`, `examples`,
  `exceptions`, and `version`. Enforce non-overlapping versions where applicable.
- [ ] **M1.2 — Specialist rules matrix.** Obtain written decisions for the first 50%
  overtime allowance, daily/weekly interaction, Saturday, Sunday, holidays, construction
  vacations, 8-hour/10-hour/compressed/service schedules, overnight shifts, mid-week
  schedule changes, travel/return-to-storage, meals, team-leader premiums, apprentice
  levels, appendices, and Sparklog's actual employee arrangements.
- [ ] **M1.3 — Golden fixtures.** Add traceable fixtures for exactly 8h, 8h+1m, 9h on
  one/two days, crossing 40h, post-threshold work, authorized/unauthorized Saturday,
  Sunday, holiday, overnight, multiple and overlapping jobs, 4x10, service schedules,
  mid-week schedule/rate/classification changes, storage return, rejected/cancelled and
  corrected approved jobs, and minute/period rounding boundaries.
- [ ] **M1.4 — Validation workflow.** Add fixture status (`draft`, `specialist_approved`,
  `superseded`), reviewer identity, approval timestamp, source link/hash, and CI behavior
  that distinguishes mechanical tests from legally approved fixtures.

**Exit:** specialists approve the applicable matrix, fixtures identify their sources and
versions, and unresolved scenarios fail safely as `requires_review`.

### Milestone 2 — P0 authorization containment

The existing `0018_paused_employee_write_containment.sql` is a starting point, not proof
of completion. Audit all tables, buckets, RPCs, Edge Functions, and legacy policies.

- [ ] **M2.1 — Authorization inventory.** Generate a table-by-table and bucket-by-bucket
  CRUD matrix for anonymous, active employee A/B, paused employee, manager, and service
  role. Include views, functions, realtime, and indirect writes from triggers.
- [ ] **M2.2 — Active-account invariant.** Apply the database predicate to job, meal,
  parking, overtime, notification, CCQ-card, evidence, and future sync writes. Include
  insert/update/delete and storage upload/update/move/delete semantics as appropriate.
- [ ] **M2.3 — Profile allowlist.** Confirm product-approved employee-owned fields.
  Replace trigger-only assumptions with least-privilege columns/RPCs where practical;
  manager/server fields use dedicated, authorized operations. Ensure employees cannot
  modify ownership, role, pause, rates, schedules, classifications, NAS, audit fields,
  approval/export state, or timestamps.
- [ ] **M2.4 — Adversarial integration suite.** Start disposable Supabase locally in CI,
  mint/use separate identities, and exercise every CRUD operation plus forged ownership,
  approval fields, evidence paths, review state, audit records, and stale-token paused
  access. Verify service-role behavior only in trusted server tests.
- [ ] **M2.5 — Acceptance test.** A paused employee with an otherwise valid token cannot
  create, update, submit, delete, upload, invoke an employee mutation RPC, or mutate via
  offline sync except an explicitly documented support action.

**Exit:** the authorization matrix passes against a clean migrated database and an
upgrade-path database; the security owner reviews the policies.

### Milestone 3 — Raw facts, schedules, compensation, and rules

- [ ] **M3.1 — Raw work-fact model.** Preserve employee, date, start/end, breaks, travel,
  return, kilometres, work type/location, evidence, notes, corrections, source device,
  and timestamps. Model correction history instead of overwriting approved facts.
- [ ] **M3.2 — Effective-dated schedules.** Add schedule definitions and employee
  assignments for `standard_8h`, `authorized_10h`, `compressed_4x10`,
  `service_schedule`, and approved special arrangements. Prevent overlapping assignments
  and preserve history.
- [ ] **M3.3 — Effective-dated compensation.** Add employee histories for sector, trade,
  apprentice/compagnon class, appendix, base rate, team-leader premium, kilometre rate,
  storage compensation, other taxable/non-taxable amounts, CCQ rate snapshot, reason,
  and approving manager. Prevent gaps/overlaps according to approved policy.
- [ ] **M3.4 — Rule and CCQ snapshots.** Persist immutable effective-dated source
  snapshots with content hashes and approval metadata. Never resolve historical values
  from the current profile.
- [ ] **M3.5 — Backfill and reconciliation.** Write dry-run reports, deterministic
  backfill tooling, counts/checksums, exception output, resumability, and forward-fix
  procedures. Do not fabricate missing history; flag it for review.

**Exit:** changing today's profile/schedule/rate cannot change historical approved data;
all ambiguous backfill records appear in an exception report.

### Milestone 4 — One week-aware authoritative engine

- [ ] **M4.1 — Versioned input/output contract.** A calculation request identifies an
  employee/week and contains normalized authoritative facts, applicable schedule/rate/
  rule snapshot IDs, timezone, and input hash. Output includes regular, OT50, OT100 and
  other premium minutes, applied rates/premiums, schedule, rule version, trace, warnings,
  errors, calculated time, and engine version.
- [ ] **M4.2 — Normalization and validation.** Sort intervals; validate impossible times,
  overnight boundaries, duplicates, overlaps, multiple jobs, missing schedules/rates,
  and unsupported arrangements. Never double-count minutes.
- [ ] **M4.3 — Weekly classifier.** Resolve date-specific schedules and holidays, process
  daily/weekly accumulators in the specialist-approved ordering, consume allowances, and
  emit a machine-readable explanation for each classified interval.
- [ ] **M4.4 — Server authority.** Implement calculation in a Supabase Edge Function or
  trusted server module. Client calculations are explicitly previews. Authorization,
  database reads, calculation, and snapshot persistence occur server-side.
- [ ] **M4.5 — Consumer migration.** Employee preview, manager review, costing, CCQ JSON,
  Sheets export, period summaries, and audit comparison consume the same versioned result.
  Delete duplicate transformations only after caller and rollback audits.
- [ ] **M4.6 — Test depth.** Run golden fixtures, property/invariant tests (minute
  conservation, order independence after normalization, no negative classifications),
  timezone/DST cases, malformed inputs, and deterministic snapshot/hash tests.

**Exit:** there is one authoritative classification, its output explains every minute,
and unsupported/legal ambiguities block approval rather than defaulting.

### Milestone 5 — Approval, state, costing, and export integrity

- [ ] **M5.1 — Explicit state machines.** Define and enforce transitions such as
  `draft -> locally_saved -> syncing -> saved -> submitted -> approved -> exported`,
  with `rejected`, `returned_for_correction`, `superseded`, `voided`, `export_failed`,
  and `adjustment_required`. Enforce server-side using a transition API/RPC and audit it.
- [ ] **M5.2 — Immutable approval snapshot.** Store input IDs/hash, classified minutes,
  rates and premiums, schedule/rule/CCQ snapshots, calculator version, manager identity,
  approval time, export state, correlation ID, and external deduplication key.
- [ ] **M5.3 — Idempotent approval.** Lock appropriate records/periods and use unique
  constraints so retries return the prior result. Test concurrent calls and partial
  failures. Never infer the manager from a service-role database session; pass and verify
  the authenticated actor.
- [ ] **M5.4 — Controlled recalculation.** Preserve original and proposed snapshots,
  generate a difference report, require reason/reviewer/approval, and create an explicit
  adjustment rather than silently mutating approved periods.
- [ ] **M5.5 — Costing modes.** Separate draft estimate, submitted/unapproved, approved
  payroll basis, pending/approved/rejected expenses, exported, and export-failed states.
  Totals must disclose their included statuses and snapshot source.
- [ ] **M5.6 — Idempotent exports.** Create durable export attempts and outcomes with
  external keys, payload hash, retries, acknowledgements, and reconciliation status.
  Verify no legacy/scheduled/external caller before retiring old paths.

**Exit:** repeated/concurrent approval or export calls cannot duplicate records; every
approved dollar is reproducible and every adjustment preserves its predecessor.

### Milestone 6 — Durable offline field operation

- [ ] **M6.1 — IndexedDB store.** Persist schema-versioned draft payload, attachment
  blobs, local ID, employee ID, created/updated time, sync state, retries, last error,
  server ID, payload hash, and durable idempotency key. Add upgrade/migration tests.
- [ ] **M6.2 — Observable queue.** Display editing, saved on device, waiting, syncing,
  synced, needs attention, and conflict states. Provide a queue/detail screen and retry/
  correction actions. Keep local data until complete server acknowledgement.
- [ ] **M6.3 — Authentication and account changes.** Define behavior for expired tokens,
  logout, employee switching on a shared device, remote pause while offline, revoked
  access, and local-data retention/deletion. Never sync a draft under another identity.
- [ ] **M6.4 — Conflict and duplication policy.** Use the pre-generated submission key,
  hashes, server uniqueness, and explicit conflict outcomes for two-device submissions.
- [ ] **M6.5 — Hostile mobile tests.** Automate browser closure mid-upload, signal loss
  after relational creation, double taps, app update with drafts, expired auth, paused
  employee, two devices, storage success/database failure, and connection flapping.
- [ ] **M6.6 — Honest copy.** Only claim durable on-device saving after persistence,
  recovery, quota/error behavior, and the hostile-condition suite pass.

**Exit:** a draft and attachments survive restart/update; retries are observable and do
not duplicate work; identity and paused-user rules remain enforced by the server.

### Milestone 7 — Atomic submission and reconciliation

- [ ] **M7.1 — Submission API.** Authenticate and authorize one idempotent request that
  creates/validates the job, meal, parking, overtime evidence metadata, manager
  notification, and audit event. Make relational writes transactional.
- [ ] **M7.2 — Evidence state machine.** Document staged/uploaded/verified/attached/
  quarantined/deleted states; validate MIME via file content, size, ownership, path, and
  expected association. Use signed operations and retention rules.
- [ ] **M7.3 — Failure recovery.** Specify compensation for upload failure and relational
  failure. Return retry-safe typed errors and preserve the local draft.
- [ ] **M7.4 — Reconciliation jobs.** Detect orphaned objects, missing evidence, claims
  without jobs, missing notifications, approved jobs without snapshots, and exported
  records without external confirmation. Produce metrics and an operator exception queue.

**Exit:** each submission is complete or recoverable, every retry is idempotent, and
scheduled reconciliation identifies all defined partial states.

### Milestone 8 — Privacy and sensitive data

- [ ] **M8.1 — Data inventory/DPIA.** For each sensitive field document purpose,
  necessity, source, read/write roles, retention, deletion/anonymization, export targets,
  processors, residency, and incident impact.
- [ ] **M8.2 — Isolate NAS/SIN.** Migrate it from general profiles to a restricted vault/
  table. Default to masking, require explicit reveal permission and reason, audit every
  reveal, prohibit bulk browser retrieval, encrypt appropriately, and define retention.
- [ ] **M8.3 — Other sensitive records.** Apply equivalent least-privilege review to CCQ
  cards, dates of birth, compensation, union association, addresses, work-order images,
  evidence, and employment history. Remove sensitive fields from broad `select *` paths.
- [ ] **M8.4 — OCR proxy.** Move OCR behind authenticated infrastructure; validate file
  type/size, remove metadata, crop/redact where feasible, keep provider configuration on
  the server, audit processing, enforce retention, and offer manual entry. Complete a
  provider privacy/residency assessment before production use.
- [ ] **M8.5 — Privacy workflows.** Implement tested access, correction, retention,
  deletion/anonymization, legal-hold, lost-device, and breach-response procedures.

**Exit:** sensitive reads are narrow and audited, client bundles/queries cannot bulk-read
NAS, and retention/deletion behavior has owner approval and tests.

### Milestone 9 — Structured auditability

- [ ] **M9.1 — Append-only audit schema.** Store actor ID/role, validated subject,
  target type/ID, operation, before/after JSON, reason, request/correlation ID, approved
  client/device metadata, server time, rule/rate/snapshot IDs, and outcome. Restrict
  mutation and sensitive contents.
- [ ] **M9.2 — Coverage.** Audit compensation, schedule, classification, appendix/region,
  kilometre rate, premiums, manager edits, approval/reversal, recalculation, exports,
  sensitive reads, evidence deletion, and rule/CCQ snapshots.
- [ ] **M9.3 — Actor integrity.** Edge Functions validate the JWT actor and pass it to
  service-role operations; triggers must not falsely attribute the service role as the
  human. Add impersonation and missing-actor tests.
- [ ] **M9.4 — Audit access and retention.** Define who can search/export audit events,
  redact sensitive payload fields, monitor access, and test retention/integrity checks.

**Exit:** every material change and sensitive reveal has trustworthy actor, reason,
before/after or immutable reference, correlation ID, and server timestamp.

### Milestone 10 — Platform and frontend hardening

- [ ] **M10.1 — Security headers.** Add CSP in report-only mode, collect violations,
  eliminate unsafe dependencies/inline behavior, then enforce. Add `frame-ancestors`,
  `X-Content-Type-Options`, Referrer Policy, Permissions Policy, and deployment-appropriate
  HSTS consistently across Vercel/Render. Test production headers and SPA behavior.
- [ ] **M10.2 — Dependency/secret controls.** Add lockfile audit, dependency update
  policy, secret scanning, SAST where useful, and artifact/SBOM generation.
- [ ] **M10.3 — Domain decomposition.** Move one tested seam at a time into the target
  folders. React owns presentation/input only; server/domain modules own authorization,
  calculation, and workflow invariants.
- [ ] **M10.4 — Employee-profile research.** Interview record maintainers, identify
  frequent/rare tasks, prototype 2–3 layouts, test desktop/mobile/accessibility, record
  the decision, and only then implement. Avoid another unvalidated cosmetic rearrangement.
- [ ] **M10.5 — Accessibility/mobile.** Add keyboard, focus, screen-reader, contrast,
  reduced-motion, touch-target, zoom, responsive, and bilingual layout checks to critical
  flows. Capture screenshots for intentional visual changes.

**Exit:** enforced headers work in deployed environments, critical flows meet the agreed
accessibility bar, and authoritative concerns are absent from presentation components.

### Milestone 11 — CI, observability, recovery, and staged release

- [ ] **M11.1 — Required CI.** Gate on formatting/lint, type checking (introduce
  incrementally if needed), unit/legal fixtures, clean and upgrade migrations, RLS,
  integration, critical E2E, production build, dependency/secret scanning, and bundle
  budget. Pin runtime/tool versions and upload useful failure artifacts without PII.
- [ ] **M11.2 — Correlated observability.** Propagate a correlation ID through client,
  Edge Function, database, audit, and export. Monitor submission/sync/storage/approval/
  export/OCR failures, retries, duplicate prevention, calculation errors, rule versions,
  auth/RLS denials, reconciliation exceptions, and client-version adoption.
- [ ] **M11.3 — Alerting/SLOs.** Define owners, severity, actionable thresholds, runbook
  links, privacy-safe logs, sampling, retention, and alert tests.
- [ ] **M11.4 — Recovery runbooks.** Document and exercise database restore, storage
  recovery, deployment rollback/forward-fix, snapshot restoration, export reconciliation,
  lost device, credential rotation, privacy incident, and data-subject requests. Record
  recovery-point and recovery-time evidence.
- [ ] **M11.5 — Staged releases.** Require local checks, CI, isolated staging database,
  internal manager validation, 1–2 pilot employees, payroll comparison, controlled
  rollout, feature flags/kill switches, and post-release reconciliation.

**Exit:** restore and incident drills have evidence, alerts reach owners, and no payroll
rule is released directly to all employees.

### Milestone 12 — Full payroll engine (conditional, separate program)

Do not begin until the product owner explicitly selects full payroll, legal/payroll
specialists approve the scope, and Milestones 0–11 are operating reliably.

- [ ] **M12.1 — YTD ledger.** Model annual employee balances for pensionable/insurable/
  QPIP earnings, RRQ/QPP and additional tiers, EI, QPIP/RQAP, federal/Québec tax,
  employer contributions, annual maxima consumed, and verified opening balances.
- [ ] **M12.2 — Statutory parameters.** Store tax year, effective dates, exemptions,
  rates, ceilings, employer multipliers, formula/version, primary source, and approval.
  Never hard-code one year's table as timeless behavior.
- [ ] **M12.3 — Payroll controls.** Add pay-period locking, adjustments, reversals,
  remittance reconciliation, segregation of duties, audit, rounding, and year-end flows.
- [ ] **M12.4 — Parallel validation.** Compare several complete periods with established
  payroll software, including annual ceilings, imported opening balances, rate/class
  changes, overtime, holidays, expenses, and corrections. Define tolerances and require
  payroll-specialist sign-off before reliance.

**Exit:** this milestone has its own threat model, legal specification, operational
controls, and signed parallel-run evidence. Until then Sparklog is not payroll software.

## 6. Cross-cutting implementation requirements

### Database and migrations

- Test both a clean database and an upgrade from the latest production-like schema.
- Enable RLS explicitly and avoid permissive-policy surprises: policies for the same
  command combine using OR unless deliberately restrictive.
- Set safe `search_path` on security-definer functions, schema-qualify objects, minimize
  grants, validate arguments, and test anonymous/authenticated/service roles.
- Prefer constraints and unique indexes for invariants and idempotency; application-only
  checks are insufficient under concurrency.
- Every backfill supports dry run, reports exceptions, is resumable/idempotent, and has
  reconciliation queries. Production rollback normally means a forward fix; do not drop
  captured data to reverse a release.

### Edge Functions and APIs

- Validate JWT, role, active state, ownership, input schema, size, state transition, and
  idempotency before using service-role access.
- Return typed, stable error codes safe for user display and retry decisions.
- Add request/correlation IDs; do not log tokens, full OCR text, sensitive profiles, or
  evidence URLs. Timeouts and retries must not create duplicate side effects.

### Calculation correctness

- Preserve raw facts and immutable approved results separately.
- Hash a canonical, documented input representation. Include every value capable of
  changing output; exclude volatile presentation fields.
- Persist IDs and versions for schedule, compensation, rule, holiday, CCQ rate, and
  engine. A trace must account for all input minutes exactly once or reject the input.
- Legal sources and approvals are data, not comments. Tests without specialist approval
  prove code consistency, not legal correctness.

### UI and bilingual behavior

- Add English and French copy together. Do not embed authoritative classification rules
  in translations or components.
- Always distinguish local, syncing, submitted, approved, rejected, and exported status.
- Do not expose PII in notifications, URLs, analytics, logs, error trackers, or screenshots.
- Visible changes require responsive and accessibility review plus before/after evidence.

## 7. Standard pull-request template for each work package

Every PR body must include:

```markdown
## Scope
- Work package ID and the single outcome delivered
- Explicit non-goals

## Risk review
- Authorization/privacy/legal/calculation risks
- Migration, backfill, compatibility, and concurrency risks

## Implementation
- Schema/API/UI changes
- Invariants and idempotency strategy

## Verification
- Exact commands and results
- Identities/scenarios tested
- Screenshots for visible changes

## Deployment
- Prerequisites and secret/config changes
- Migration/function/frontend order
- Feature flag or kill switch
- Reconciliation queries and success metrics

## Recovery
- Roll-forward/rollback procedure
- Data preservation notes

## Human approvals
- Product:
- CCQ/legal (when applicable):
- Payroll (when applicable):
- Security/privacy (when applicable):
- Database/deployment:

## Follow-ups and unresolved risks
- Links to tracked work; never hide incomplete safety work
```

## 8. Required verification gate

Extend scripts/tooling as milestones are implemented. The final target gate is:

```bash
npm ci
npm test
npm run lint
npm run typecheck
npm run build
supabase start
supabase db reset
npm run test:migrations
npm run test:rls
npm run test:integration
npm run test:e2e
npm run scan:secrets
npm audit --audit-level=high
```

If a script does not exist yet, create it in the relevant CI work package rather than
reporting it as passed. Environment limitations may justify a warning locally, but they
do not waive the CI gate for production. Record exact versions and results.

## 9. Definition of done for the full program

Sparklog is top tier only when all of the following are demonstrated, not merely claimed:

- A paused employee is blocked server-side, including stale tokens and queued drafts.
- Retries and concurrency cannot duplicate jobs, evidence, notifications, approvals, or
  exports.
- Offline drafts and attachments survive browser closure and app upgrades.
- Every approved dollar and classified minute can be reproduced and explained.
- New profile values never rewrite historical payroll results.
- Every calculation identifies approved rule, schedule, compensation, CCQ, and engine
  versions; ambiguity stops approval.
- Sensitive-data access is least-privilege, masked where appropriate, and audited.
- Exports are idempotent, acknowledged, monitored, and reconcilable.
- Approved legal fixtures cover all applicable real arrangements and boundary cases.
- Database/storage recovery and incident procedures have been exercised.
- Managers see exactly what is estimated, pending, approved, rejected, exported, or
  failed; employees see exactly what is local, syncing, synced, or needs attention.
- Payroll specialists sign off on parallel comparisons before any result is treated as
  finalized payroll.

## 10. First tasks to execute next

Claude Code should begin with these small, ordered PRs:

1. **Governance PR:** M0.1–M0.4 documentation, ownership placeholders, PR template, and
   complete calculation/export inventory. Do not alter payroll behavior.
2. **Security test harness PR:** M2.1 and disposable Supabase RLS infrastructure; encode
   the current expected access matrix before further policy changes.
3. **Containment follow-up PR:** Fix every failing paused-account and profile-ownership
   case uncovered by direct tests; include clean/upgrade migration verification.
4. **Rule-specification PR:** M1.1 schema/docs and draft golden-fixture format, without
   inventing expected legal outcomes.
5. **Historical-data foundation PRs:** M3 schedules, compensation, snapshots, dry-run
   backfill, and exception reports in separately reviewable increments.
6. Continue milestone-by-milestone only after each exit criterion and human gate is met.

This ordering deliberately puts evidence, authorization, and validated rule ownership
before a new calculator, offline queue, visual redesign, or full-payroll feature.
