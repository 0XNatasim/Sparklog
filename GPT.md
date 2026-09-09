# Sparklog Source-Level Employee and Manager Audit

**Audit date:** 2026-09-09

**Scope:** Raw execution paths in `src`, Supabase Edge Functions, SQL migrations, and tests.

**Status:** Living audit. Resolved findings are marked with their implementation and verification evidence; all other entries remain recommendations.

## Executive summary

Sparklog has useful server-side protections: employees are restricted to their own jobs, privileged job fields are trigger-protected, paused employees are blocked from the main write paths, and approval Edge Functions independently verify the caller's manager role. Those controls prevent straightforward employee self-approval and peer-record access.

The highest-priority production defects are nevertheless concrete and workflow-affecting:

1. The single-job approval client force-approves any job reported as skipped, even when the server skipped it because its state changed and it was not exported.
2. Cost reports combine draft, submitted, approved, pending, rejected, and current-rate data into one total.
3. Job creation and submission lack a durable idempotency key, and direct API clients can insert an incomplete job directly as submitted.
4. Opening the employee-management panel can overwrite compensation fields for many employees.
5. Attachment, claim, notification, approval, and export workflows are multi-step and can leave partial or ambiguous states.

The repository does not implement clock-in, clock-out, or break buttons. The closest applicable race analysis is therefore the manual Save/Submit workflow.

---

## 1. Critical and high-priority correctness defects

### 1.1 Resolved — Overnight duration differed between employee and payroll paths

Previously, `src/lib/time.js` calculated a Day.js difference and returned zero for any non-positive result:

```js
const diffMinutes = e.diff(s, "minute");
if (diffMinutes <= 0) return 0;
```

`src/lib/payroll-calculations.js` interprets a negative difference as crossing midnight:

```js
let minutes = endHour * 60 + endMinute - (startHour * 60 + startMinute);
if (minutes < 0) minutes += 24 * 60;
```

#### Reproduction

1. Enter `depart = 22:00` and `fin = 06:00`.
2. Observe zero hours in the employee form, History, and Live Crew.
3. Observe eight hours in manager timecard cards and payroll/export calculations.

#### Impact

- Employee and manager surfaces disagree about the same job.
- Overtime-evidence calculations use the zero-duration implementation and may not request mandatory evidence.
- The daily-minute accumulator used for automatic meal eligibility may remain zero.
- An accidentally reversed OCR time can alternatively become an implausibly long overnight shift in the payroll path.

#### Resolution

`hoursBetween()` now validates its Day.js inputs and delegates duration calculation to the payroll engine's `minutesBetween()` function. Employee Form, History, Live Crew, and Meal Claims therefore use the same overnight convention as manager timecards and payroll classification.

Unit tests cover same-day, overnight, equal-time, missing, and invalid inputs. The overnight regression specifically asserts that `22:00 -> 06:00` produces eight hours.

Explicit overnight confirmation, maximum-duration enforcement, and server-side rejection of ambiguous intervals remain tracked under section 1.3; this resolution removes the client/payroll disagreement without claiming those broader validation controls are complete.

---

### 1.2 P0 — Skipped single-job approval can become approved without export

The batch Edge Function uses one `skipped` count for jobs that are either no longer submitted or already exported. The single-job client then treats any positive skipped count as permission to directly write:

```js
{ status: "approved", locked: true }
```

That fallback does not export the job or set export metadata.

#### Reproduction

1. Manager A loads a submitted job.
2. Manager B unlocks or changes the job, leaving Manager A with stale UI.
3. Manager A clicks Approve.
4. The Edge Function correctly skips the no-longer-submitted job.
5. Manager A's client sees `skipped > 0` and force-approves it locally.

Employees cannot normally edit a submitted job directly because it is locked by RLS. The reachable race is a stale manager view, a concurrent manager action, or another trusted process changing state.

#### Impact

- The database says approved while the payroll sheet has no corresponding export.
- The manager may approve facts different from those originally reviewed.
- The UI reports a successful skipped approval rather than a conflict.

#### Required remediation

- Remove the client-side force-approval fallback.
- Return a typed per-job result such as `exported`, `already_exported`, `state_changed`, `already_claimed`, or `not_found`.
- Reload and require re-review for every state-changing outcome.
- Keep approval transitions inside an authorized server RPC/Edge workflow.

---

