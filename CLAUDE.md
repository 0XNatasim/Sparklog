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
- Submitted intervals are DB-validated: trigger `trg_validate_job_submission` rejects any transition to
  `status='submitted'` (app or forged direct insert) with missing départ/fin or a duration outside (0h, 16h].

## Regression / recurrence assessment (2026-09-26)

**Short answer: yes.** The exact defects above are mostly closed, but several of them came from
repeating failure patterns rather than isolated mistakes. A nearby feature can therefore recreate the
same user-visible failure unless the invariant is enforced and tested at the shared boundary (database,
auth adapter, or payroll engine), not only in one screen.

| Risk | Likelihood | What could recur | Existing protection | Remaining prevention work |
|------|------------|------------------|---------------------|---------------------------|
| Network/auth wait never settles | Low–medium | A new save, login, upload, or manager action could otherwise leave its button disabled forever | Every Supabase database/auth/storage/function HTTP request passes through `createBoundedFetch`; critical auth actions also have shorter operation timeouts; refreshes are coalesced by `refreshSessionOnce` | Keep action-specific timeouts and `finally` cleanup on interactive operations; test a promise that never settles |
| UI and database rules drift | Low–medium | A control could accept a value that Postgres rejects, as with the former 5-minute return-time bug | Shared `job-contract` constants/validator plus migration-locked contract tests cover every accepted boundary value (0, 5, 10, …, 240), rejected neighbors, intervals and kilometres | Extend the same contract pattern whenever a new job field or boundary is introduced |
| Payroll logic forks | Low | Calcul, Talon, DAS, export, or an Edge Function could disagree on weekly OT, overnight time, return time, or benefits | Browser code re-exports the Edge Function's single versioned engine module; parity fixtures cover policy combinations, week boundaries, overnight/return time and employee-type mapping | Add a fixture to the authoritative suite before introducing any new compensation rule |
| Retry/double-click race | Medium | A side effect other than job insertion or approved-batch claiming is applied twice | Job `submission_key` is unique and approved batches use an atomic claim | Give every mutating workflow an idempotency key and unique constraint; use row locks/expected versions for approval transitions |
| Multi-step partial save | Low–medium | Upload succeeds but its metadata write fails | Client compensation removes a just-uploaded object when its row fails; the cleanup worker reconciles older unreferenced overtime/parking/meal objects with a grace period | Schedule and monitor the cleanup function in each deployment; retain idempotent server submission boundaries |
| Date/time ambiguity | Low | Overnight, device timezone, or DST could produce a different date/duration in another screen | Montréal dates use shared `companyDate()`; jobs resolve to `started_at`/`ended_at` with `America/Toronto`; DST gaps/folds are rejected and overlap is checked on instants | Keep all new civil-date features on the shared helper and add transition-year fixtures when timezone rules change |
| Authorization policy drift | Low–medium | A new role or policy could restore excess access or let a manager rewrite an approved fact | An executable role × operation matrix covers every persisted role, every grantable admin section, paused personas, CCQ inclusion and owner-only NAS; database-source assertions lock the matching RLS/RPC invariants | Update the matrix first whenever a role, section or privileged operation is introduced |
| Database load regression | Low–medium | New dashboards could repeat unbounded reads/counts and exhaust Disk IO again | Named query budgets cap manager/history/review reads; manager/history use stable keyset pagination; four count scans are one aggregate RPC; pending-review/keyset indexes support those paths | Update and test the budget before increasing a page/queue size; retain infrastructure observability |
| Render failure loses unsaved work | Low–medium | An unforeseen component exception can still blank a route | Employee drafts are schema-versioned, owner-scoped and persisted in IndexedDB with 30-day expiry; reload/offline recovery restores them | Add route-level error boundaries (S-7); keep attachment persistence in point 10 |

### Release gates for recurrence-prone changes

Before releasing changes to time entry, auth, payroll, approval, or imports:

1. Exercise timeout, rejected request, lost-response-after-commit, retry, and rapid double-click cases.
2. Verify the same boundary values against both the UI and a real migrated database.
3. Run payroll parity fixtures in every runtime that calculates or exports pay.
4. Test the employee, team-leader, manager, admin, owner, paused, and subcontractor roles explicitly.
5. Check Sunday/Saturday transitions, midnight crossing, and both DST transitions in the company timezone.
6. Confirm retries produce one business event, one audit event, and no orphaned storage object.
7. Compare query counts and rows read with a production-sized dataset before adding dashboard polling or filters.

Nine protections are complete. Timezone normalization is deployed, but point 6 remains open until managers
can explicitly disambiguate the repeated hour during Montréal's autumn DST transition.

### Ordre recommandé

- [x] **1.** Soumission atomique et idempotente des jobs.
- [x] **2.** Timeouts communs et récupération garantie de l’interface.
- [x] **3.** Transitions d’approbation sécurisées côté serveur.
- [x] **4.** Tests de contrat entre l’interface et la base.
- [x] **5.** Moteur de paie unique avec tests de parité.
- [ ] **6.** Uniformisation du fuseau horaire et gestion du DST (heure répétée : contournement gestionnaire à ajouter).
- [x] **7.** Matrice automatisée des rôles et autorisations.
- [x] **8.** Brouillons locaux et reprise hors ligne.
- [x] **9.** Pagination, agrégations et budgets de requêtes.
- [x] **10.** Nettoyage des fichiers orphelins et durcissement des preuves.

