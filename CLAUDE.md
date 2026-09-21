# Sparklog — Code Audit & Remediation Tracker

> Working document for the Employee/Manager workflow audit. Every finding below was
> verified against the source at the cited `file:line`. Use this to track fixes.
> Two independent source-level audits (Claude + the former `GPT.md`, 2026-09-09) were
> merged and de-duplicated here; `GPT.md` has since been deleted — this is the single
> tracker. Severities were recalibrated against what is actually exploitable today vs.
> desirable redesign. See §5 for the GPT-only nuances folded in.

**Stack:** React 18 + Vite PWA, Supabase (Postgres + RLS + Edge Functions), payroll
export to Google Apps Script. Roles: `employee` / `manager` (stored lowercase).
**Branch for fixes:** `claude/gracious-gauss-vnomoq`.

**What is already solid (do not "fix"):**
- RLS is comprehensive; `get_my_role()` / `is_active_employee()` are `security definer`.
- Employees read only their own `profiles` row and own `jobs` (no peer PII/pay leakage).
- Privileged profile fields protected by a **whitelist** trigger (`0018:14-44`), not a blacklist.
- Export/approval columns trigger-protected (`0011:31-57`); paused accounts write-contained (`0018`).
- `push_approved_batch` re-checks manager role server-side and does an **atomic claim** to prevent double-export (`index.ts:104,145-164`).
- NAS/SIN moved out of `profiles` into the RLS-gated `employee_sensitive` vault (`0026`).

---

## Priority Tier (fix in this order)

| # | ID | Severity | Title | Anchor |
|---|----|----------|-------|--------|
| — | C-1 | ✅ Resolved | Overnight shifts compute 0h in employee views (client/server duration split) | `time.js:14-24` |
| — | C-2 | ✅ Resolved | Manager approve force-locks job as approved WITHOUT export on `skipped` | `ManagerDashboard.jsx:608-627` |
| 3 | C-4 | Critical | Costing dashboard mixes all statuses + recomputes with current rates | `CostingDashboard.jsx:42-44,63` |
| 4 | C-3 | High | Duplicate jobs: no unique constraint + timeout-retry + direct-submit bypass | schema `0000:193-216`, `EmployeeForm.jsx`, `0018:57-59` |
| — | P-6 | ✅ Resolved | EmployeesPanel writes pay rates as a side effect of loading | `EmployeesPanel.jsx:108-119` |
| 6 | C-5 | High | No DB validity constraints on the time interval (null/zero/overlap) | `0000:198-200` |
| 7 | S-3 | High | Approval audit actor is null (service-role write vs `auth.uid()` trigger) | `push_approved_batch/index.ts:97,145` + `0015` |

---

## 1. Critical / Blocking Bugs

### C-1 — Overnight (midnight-crossing) shifts compute 0h in every employee-facing view
- **Files:** `src/lib/time.js:14-24` (root cause) vs `src/lib/payroll-calculations.js:9-17` (authority).
- **Cause:** `hoursBetween` returns `0` when `diffMinutes <= 0`; the payroll `minutesBetween` wraps
  past midnight (`if (minutes < 0) minutes += 1440`). The two disagree.
- **Broken consumers:** `EmployeeForm.jsx:181` (hours label), `:546` (`workedMinutes` in overtime check),
  `History.jsx:98,268`, `MealClaimsManager.jsx:68`, `LiveCrew.jsx:92,116`.
  Correct (uses `minutesBetween`): `ManagerDashboard.jsx:691,799` + payroll export.
- **Impact:**
  1. Employee/manager see different totals for the same timecard (0h vs 8h).
  2. `requiresOvertimeEvidence` (`EmployeeForm.jsx:528-564`) gets `thisMinutes=0` → the mandatory
     8h overtime-authorization screenshot is **never requested** for an overnight shift.
  3. `overtimeDailyMinutes=0` → `isMealEligible` → supper claim never auto-created for night crews.