### 1.3 P0 — Submitted jobs can contain invalid or incomplete time facts

The `jobs` table permits null `depart`, `arrivee`, and `fin` fields and has no chronology, duration, or overlap constraint. Current RLS also permits an active employee to insert a row directly as `status = 'submitted'` and `locked = true`.

#### Reproduction

Using an employee token, insert an owned job containing null times or equal start/end times, with submitted/locked state. The UI's `formComplete` check is bypassed, and approval eligibility checks only submission/export state.

#### Impact

- Forged clients bypass all browser validation.
- Zero-hour or missing-time rows can be exported.
- Overlapping jobs are summed and can inflate work and overtime.
- Unsupported intervals become warnings rather than approval blockers.

#### Required remediation

- Allow direct employee inserts only as saved, unlocked drafts.
- Submit through a server-side transition RPC.
- Lock the employee/day while checking overlaps.
- Reject missing, zero, excessive, malformed, or ambiguous intervals.
- Reject approval whenever authoritative classification returns blocking warnings.

---

### 1.4 P0 — Costing combines incompatible states and mutable current rates

`CostingDashboard` applies date filters but no status filters to jobs, meals, or parking. It sums every returned amount and calculates all historical labor from the employee's current profile rate and premium.

#### Reproduction

1. Create one draft job and one approved job in the same period.
2. Create an approved expense and a rejected expense.
3. Open Costing; all records contribute.
4. Change the employee's current rate and reopen the period; historical totals change.

#### Impact

- Draft work and rejected expenses inflate totals.
- Submitted estimates are indistinguishable from approved basis.
- Historical costs are not reproducible.
- Manager reports cannot reconcile to approval or export.

#### Required remediation

Report separate buckets for draft estimates, submitted work, approved snapshots, pending/approved/rejected expenses, exported work, and failed/unknown exports. Historical approved totals must come from immutable snapshots with effective-dated compensation, not current profiles.

---

### 1.5 P1 — Duplicate jobs are possible after timeout, retry, or rapid submission

The jobs table has no submission idempotency key. `withTimeout()` races the client promise but does not cancel the underlying database request. An insert can commit after the browser reports a timeout; retrying creates a second job. React's `saving` state improves UI behavior but is not a synchronous or durable concurrency control.

The existing friendly `23505` duplicate-OT message is not backed by a job uniqueness constraint.

#### Required remediation

Do not assume `(user_id, job_date, ot)` is unique without confirming the business rule; an employee may legitimately have multiple intervals for one work order. Instead:

```sql
alter table public.jobs add column submission_key uuid;
create unique index jobs_user_submission_key_uniq
  on public.jobs (user_id, submission_key)
  where submission_key is not null;
```

Generate and persist the key before the first request, reuse it for every retry, and return the prior result when the key already exists. A synchronous ref guard may suppress double taps, but database idempotency is still mandatory.

---

### 1.6 P1 — Submission and attachment workflows are non-atomic

Job save, parking upload, receipt metadata, evidence upload, evidence metadata, meal claims, capture flags, and manager notifications are separate operations. Storage uploads can precede relational records, and notification failure is sometimes explicitly non-fatal.

#### Failure states

- orphaned evidence or receipt objects;
- job capture flag set without matching metadata;
- metadata inserted without notification;
- meal claim inserted without job flag;
- submitted job missing requested expense/evidence;
- ambiguous retry behavior after browser closure.

#### Required remediation

Use a staged attachment state machine and one idempotent server submission API. Make relational writes transactional, preserve local drafts until acknowledgement, and add scheduled reconciliation for orphaned objects and incomplete submissions.

---

### 1.7 P1 — Loading EmployeesPanel mutates employee compensation

`EmployeesPanel.load()` compares each profile against fetched CCQ rates and issues a profile update for every mismatch. Merely opening the panel can therefore overwrite `hourly_rate` and `wage_schedule` for many employees.

#### Impact

- N writes for N mismatched employees;
- write contention and realtime churn;
- current profile compensation silently replaces manager intent;
- historical costing changes because Costing reads current rates;
- loading a view has material side effects.

#### Required remediation

Never mutate compensation during a read/render path. Present a dry-run comparison, require an explicit authorized batch action, preserve effective dates and history, and perform the accepted changes in one audited server operation.

---

### 1.8 P1 — Login profile synchronization sends an invalid role value