---

## Priority Tier (fix in this order)

| # | ID | Severity | Title | Anchor |
|---|----|----------|-------|--------|
| — | — | — | No open critical/blocking finding | — |

---

## 1. Critical / Blocking Bugs

### C-5 / C-6 — Work intervals, Montréal timezone and DST — PARTIALLY RESOLVED
- **Done (DB validity):** trigger `trg_validate_job_submission` (migration `validate_job_submission_interval`)
  fires on any write that puts a job into `status='submitted'` — the app AND a forged direct insert — and
  rejects missing départ/fin or a duration outside (0h, 16h] (`check_violation`; client maps it to
  `form.errors.invalidInterval`). Manager approval (submitted→approved), drafts and existing rows are
  untouched. This closes the zero-hour / incomplete / excessive-duration hole for every write path.
- **Done (atomic transition):** `save_own_job` owns employee draft/submission transitions, derives
  ownership/status/lock state server-side, serializes edits, and returns the already-committed row when an
  idempotency key is retried. Direct employee writes can create/update drafts but cannot submit them.
- **Done (timezone/DST):** Montréal civil times resolve through `America/Toronto` into persisted
  `started_at`/`ended_at` instants, including a migration backfill for existing jobs. Nonexistent spring
  times and ambiguous repeated fall times are rejected; elapsed duration therefore reflects the real DST
  transition rather than wall-clock subtraction.
- **Done (overlap):** submitted/approved ranges are checked under a per-employee transaction lock, so
  concurrent overlapping submissions cannot both pass.
- **Remaining:** add a manager-only choice of the first or second occurrence for legitimate work during the
  repeated autumn hour; rejection without this override is safe but operationally incomplete.
- **Status:** 🟠 partial

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

### S-3 / S-4 — Approval actor and manager transitions — RESOLVED
- Approval audit falls back to the JWT-verified `exported_by` actor when the batch Edge Function performs
  its service-role claim, so the approving manager is no longer recorded as null.
- Broad manager insert/update policies are removed. Returning a job for correction and reviewing meal or
  parking claims now use narrow `security definer` RPCs with role checks, row locks, legal-state checks,
  server-derived reviewer fields, and explicit conflicts. Approval/export remains the typed, atomic batch
  Edge Function; service-role maintenance continues to bypass RLS.
- **Status:** ✅ resolved

### S-2 — Privileged NAS access bypasses the audited reveal — MEDIUM (scoped) — PARTIAL
- Privilege is now **role-based** (`owner`) and revocable (`is_privileged()`, migrations `0043`+). The
  **residual** concern: a privileged (owner) account can `select * from employee_sensitive` directly from
  the browser (`CcqJsonExport.jsx`) and bulk-read NAS **un-audited**, bypassing the per-reveal `reveal_nas`.
- **Fix (remaining):** no direct vault SELECT in the browser; generate sensitive exports server-side under
  a distinct permission; require a purpose/reason and audit each bulk access; mask + rate-limit.
- **Status:** ☐ open (privilege model already role-based/revocable)

### S-6 — Evidence/OCR content controls — RESOLVED
- Evidence is checked by magic bytes and size, decoded under a pixel budget, resized, and re-encoded as
  JPEG before Storage/OCR, stripping EXIF/GPS metadata. Storage independently enforces MIME and size.
- OCR runs server-side with a timeout and stores only `processed` / `needs_review` / `failed`; extracted
  message text is not retained. Existing raw OCR text is purged by migration `0065`.
- **Status:** ✅ resolved

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
| Employee | Zero/equal times | ✅ Rejected by `trg_validate_job_submission` | Rejected | C-5 (done) |
| Employee | Offline Save, then reload | Durable IndexedDB draft, with stale-edit conflict prompt | Durable on-device draft | C-8 (done) |
| Employee | Dropped conn after upload | Orphaned object / flagged job w/o metadata | Atomic or queued | S-3b |
| Manager | Two managers approve same job | Atomic claim prevents double-export; no reviewed-version check | Explicit conflict on stale version | S-4 (add version/hash) |
| Manager | 100+ employees notifications | Unbounded full-table reads | Paginated review RPC | P-2/P-8 |
| Manager | Filter while requests overlap | No cancellation; older response can overwrite | Latest-wins | P-9 + AbortController |
| Manager | Sensitive export | Owner can bulk-read NAS un-audited from the browser | Audited server-side export | S-2 |
| Both | 401/403/500 during autosave | Generic error; no typed recovery/queue | Refresh on 401, queue on 5xx | shared API adapter |
| Both | Render exception | Whole app blanks | Recover, keep draft | S-7 |

**Also tracked (lower tier):**
- **C-8 offline drafts (done):** schema-versioned IndexedDB drafts are keyed by owner and job; edit drafts
  restore only when newer than the server copy and after explicit employee confirmation.

---

## Notes on scope
- No clock-in/out/break buttons exist; the employee flow is manual Départ/Arrivée/Fin entry, so the
  repetitive Save/Submit paths were audited in place of clock-button races.
- Re-check line numbers before editing; the tree moves under active development.