- **Repro:** log Départ 22:00 / Fin 06:00 → form shows `0h00`; manager timesheet + export show 8h.
- **Fix:** make `hoursBetween` delegate to `minutesBetween` so there is one wrapping source of truth.
- **Status:** ✅ **Resolved.** `src/lib/time.js:15-24` now validates its Day.js inputs and delegates the
  duration to `minutesBetween()`, so EmployeeForm / History / Live Crew / Meal Claims use the same
  midnight-wrapping convention as manager timecards + payroll. (Explicit overnight confirmation +
  max-duration + server-side rejection of ambiguous intervals remain under C-5.)

### C-2 — Manager `approve()` locks a job "approved" but never exports it, on `skipped`
- **File:** `src/pages/ManagerDashboard.jsx:575-578`.
- **Cause:** the edge fn returns `skipped>0` for BOTH already-exported AND no-longer-`submitted`
  jobs (`index.ts:119-124`). The client can't tell them apart yet runs
  `update({status:'approved', locked:true})` locally.
- **Impact:** an employee edits a submitted job (→ `updated`) as the manager approves; the fn skips it,
  the client force-approves+locks it, and it is **never written to the payroll sheet** → silent payroll
  omission of freshly-changed, unreviewed data.
- **Fix:** trust the fn's atomic result; on `exported===0` do NOT force-approve — reload and surface
  "job changed, re-review". Only treat already-exported as benign.
- **Status:** ✅ **Resolved.** `push_approved_batch` now returns a **typed per-job `results[]`**
  (`exported | already_exported | state_changed | already_claimed | not_found`); deployed as v16.
  `ManagerDashboard.approve()` **removed the client force-approve** — it only marks a job approved on
  `exported`/`already_exported`, and on `state_changed`/`already_claimed`/`not_found` it reloads and
  shows `manager.errors.jobChangedReReview` instead. A stale/edited job can no longer be locked
  "approved" without an export. (Optimistic-concurrency version/hash on the reviewed row remains the
  broader S-4 redesign.)

### C-4 — Costing dashboard combines incompatible statuses and uses current rates
- **File:** `src/components/CostingDashboard.jsx:42-44` (jobs/meal/parking queries have a date range
  but **no status filter**), `:63,68` (labor from current `profile.hourly_rate` / `km_rate`).
- **Impact:** drafts + submitted + approved jobs and pending/rejected/approved claims are summed
  indiscriminately; rejected expenses inflate totals; changing an employee's rate rewrites historical
  cost; report cannot reconcile to an approval/export.
- **Fix (min):** `.in("status", ["submitted","approved"])` for jobs, `.in("status", ["pending","approved"])`
  for claims; present separate totals per status bucket. **Durable:** report from approval snapshots +
  effective-dated rates.
- **Status:** ☐ open

### C-3 — Duplicate job entries (no uniqueness + timeout-retry + direct submit)
- **Files:** schema `supabase/migrations/0000_baseline_schema.sql:193-216` (indexes only, **no unique key**
  on `(user_id, job_date, ot)`); `EmployeeForm.jsx:333` (async `saving` guard), `:435-438` (the friendly
  duplicate-OT handler maps Postgres `23505` that **nothing can raise** → dead code); `utils.js:13-23`
  (`withTimeout` rejects while the insert may still commit); RLS `0018:57-59` allows a crafted API call to
  insert `status='submitted', locked=true` directly, bypassing all client validation.
- **Impact:** duplicate timecards → inflated payroll/OT/meal claims; forged submitted rows.
- **Fix:** ~~add partial unique index `(user_id, job_date, ot)`~~ — the second audit (GPT) flags that
  `(user_id, job_date, ot)` may **not** be a safe business key: an employee can legitimately log several
  intervals for one day/work order. Prefer a dedicated **`submission_key uuid`** with a partial unique
  index `(user_id, submission_key) where submission_key is not null`, generated + persisted **before** the
  first request and reused on every retry (return the prior row when the key already exists). Keep the
  client `forcedId` path + a synchronous ref guard for double-taps, but DB idempotency is the real fix.
  Restrict the employee insert policy to `status='saved'` and route submission through a validating RPC.
