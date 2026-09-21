# Sparklog — Code Audit & Remediation Tracker

> Working document for the Employee/Manager workflow audit. **Only OPEN findings are
> listed** — resolved items are removed (see git history). Every finding was verified
> against the source at the cited `file:line`; re-check line numbers before editing.

**Stack:** React 18 + Vite PWA, Supabase (Postgres + RLS + Edge Functions), payroll
export to Google Apps Script. Roles: `employee` / `manager` / `admin` / `owner` (lowercase).

**What is already solid (do not "fix"):**
- RLS is comprehensive; `get_my_role()` / `is_active_employee()` are `security definer`.
- Employees read only their own `profiles` row and own `jobs` (no peer PII/pay leakage).
- Privileged profile fields protected by a **whitelist** trigger (`0018:14-44`), not a blacklist.
- Export/approval columns trigger-protected (`0011:31-57`); paused accounts write-contained (`0018`).
- `push_approved_batch` re-checks manager role server-side, does an **atomic claim** to prevent
  double-export, and returns a **typed per-job result** so the client never force-approves.
- NAS/SIN live in the RLS-gated `employee_sensitive` vault (`0026`); privilege is role-based (`owner`).
- Job submission is idempotent: a per-new-entry `submission_key` + a `(user_id, submission_key)` unique
  constraint (client upserts on it) + a synchronous double-tap guard prevent duplicate timecards.

---

## Priority Tier (fix in this order)

| # | ID | Severity | Title | Anchor |
|---|----|----------|-------|--------|
| 1 | C-5 | High | No DB validity constraints on the time interval (null/zero/overlap) + direct-submit bypass | `0000:198-200`, `0018:57-59` |
| 2 | S-3 | High | Approval audit actor is null (service-role write vs `auth.uid()` trigger) | `push_approved_batch/index.ts:97,145` + `0015` |
| 3 | S-4 | Medium | Manager job updates have no state-transition allowlist | `0000:451` |

---

## 1. Critical / Blocking Bugs

### C-5 — No DB validity constraint on the work interval + direct-submit bypass
- **File:** `0000:198-200` — `depart/arrivee/fin` nullable `time`, no chronology/duration/overlap check.
  RLS `0018:57-59` also lets a crafted API call insert `status='submitted', locked=true` directly.
- **Impact:** zero-hour and incomplete jobs can be submitted and approved; overlapping jobs double-count;
  forged submitted rows bypass all client validation.
- **Fix:** restrict the employee **insert** policy to `status='saved'` (drafts only); route submission
  through a validating `submit_job` RPC (lock row, require all three times, bound duration to ≤16h, reject
  overlap/zero, reject on blocking classification warnings). The idempotency key from C-3 already threads
  through — the RPC should carry it too.
- **Status:** ☐ open (idempotency half done in C-3; the RLS-restrict + validating RPC remain here)

---

## 2. Performance & Latency

| ID | Finding | Anchor | Fix |
|----|---------|--------|-----|
| P-1 | No route-splitting; employees download manager code; ~784 kB bundle | `App.jsx:7-13` | `React.lazy` + `Suspense`; vendor chunks |
| P-2 | Notifications panel does unbounded full-table reads | `ManagerDashboard.jsx:237-239,301-304,347-349` | date/status window + `.limit()` + indexes |
| P-3 | 4 exact-count queries per filter change | `ManagerDashboard.jsx:117-146` | single RPC with `count(*) filter (where …)` |
| P-4 | Employee History/Week fetch all-time jobs | `History.jsx`, `Week.jsx` | default 8–12 weeks + cursor paging |
| P-5 | Costing does full client-side joins/aggregation (now status-scoped, still client-side) | `CostingDashboard.jsx` | server aggregation endpoint |
| P-7 | LiveCrew polls roster every 30s | `LiveCrew.jsx` | cache roster; realtime; pause when hidden; abort in-flight |
| P-8 | Missing review indexes on `created_at`/status | `overtime_evidence`, `parking_receipts`, `meal_claims` | partial indexes |
| P-9 | Offset pagination over mutable `updated_at` sort skips/dupes | `ManagerDashboard.jsx:178-180` | keyset pagination on `(job_date, id)` |
| P-10 | Card renderers recreated each render; lists unmemoized | `ManagerDashboard.jsx:685,793` | `React.memo` card + `useCallback` handlers |
| P-11 | Batch approval calls Auth Admin `getUserById` once per employee (N+1) | `push_approved_batch/index.ts` | one bulk lookup, or avoid exporting contact data |

---

## 3. RBAC & Security

### S-3 — Approval audit actor is null — HIGH
- `push_approved_batch/index.ts:97,145` updates via the **service-role** client; the `audit_job_status`
  trigger (`0015`) records `auth.uid()`, which is null for service-role → the approving manager is lost.