`Login.ensureProfile()` upserts `role: "Employee"`, while the schema permits only lowercase `employee` or `manager`. Current profile-write containment also excludes role from employee-owned fields. The operation can fail and silently drop the accompanying phone/email/name synchronization because the UI only logs a console warning.

#### Required remediation

Never send role from the browser. Let the auth trigger initialize the lowercase role and expose profile-sync failures to the user through a retryable, typed error.

---

## 2. Approval, concurrency, and audit integrity

### 2.1 Atomic claim mitigates duplicate sheet rows but does not complete the workflow

The approval Edge Function conditionally updates only submitted, unexported rows. The companion Apps Script locks execution and deduplicates by job ID. These are valuable protections against concurrent duplicate exports.

They do not provide complete end-to-end consistency because:

- the initial read and claim are separate operations;
- the claim has no reviewed row version or input hash;
- there is no immutable approval snapshot;
- broad manager updates can still mutate workflow-controlled fields;
- the external export is outside the database transaction;
- a timeout can occur after the external system commits;
- claim rollback does not compare the current row version;
- skipped outcomes are ambiguous;
- no durable export-attempt record supports reconciliation.

#### Required remediation

Create an approval RPC that locks rows, compares the reviewed input hash, computes authoritative results, persists immutable snapshots, records the actor, and creates durable export attempts. External timeouts must become `unknown/reconcile`, not assumed failures.

### 2.2 Approval audit actor can be null

The Edge Function updates jobs through a service-role client. The job-approval audit trigger records `auth.uid()`, which is null under the service role, even though the function already knows the authenticated manager's `approverId`.

#### Required remediation

Write the audit row inside the approval transaction using an explicitly verified actor. Include request ID, snapshot ID, input hash, before/after state, and outcome. Never trust an unverified actor ID supplied by a client.

### 2.3 Manager updates lack a server-enforced state machine

Manager RLS broadly permits updates to all jobs. UI controls hide some transitions, but a forged manager request can change ownership, approved facts, locked state, status, or export metadata without a correction workflow.

#### Required remediation

Revoke direct mutation of workflow-controlled fields and expose narrow operations such as:

- `return_job_for_correction`;
- `approve_jobs`;
- `void_approval`;
- `create_adjustment`;
- `review_meal_claim`;
- `review_parking_claim`.

Concurrent review updates must include an expected state/version so that the first valid transition wins and later requests receive an explicit conflict.

---

## 3. RBAC, privacy, and resilience

### 3.1 Controls verified as positive

- Employees can read their own jobs, while managers receive all-job access.
- Employees cannot set approval/export fields because database triggers protect them.
- Paused employees are blocked from the primary job, claim, notification, and storage write paths.
- Approval and announcement Edge Functions authenticate the bearer token and re-check manager role server-side.
- Employee NAS is no longer present in the broad profiles table after migration `0026`.

These controls should still be validated with direct multi-identity integration tests against the final migrated schema and real storage policies.

### 3.2 NAS vault access remains too broad for privileged identities

NAS is isolated in `employee_sensitive`, which is an improvement. However, privilege is granted to two hardcoded user UUIDs rather than a revocable permission model. Those users can select the vault directly and bulk-read values without going through the audited `reveal_nas` RPC; `CcqJsonExport` does exactly that.

This is not leakage to every manager or employee. It is a concentrated bulk-exfiltration risk for the two trusted accounts.

#### Required remediation

- Replace hardcoded identities with revocable, active-role-aware permissions.
- Revoke direct browser SELECT on NAS values.
- Generate sensitive exports server-side under a distinct `nas_export` permission.
- Require a purpose/reason and audit each reveal/export.
- Mask values by default and rate-limit sensitive operations.

### 3.3 OCR sends screenshots to a third party without adequate controls

Overtime screenshots are sent to `ocr.space`. The server path does not validate content magic bytes, impose an explicit code-level size limit, remove metadata, crop/redact unrelated content, or document provider retention/residency. Full extracted text may be retained.

#### Required remediation

Validate and re-encode files server-side, enforce strict size/dimension limits, strip metadata, minimize the image region and stored OCR text, add privacy audit events, and complete a provider privacy/retention review.

### 3.4 No error boundary protects critical views

Authentication guards are not render error boundaries. An unexpected exception in EmployeeForm, History, Week, or ManagerDashboard can blank the application and discard memory-only drafts.

