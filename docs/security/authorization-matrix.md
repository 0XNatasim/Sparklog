# Authorization matrix (M2.1)

- **Status:** Snapshot 2026-09-04, taken from the live database **after** the
  `paused_employee_write_containment` migration was applied. Regenerate after any RLS
  change.
- **Scope:** the sensitive write-target tables and storage buckets. Config/reference
  tables are summarized at the end and flagged for completion.
- **How this was produced:** read directly from `pg_policies` / `pg_class` /
  `storage.buckets` (not from code). This documents *enforced* access, not intended.

## Roles

| Role | Meaning |
|---|---|
| **anon** | Unauthenticated. `auth.uid()` is null. |
| **emp (active)** | `role='employee'`, `is_paused=false`. |
| **emp (paused)** | `role='employee'`, `is_paused=true`. |
| **manager** | `role='manager'` (via `get_my_role()`). |
| **service** | `service_role` — used only by Edge Functions; **bypasses RLS entirely**. |

Legend: ✅ allowed · ❌ denied · ⚠️ allowed but constrained (see notes) · — n/a

## Tables

### `profiles`
| Op | anon | emp (active) | emp (paused) | manager |
|---|---|---|---|---|
| SELECT | ❌ | ✅ own | ✅ own | ✅ all |
| INSERT | ❌ | ❌ | ❌ | ❌ (created by signup trigger / service) |
| UPDATE | ❌ | ⚠️ own, **whitelisted fields only** | ❌ | ✅ all |
| DELETE | ❌ | ❌ | ❌ | ❌ (service only, via `delete_user`) |

- Employee self-update is gated by `is_active_employee()` **and** the
  `enforce_employee_profile_whitelist` trigger (only phone, region, union, CCQ card
  fields, birth date, board visibility). Rate/role/pause/NAS/classification are not
  employee-editable.

### `jobs`
| Op | anon | emp (active) | emp (paused) | manager |
|---|---|---|---|---|
| SELECT | ❌ | ✅ own | ✅ own | ✅ all |
| INSERT | ❌ | ⚠️ own + status saved/unlocked or submitted/locked | ❌ | ✅ |
| UPDATE | ❌ | ⚠️ own, unlocked, status saved/updated | ❌ | ✅ all |
| DELETE | ❌ | ⚠️ own, unlocked, status saved/updated | ❌ | ❌ (no manager delete policy — service only) |

### `meal_claims`
| Op | anon | emp (active) | emp (paused) | manager |
|---|---|---|---|---|
| SELECT | ❌ | ✅ own | ✅ own | ✅ all |
| INSERT | ❌ | ⚠️ own + must own the job | ❌ | ❌ |
| UPDATE | ❌ | ❌ | ❌ | ✅ (approval workflow) |
| DELETE | ❌ | ❌ | ❌ | ❌ (service only) |

### `parking_receipts`
| Op | anon | emp (active) | emp (paused) | manager |
|---|---|---|---|---|
| SELECT | ❌ | ✅ own | ✅ own | ✅ all |
| INSERT | ❌ | ⚠️ own + must own the job | ❌ | ❌ |
| UPDATE | ❌ | ⚠️ own | ❌ | ✅ |
| DELETE | ❌ | ❌ | ❌ | ❌ (service only) |

### `overtime_evidence`
| Op | anon | emp (active) | emp (paused) | manager |
|---|---|---|---|---|
| SELECT | ❌ | ❌ (see note) | ❌ | ✅ all |
| INSERT | ❌ | ⚠️ own + must own the job | ❌ | ❌ |
| UPDATE/DELETE | ❌ | ❌ | ❌ | ❌ (service only, e.g. `cleanup_overtime_evidence`) |

### `manager_notifications`
| Op | anon | emp (active) | emp (paused) | manager |
|---|---|---|---|---|
| SELECT | ❌ | ❌ | ❌ | ✅ |
| INSERT | ❌ | ⚠️ own + must own the job | ❌ | — |

## Storage buckets (all **private**)

| Bucket | anon | emp (active) upload | emp (paused) upload | emp read | manager |
|---|---|---|---|---|---|
| `ccq-cards` | ❌ | ✅ own folder | ❌ | ✅ own | ✅ all (incl. delete) |
| `meal-receipts` | ❌ | ✅ own folder | ❌ | ❌ (see note) | 👁 read only |
| `overtime-evidence` | ❌ | ✅ own folder | ❌ | ❌ (see note) | 👁 read only |
| `parking-receipts` | ❌ | ✅ own folder | ❌ | ❌ (see note) | 👁 read only |
| `broadcast-images` | ❌ | 👁 read (any authenticated) | 👁 read | 👁 read | ✅ all |

- Employees have **no update/delete** on any storage object → uploaded files are
  effectively write-once for the uploader.
- Managers have **read-only** on meal/overtime/parking storage (no delete via RLS —
  deletion is service-role only).

## Notes, observations, and follow-ups

1. **Paused containment confirmed live.** Every employee write path (tables + storage
   uploads) is gated by `is_active_employee()`; a paused account is blocked at the DB.
   Verified by direct multi-identity test before the migration was applied.
2. **`emp read` gap on meal/overtime/parking storage — investigated 2026-09-04: NOT a
   functional bug.** Traced every employee-side access: employees only *upload* to
   these buckets and never fetch/display the images back (the app reads the permitted
   table rows, e.g. parking amount, not the stored object). No display path fails, so
   no policy change is warranted.
   *Real but minor adjacent issue:* `History.jsx` calls `storage.remove()` on a job's
   evidence/receipt files when an employee deletes a draft job, but employees have no
   delete on storage.objects, so those removes fail silently → orphaned files.
   Do **not** fix with a blanket employee-delete grant (it would also let an employee
   delete overtime evidence after submission, weakening evidence integrity). Route it
   through retention/reconciliation instead (M7.4 / cleanup function).
3. **Managers are not gated by `is_active_employee()`** (their policies check
   `get_my_role()='manager'`). A *paused manager*, if that state ever exists, would
   retain manager write. Confirm managers are never paused, or add a guard.
4. **Mixed `to`-roles.** Some manager policies target role `public` rather than
   `authenticated`. They still gate on `get_my_role()='manager'` (needs `auth.uid()`),
   so anon cannot pass — cosmetic inconsistency, worth normalizing to `authenticated`.
5. **All deletes on claims/receipts/evidence/jobs are service-role only.** Intentional,
   but means the retention/cleanup Edge Functions are the sole delete path — they must
   be audited (belongs to M9).
6. **Not yet detailed here:** config/reference tables (`company_holidays`,
   `overtime_settings`, `company_time_settings`, `company_capture_settings`,
   `ccq_rate_snapshots`, `employee_forms`, `job_entry_unlocks`, messaging tables). All
   have RLS **on**; a full CRUD row for each is a follow-up to complete M2.1.

## Exit status for M2.1

- [x] CRUD matrix for the sensitive write-target tables and all storage buckets, per
  role, taken from the live database.
- [ ] Extend the matrix to the remaining config/reference and messaging tables.
- [ ] Turn this matrix into the automated adversarial test suite (**M2.4**) so it is
  enforced, not just documented.
