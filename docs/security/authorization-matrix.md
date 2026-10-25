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

## Sensitive data — NAS/SIN vault (M8 2026-09-05, RPC-only 0084, encrypted 0102)

NAS/SIN is not on `profiles`. Since migration 0102 (V2.4.156) each number is a **Supabase Vault
secret** (encrypted with a key kept outside the database); `public.employee_sensitive` only holds
`user_id → nas_secret_id`. The former plain-text `nas` column is dropped, so a dump or restored
backup of the database contains ciphertext only.

| Op | anon | emp | manager / admin | owner (`is_privileged()`) | service |
|---|---|---|---|---|---|
| Table `employee_sensitive` (any op) | ❌ | ❌ | ❌ | ❌ (no policy, no grant since 0084) | ✅ bypasses RLS |
| `reveal_nas(target)` | ❌ | ❌ | ❌ | ✅ audited `nas_reveal` | — |
| `set_nas(target, nas)` | ❌ | ❌ | ❌ | ✅ audited `nas_update` (never the value); Luhn check → `invalid_nas` | — |
| `nas_presence()` | ❌ | empty | empty | ✅ ids only | — |
| `export_ccq_nas(ids, reason)` | ❌ | ❌ | ❌ | ✅ reason ≥ 10 chars, 5 / hour, 500 max, audited `nas_bulk_export` | — |

- `is_privileged()` is true for the `owner` role only.
- The UI never eager-loads the value: presence only. Reveal re-prompts for the owner's password, then
  calls `reveal_nas`. The CCQ screen shows a mask; the bulk export needs a written reason.
- Deleting an employee (cascade to `employee_sensitive`) deletes the Vault secret (trigger
  `employee_sensitive_drop_secret`, not callable by any API role).
- Limit: Vault protects copies of the database, not a live session with database-admin rights
  (Supabase dashboard / `postgres`), which can still read `vault.decrypted_secrets`. Keep 2FA on the
  Supabase account and the number of dashboard members minimal.

## Two-factor authentication (0103, V2.4.157)

| Role | Code after the password | Without the code (aal1 session) |
|---|---|---|
| employee, subcontractor_1 | not asked (unless they added a device) | unchanged |
| admin, manager, owner | **required** (first sign-in: add a device) | treated as `employee` by `get_my_role()`; `is_privileged()` false; manager Edge Functions answer `mfa_required` |

- Enforced in the database, not only in the UI: every manager policy / RPC goes through `get_my_role()`, NAS through
  `is_privileged()`, both require `auth.jwt() ->> 'aal' = 'aal2'` for manager-tier roles (`session_is_aal2()`).
- `mfa_enrolled_users()` (manager level) lists who has a verified device (shield icon in Employés); no secret ever leaves
  Supabase Auth.
- Recovery: a backup device can be added in Profil; a lost phone is reset by the developer (delete the account's rows
  in `auth.mfa_factors`), then the person adds a new device at the next sign-in.

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

## Exit status for M2.1 / M2.4

- [x] CRUD matrix for the sensitive write-target tables and all storage buckets, per
  role, taken from the live database.
- [x] **Runnable adversarial suite (M2.4, Option A):** `tests/rls/authorization_matrix.sql`
  impersonates anon / active employee / paused employee / manager and asserts the matrix
  in a rolled-back transaction. Verified green against the live DB 2026-09-05 (9/9 pass),
  including the paused-account containment invariants (cannot insert a job, cannot update
  own profile).
- [ ] Extend the matrix + suite to the remaining config/reference and messaging tables.
- [ ] **Option B (future):** promote the suite into CI against a disposable Supabase
  (`supabase start` / `db reset` in a GitHub Action) with minted JWTs and a clean +
  upgrade migration path, so the matrix is enforced on every PR. Header of the SQL file
  tracks this.

## Pages de la Gestion (V2 / V3)

Règle exécutable : `canOpenNavItem` / `visibleTabs` (`src/lib/manager-nav.js`), reprise par
`authorizationFor().pages` et `.tabs` (`src/lib/authorization-matrix.js`) et testée dans
`manager-nav.test.js` / `authorization-matrix.test.js`. Ce sont des contrôles d'interface : l'accès
réel aux données reste celui des politiques RLS et des RPC ci-dessus.

- **V2** (`MANAGER_NAV`, inchangée et figée par un test) : une page s'ouvre pour un gestionnaire ou le
  propriétaire, ou pour un admin de bureau qui a le `grant` de la page (`live`, `timesheet`,
  `notifications`, `employees`, `forms`). `ownerOnly` = propriétaire seulement (feuille d'urgence).
- **V3** (`MANAGER_NAV_V3`) : certaines entrées sont des pages à onglets sur de nouveaux chemins
  (`todo`, `v3/time`, `v3/pay-history`, `v3/team`, `v3/reports`, `v3/config`). **Chaque onglet garde la règle
  de la page V2 d'où il vient** ; une entrée apparaît si au moins un onglet est permis ; un `?tab=` interdit
  ou inconnu bascule sur le premier onglet permis ; sans onglet permis, retour à `#/manager`.

| Page V3 | Onglet → page d'origine (règle) |
|---|---|
| À traiter (`todo`) | À approuver (gestionnaire) · Justificatifs → `receipts` (`notifications`) |
| Feuilles de temps (`v3/time`) | Feuilles de temps → `timesheets` (`timesheet`) · Débloquer une journée → `unlock-day` (`employees`) |
| Historique paie (`v3/pay-history`) | Talons · DAS · Relevé d'emploi · Calcul détaillé (gestionnaire) |
| Employés (`v3/team`) | Employés → `employees` (`employees` ; fiche à onglets V2.4.180 : elle contient aussi Règles de temps — `config/rules`, même règle `employees` — et, pour un gestionnaire / propriétaire seulement, l'onglet Impôts = formulaires TD1 / TP-1015.3 de Paramètres, table `employee_tax_profiles` gestionnaire seulement par RLS 0083) · Absences (gestionnaire) · Groupes → `employees` (`employees` ; tables `employee_groups` / `employee_group_members` : RLS `get_my_role() = 'manager'`, 0114) |
| Rapports (`v3/reports`) | Coûts · Semaine · Mois · Par employé · Export CCQ (gestionnaire) |
| Configuration (`v3/config`) | Paramètres (sans les formulaires TD1 en V3) · Taux CCQ · Règles de paie · Références (gestionnaire) · Contacts → `references` (gestionnaire, mêmes lignes que Références › Contacts) · Formulaires → `forms` (`forms`) |
| Notes (`notes`, V3 seulement, groupe Aujourd'hui) | Page sans onglet (gestionnaire / propriétaire). Données : table `manager_notes` (0111), toujours `get_my_role() = 'manager'` (donc aal2). Lire / modifier : `user_id = auth.uid() or shared` (une note partagée reste partagée pour un non-auteur) ; créer : en son nom ; supprimer : l'auteur seulement. Une note **privée** n'est visible que par son auteur, la propriétaire comprise ; une note **partagée** l'est par tous les gestionnaires. Trigger `manager_notes_guard` : auteur figé, `done_by`. Aucun accès `anon` |
| Admin › Trajets et frais (`advanced/travel-rules`, V3 seulement) | Page sans onglet (gestionnaire / propriétaire). Données : table `travel_pay_rules`, lecture `get_my_role() = 'manager'`, écriture seulement par le RPC `set_travel_pay_rule` (rôle `manager` ou `owner` non suspendu, une ligne `travel_rule_set` au Journal par appel) |