- **Status:** ☐ open

### C-5 — No DB-level validity constraint on the work interval
- **File:** `0000:198-200` — `depart/arrivee/fin` nullable `time`, no chronology/duration/overlap check.
- **Impact:** zero-hour and incomplete jobs can be submitted and approved; overlapping jobs double-count.
- **Fix:** validating `submit_job` RPC (lock row, require all three times, bound duration to ≤16h, reject
  overlap) + block direct submitted inserts. Ties into C-3.
- **Status:** ☐ open

---

## 2. Performance & Latency

| ID | Finding | Anchor | Fix |
|----|---------|--------|-----|
| P-1 | No route-splitting; employees download manager code; ~784 kB bundle | `App.jsx:7-13` | `React.lazy` + `Suspense`; vendor chunks |
| P-2 | Notifications panel does unbounded full-table reads | `ManagerDashboard.jsx:237-239,301-304,347-349` | date/status window + `.limit()` + indexes |
| P-3 | 4 exact-count queries per filter change | `ManagerDashboard.jsx:117-146` | single RPC with `count(*) filter (where …)` |
| P-4 | Employee History/Week fetch all-time jobs | `History.jsx`, `Week.jsx` | default 8–12 weeks + cursor paging |
| P-5 | Costing does full client-side joins/aggregation | `CostingDashboard.jsx` | server aggregation endpoint |
| ~~P-6~~ | ✅ **Resolved** — load is read-only; rate mismatches are a dry-run banner + explicit `applyRateSuggestions` batch | `EmployeesPanel.jsx:108-119` | done |
| P-7 | LiveCrew polls roster every 30s | `LiveCrew.jsx` | cache roster; realtime; pause when hidden; abort in-flight |
| P-8 | Missing review indexes on `created_at`/status | `overtime_evidence`, `parking_receipts`, `meal_claims` | partial indexes |
| P-9 | Offset pagination over mutable `updated_at` sort skips/dupes | `ManagerDashboard.jsx:178-180` | keyset pagination on `(job_date, id)` |
| P-10 | Card renderers recreated each render; lists unmemoized | `ManagerDashboard.jsx:685,793` | `React.memo` card + `useCallback` handlers |
| P-11 | Batch approval calls Auth Admin `getUserById` once per employee (N+1) | `push_approved_batch/index.ts` | one bulk lookup, or avoid exporting contact data (from GPT audit 4.7) |

---

## 3. RBAC & Security

### S-3 — Approval audit actor is null — HIGH
- `push_approved_batch/index.ts:97,145` updates via the **service-role** client; the `audit_job_status`
  trigger (`0015`) records `auth.uid()`, which is null for service-role → the approving manager is lost.
- **Fix:** write the audit row inside a `submit`/`approve` RPC that receives and JWT-verifies the actor id.
- **Status:** ☐ open

### S-2 — Privileged NAS access bypasses the audited reveal — MEDIUM (scoped)
- **Update (2026-09):** the "2 **hardcoded** UUIDs" part is now **outdated** — `is_privileged()` is
  **role-based** (`owner`) since migrations `0043`+ (see `src/lib/roles.js` `isPrivileged`); the old
  `boss.js` id list is gone. So privilege is now revocable by changing a role. The **residual** concern
  still stands: a privileged (owner) account can `select * from employee_sensitive` directly from the
  browser (`CcqJsonExport.jsx`) and bulk-read NAS **un-audited**, bypassing the per-reveal `reveal_nas`.
- Note: the older "NAS leaks via broad `profiles` select" concern is **stale** — column dropped in `0026:34`.
- **Fix (remaining):** no direct vault SELECT in the browser; generate sensitive exports server-side under
  a distinct permission; require a purpose/reason and audit each bulk access; mask + rate-limit. Low
  practical risk (few trusted accounts) but weak model.