- **Fix:** write the audit row inside a `submit`/`approve` RPC that receives and JWT-verifies the actor id.
  Bundle with the approval-workflow completeness work (persist a snapshot + reviewed-input hash + actor,
  and durable export-attempt records for reconciliation).
- **Status:** ☐ open

### S-4 — Manager job updates have no state-transition allowlist — MEDIUM
- `0000:451` manager update policy is unconditional (not narrowed by later migrations). A forged manager
  request can rewrite approved facts, revert state, or change ownership/export metadata.
- **Fix:** replace broad update grant with specific RPCs (`return_job_for_correction`, `approve_jobs`,
  `void_approval`, `review_meal_claim`, `review_parking_claim`) enforcing legal transitions with row locks
  + an expected-state/version check (first valid transition wins; later requests get an explicit conflict).
- **Status:** ☐ open

### S-2 — Privileged NAS access bypasses the audited reveal — MEDIUM (scoped) — PARTIAL
- Privilege is now **role-based** (`owner`) and revocable (`is_privileged()`, migrations `0043`+). The
  **residual** concern: a privileged (owner) account can `select * from employee_sensitive` directly from
  the browser (`CcqJsonExport.jsx`) and bulk-read NAS **un-audited**, bypassing the per-reveal `reveal_nas`.
- **Fix (remaining):** no direct vault SELECT in the browser; generate sensitive exports server-side under
  a distinct permission; require a purpose/reason and audit each bulk access; mask + rate-limit.
- **Status:** ☐ open (privilege model already role-based/revocable)

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

### Low-value / deprioritized
- **Wildcard CORS** on the approval functions is low value (they validate bearer tokens). Prioritize
  CSP/XSS, short sessions, reauth for sensitive ops, and audit correlation instead.
- **Profile-sync error surfacing:** `Login.ensureProfile()` failures are only `console.warn` — a typed,
  retryable error to the user is an optional robustness follow-up.

---

## 4. Edge Case Matrix (open items only)

| Persona | Scenario | Found Behavior | Expected | Patch |
|---|---|---|---|---|
| Employee | Direct API submit (`status=submitted`) | RLS allows it, bypassing client validation | Server-validated transition only | C-5 |
| Employee | Zero/equal times | Submittable; engine only warns | Rejected | C-5 |
| Employee | Overlapping jobs | Summed, not detected | Rejected/flagged | C-5 |
| Employee | Offline Save, then reload | Draft lost (memory only) | Durable on-device draft | C-8 |
| Employee | Dropped conn after upload | Orphaned object / flagged job w/o metadata | Atomic or queued | S-3b |
| Employee | Company tz ≠ America/Toronto near midnight | UI (configurable tz) vs DB trigger (hardcoded Toronto) disagree | One company tz everywhere | C-6 |
| Employee | DST fall-back ambiguous hour | Stored times carry no offset/fold semantics | Reject/flag or normalize to instants | C-6b |
| Manager | Two managers approve same job | Atomic claim prevents double-export; no reviewed-version check | Explicit conflict on stale version | S-4 (add version/hash) |
| Manager | 100+ employees notifications | Unbounded full-table reads | Paginated review RPC | P-2/P-8 |
| Manager | Filter while requests overlap | No cancellation; older response can overwrite | Latest-wins | P-9 + AbortController |
| Manager | Sensitive export | Owner can bulk-read NAS un-audited from the browser | Audited server-side export | S-2 |
| Both | 401/403/500 during autosave | Generic error; no typed recovery/queue | Refresh on 401, queue on 5xx | shared API adapter |
| Both | Render exception | Whole app blanks | Recover, keep draft | S-7 |

**Also tracked (lower tier):**
- **C-6 timezone:** new-job date uses device-local `dayjs()` (`EmployeeForm.jsx:137,244`) while the
  entry-window UI uses configurable tz (`:299`) and the DB trigger hardcodes `America/Toronto` (`0000:89`).
  → shared `companyDate()` helper; trigger reads the configured tz.
- **C-6b DST ambiguity:** stored date/time facts carry no offset/fold semantics, so a fall-back DST hour is
  ambiguous. → normalize to instants under the approved company tz, or reject/flag the ambiguous hour.
- **C-8 offline drafts:** form state is memory-only; no IndexedDB persistence (only `autofill_tip_seen` in
  localStorage). → schema-versioned IndexedDB draft keyed by owner + idempotency key.

---

## Notes on scope
- No clock-in/out/break buttons exist; the employee flow is manual Départ/Arrivée/Fin entry, so the
  repetitive Save/Submit paths were audited in place of clock-button races.
- Re-check line numbers before editing; the tree moves under active development.