#### Required remediation

Add application- and workflow-level error boundaries with privacy-safe correlation IDs and recovery actions. Durable local drafts must survive the error and reload.

### 3.5 Wildcard CORS is low-value hardening, not a primary vulnerability

Approval functions permit `Access-Control-Allow-Origin: *`, but they require and validate bearer tokens. Restricting origins may reduce casual browser invocation but does not protect a stolen token or non-browser caller. Prioritize CSP/XSS prevention, short-lived sessions, reauthentication for sensitive operations, rate monitoring, and audit correlation.

---

## 4. Performance and latency risks

### 4.1 Unbounded manager review queries

Manager notification paths fetch all overtime evidence, parking receipts, and meal claims, then issue related `.in(ids)` queries for jobs and profiles. The standalone meal manager also loads its entire table. This grows with company history and can hit payload, URL, row-cap, memory, and render limits.

Use narrow joined views/RPCs, pending/recent predicates, cursor pagination, and covering/partial indexes on review status and creation time.

### 4.2 Offset pagination over mutable ordering

The main manager list sorts by `job_date` and `updated_at`, then loads more by numeric offset. If a row changes between page requests, it can move across the offset boundary and be skipped or duplicated.

Use deterministic keyset pagination ordered by `(job_date desc, updated_at desc, id desc)`.

### 4.3 Four count queries per filter change

Each manager load issues separate exact counts for all, saved, submitted, and approved jobs. Replace them with one conditional-aggregate RPC or return summary metadata with the page.

### 4.4 Unbounded employee History and Week data

History and Week fetch an employee's complete job history and recalculate all periods in the browser. Default to recent weeks, load older periods by cursor, and consume immutable server snapshots for approved history.

### 4.5 Live Crew reloads the roster every 30 seconds

The Live Crew poll fetches all profiles, today's jobs, and current time off every 30 seconds. Cache the roster, subscribe to relevant realtime changes, pause polling while hidden, prevent overlapping requests, and retain low-frequency polling only as reconciliation.

### 4.6 Client-side costing joins full datasets

Costing downloads profiles, jobs, meals, and parking rows and joins/calculates them in the browser. Move status policy, effective compensation lookup, and approved snapshot aggregation to one authorized server endpoint.

### 4.7 Batch approval performs an Auth Admin request per employee

The Edge Function calls `admin.auth.admin.getUserById()` once for each distinct employee in a batch. This is an N+1 external/auth pattern. Use a trusted server-side source that can retrieve the required emails in one operation, or avoid exporting unnecessary contact data.

### 4.8 Main application is not route-split

All pages are eagerly imported, so employees download manager-only dashboard and testing code. Lazy-load routes and split large vendor surfaces such as OCR, MUI/date pickers, Supabase, and manager reporting.

### 4.9 Large unmemoized lists are secondary to query control

Manager card renderers live inside the parent and all visible cards rerender with parent state. Extracting stable `React.memo` cards can help after pagination and state decomposition. Query bounding, virtualization, and route splitting have higher expected impact than merely wrapping callbacks in `useCallback`.

---

## 5. Edge-case matrix