- **Status:** ☐ open (partially addressed — privilege is now role-based/revocable)

### S-4 — Manager job updates have no state-transition allowlist — MEDIUM
- `0000:451` manager update policy is unconditional (not narrowed by later migrations). A forged manager
  request can rewrite approved facts, revert state, or change ownership/export metadata.
- **Fix:** replace broad update grant with specific RPCs (`return_job_for_correction`, `approve_jobs`,
  `void_approval`, `review_meal_claim`, `review_parking_claim`) enforcing legal transitions with row locks.
- **Status:** ☐ open

### S-1 — Role-casing breaks returning-employee profile upsert — LOW
- `Login.jsx:72` upserts `role:'Employee'`; the `0018` whitelist trigger raises on any non-whitelisted
  field change (role not whitelisted), silently rejecting the whole upsert (incl. phone/email) for a
  returning signup. Not an escalation — `handle_new_user` already owns the row.
- **Fix:** never send `role` from the client; standardize lowercase.
- **Status:** ✅ **Resolved.** `Login.ensureProfile()` no longer sends `role` — it syncs only the
  whitelisted `full_name`/`phone`/`email`, so the `0018` trigger no longer rejects the upsert; the DB
  trigger owns the lowercase role. (The sync error is still only `console.warn` — surfacing a typed,
  retryable error to the user remains an optional robustness follow-up.)

### S-6 — OCR sends evidence to a third party with no content controls — MEDIUM
- `EmployeeForm.jsx:759-792` posts the screenshot to `api.ocr.space`; no magic-byte/size validation,
  metadata stripping, or crop; full OCR text may be retained.
- **Fix:** validate/re-encode/crop server-side; document provider residency/retention; avoid storing raw OCR text.
- **Status:** ☐ open

### S-7 — No React error boundaries — MEDIUM
- No boundary in `App.jsx`/`ProtectedRoute`; one render exception blanks the app and discards in-memory work.
- **Fix:** top-level + per-route boundaries with safe recovery, preserving any local draft.
- **Status:** ☐ open

### S-3b / robustness — Non-atomic employee submission — MEDIUM
- `EmployeeForm.jsx:449-474,634-712`: storage upload precedes the row insert; a mid-sequence failure orphans
  the object or flags a job as having evidence with no metadata; manager notification insert is best-effort.
- **Fix:** idempotent `submit_job` edge function doing job + claims + evidence + notification in one txn;
  stage attachments; reconcile orphans.
- **Status:** ☐ open

---

## 4. Edge Case Matrix

| Persona | Scenario | Found Behavior | Expected | Patch |
|---|---|---|---|---|
| Employee | Overnight shift 22:00→06:00 | Form/History show 0h; no OT evidence prompt; no meal claim | 8h counted; prompts fire | C-1 |
| Employee | Slow-network Save then retry | Insert may commit yet timeout → duplicate job | Idempotent single row | C-3 |
| Employee | Rapid double-tap Save | Stale `saving` closure allows 2 inserts | 2nd ignored | C-3 |
| Employee | Direct API submit (`status=submitted`) | RLS allows it, bypassing client validation | Server-validated transition only | C-3/C-5 |
| Employee | Zero/equal times | Submittable; engine only warns | Rejected | C-5 |
| Employee | Overlapping jobs | Summed, not detected | Rejected/flagged | C-5 |
| Employee | Offline Save, then reload | Draft lost (memory only) | Durable on-device draft | C-8 (offline, below) |
| Employee | Dropped conn after upload | Orphaned object / flagged job w/o metadata | Atomic or queued | S-3b |
| Employee | Edit submitted job as manager approves | Manager exports stale in-memory version; or force-approve-no-export | Approval targets reviewed version | C-2 + optimistic concurrency |
| Employee | Returning signup | ✅ role no longer sent from client; contact fields sync cleanly | Clean update | S-1 (done) |
| Employee | Company tz ≠ America/Toronto near midnight | UI (configurable tz) vs DB trigger (hardcoded Toronto) disagree | One company tz everywhere | C-6 (tz, below) |
| Manager | Two managers approve same job | Atomic claim prevents double-export (OK); no reviewed-version check | Explicit conflict on stale version | partially handled; add version/hash |
| Manager | Approve after employee edit | Job locked approved, not exported | Re-review prompt | C-2 |
| Manager | Costing with drafts/rejected present | All summed; historical rate drift | Status-scoped, effective-dated | C-4 |
| Manager | Open EmployeesPanel | ✅ Read-only load; mismatches shown as a banner + explicit "apply" batch | Read-only load | P-6 (done) |
| Manager | 100+ employees notifications | Unbounded full-table reads | Paginated review RPC | P-2/P-8 |
| Manager | Filter while requests overlap | No cancellation; older response can overwrite | Latest-wins | P-9 + AbortController |
| Both | 401/403/500 during autosave | Generic error; no typed recovery/queue | Refresh on 401, queue on 5xx | shared API adapter |
| Both | Render exception | Whole app blanks | Recover, keep draft | S-7 |