| Persona | Scenario | Current behavior | Expected behavior | Recommended patch |
|---|---|---|---|---|
| Employee | `22:00 -> 06:00` overnight | Resolved: employee and payroll paths now both return 8h | One consistent result everywhere | Completed by delegating `hoursBetween()` to `minutesBetween()`; explicit overnight confirmation remains follow-up validation |
| Employee | Equal start/end | Zero minutes may be submitted/exported | Reject zero duration | Server submission and approval validation |
| Employee | Reversed OCR times | Employee path may show 0; payroll path may infer a long overnight | Require confirmation or correction | Bounds and overnight confirmation |
| Employee | Overlapping jobs | Every interval is summed | Reject or require review | Transactional overlap validation |
| Employee | Direct crafted insert | Can start submitted/locked and bypass UI checks | Draft-only insert; validated transition | Submission RPC and narrower RLS |
| Employee | Slow insert, client timeout, retry | First insert may commit; retry creates another | One logical submission | Durable idempotency key |
| Employee | Rapid repeated submit | React state is not a database concurrency control | Subsequent attempt returns original result | Synchronous UX guard plus server uniqueness |
| Employee | Offline edit and reload | Memory-only draft is lost | Draft and attachments restored | IndexedDB queue bound to identity |
| Employee | Upload succeeds, row insert fails | Orphaned storage object | Recoverable staged upload | Evidence state machine and reconciliation |
| Employee | Midnight in UTC but prior day in Montréal | Device-local default date can disagree with company date | Company timezone determines work date | Shared timezone-aware date service |
| Employee | DST ambiguity | Date/time facts contain no offset/fold semantics | Ambiguity rejected or explicit | Normalized instants plus approved timezone policy |
| Employee | Returning profile sync | Uppercase role can reject the entire upsert | Role untouched; profile fields saved | Remove role from client payload |
| Employee | Paused stale token | Primary current write policies check active database state | All writes remain blocked | Complete direct RLS/storage/RPC test matrix |
| Manager | Stale single-job approval | Skipped job can be force-approved without export | State-change conflict and re-review | Remove client fallback; typed result |
| Manager | Two simultaneous approval claims | Conditional claim and sheet dedup reduce duplicate rows | One immutable approval, explicit loser result | Snapshot/hash/attempt workflow |
| Manager | Edit during export | No reviewed-version hash or immutable snapshot | Export exact reviewed version | Row lock, expected hash, snapshot |
| Manager | External commit then timeout | Claim may be reverted into ambiguous state | Mark unknown and reconcile | Durable export attempts and receipts |
| Manager | Two meal/parking reviews | Last writer can win | First valid transition wins; conflict returned | Expected-status review RPC |
| Manager | Change current rate | Historical Costing changes | Approved history remains stable | Effective-dated compensation snapshots |
| Manager | Rejected expense | Included in Costing | Excluded from payable totals | Status-scoped aggregation |
| Manager | Open EmployeesPanel | May update rates for many employees | Read path has no writes | Explicit reviewed batch action |
| Manager | Months of notifications | Full-table reads and large `.in()` queries | Cursor-paginated review queue | Joined server endpoint and indexes |
| Manager | Load next page during edits | Offset page can skip/duplicate rows | Stable cursor result | Keyset pagination |
| Manager | Sensitive export | Two hardcoded identities can bulk-read NAS | Revocable permission and audited server export | Remove direct vault SELECT |
| Both | HTTP 401/403/500 | Mostly generic errors; no durable retry queue | Typed retry and reauthentication policy | Shared API adapter and observable queue |
| Both | Render exception | No route error boundary | Safe recovery without draft loss | Error boundaries plus durable drafts |
| Both | Clock-in/out/break race | Feature does not exist | If added, server owns transitions/timestamps | Unique active-clock constraint and RPCs |

---

## 6. Correctly prioritized remediation plan

1. Remove the skipped-job force-approval fallback.
2. Add explicit overnight confirmation and block malformed, zero, excessive, and overlapping jobs at submission and approval.
3. Add durable per-submission idempotency.
4. Separate Costing by status and stop using current rates for historical approved work.
5. Remove compensation writes from EmployeesPanel loading.
6. Make job/evidence/expense/notification submission atomic or explicitly recoverable.
7. Persist immutable approval snapshots and durable export attempts.
8. Repair actor attribution for service-role approval audits.
9. Replace broad manager updates with server-enforced state transitions.
10. Remove client-supplied role from profile synchronization.
11. Add cursor pagination and query bounds to manager and employee history surfaces.
12. Implement an identity-bound IndexedDB offline queue with attachment support.
13. Replace hardcoded NAS identities and direct bulk browser access.
14. Add error boundaries, route splitting, dependency gates, and hostile-condition integration tests.

## 7. Verification gaps

Existing unit tests validate calculation and export helpers, but they do not establish the safety of the end-to-end employee/manager workflows described above. Required coverage includes:

- direct multi-identity RLS and storage tests against the final migration state;
- overnight, DST, zero, excessive, malformed, duplicate, and overlapping intervals;
- browser closure and network loss at every submission step;
- timeout-after-commit idempotency;
- two-manager stale review, approval, and expense-review races;
- external export success with lost response;
- immutable snapshot reproducibility after rate/profile changes;
- manager payload and render tests with 100+ employees and long history;
- expired tokens, remote pause, shared-device user changes, and queued drafts;
- error-boundary recovery without losing local data.

Until these fixes and tests exist, Sparklog should be treated as a time-entry and estimate tool whose approvals and calculated values require payroll review, not as finalized payroll authority.