**Also tracked (lower tier):**
- **C-6 timezone:** new-job date uses device-local `dayjs()` (`EmployeeForm.jsx:137,244`) while the
  entry-window UI uses configurable tz (`:299`) and the DB trigger hardcodes `America/Toronto` (`0000:89`).
  → shared `companyDate()` helper; trigger reads the configured tz.
- **C-8 offline drafts:** form state is memory-only; no IndexedDB persistence (only `autofill_tip_seen`
  in localStorage). → schema-versioned IndexedDB draft keyed by owner + idempotency key.
- **C-6b DST ambiguity (from GPT audit):** stored date/time facts carry no offset/fold semantics, so a
  fall-back DST hour is ambiguous. → normalize to instants under the approved company tz, or reject/flag
  the ambiguous hour.

---

## 5. Second-audit (former `GPT.md`) reconciliation

`GPT.md` (source-level audit, 2026-09-09) was a parallel pass. It overlapped ~90 % with the findings
above (its 1.2 = C-2, 1.4 = C-4, 1.7 = P-6, 1.8 = S-1, 2.2 = S-3, 2.3 = S-4, 3.3 = S-6, 3.4 = S-7,
1.6 = S-3b). It has been merged into this tracker and deleted. The distinct points it contributed,
now folded in above:

- **Idempotency key shape** — do NOT assume `(user_id, job_date, ot)` is unique; use a `submission_key`
  uuid instead (folded into **C-3**).
- **Batch approval N+1** — `getUserById` per employee (added as **P-11**).
- **DST ambiguity** — no offset/fold on stored times (added as **C-6b**).
- **Approval workflow completeness (its §2.1)** — reviewed-input hash, immutable approval snapshots,
  durable export-attempt records, and "external timeout → unknown/reconcile" (not assumed failure).
  This extends **S-3 / S-4 / S-3b**: the fix there should persist a snapshot + input hash + actor and
  record export attempts for reconciliation.
- **Wildcard CORS** — present on the approval functions but **low value** (they validate bearer tokens);
  deprioritized behind CSP/XSS, short sessions, reauth for sensitive ops, and audit correlation.

Verified status snapshot (2026-09-21, current `main`): **C-1 + C-2 + P-6 + S-1 resolved**; **C-3,
C-4 (status filter half), C-5, S-3 still open**; **S-2 partially addressed** (privilege now role-based).
The recent work on `claude/new-admin-role-t33fe4` was the payroll pipeline (talons, DAS, union dues)
plus the C-2 approval fix, the P-6 read-only-load fix and the S-1 role-casing fix.

---

## Notes on scope
- No clock-in/out/break buttons exist; the employee flow is manual Départ/Arrivée/Fin entry, so the
  repetitive Save/Submit paths were audited in place of clock-button races.
- Findings verified against the tree at merge commit `60ada5a`. Re-check line numbers before editing.
