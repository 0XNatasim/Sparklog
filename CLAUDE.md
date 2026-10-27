# Sparklog — Code Audit & Remediation Tracker

> Working document for the Employee/Manager workflow audit. **Only OPEN findings are
> listed** — resolved items are removed (see git history). Every finding was verified
> against the source at the cited `file:line`; re-check line numbers before editing.

**Stack:** React 18 + Vite PWA, Supabase (Postgres + RLS + Edge Functions), payroll
export to Google Apps Script. Roles: `employee` / `manager` / `admin` / `owner` (lowercase).

**Release rule:** always bump the patch of `APP_VERSION` in `src/lib/version.js` in every PR (shown in the header as `V…`), and mention it in the commit/PR title.

**Docs rule:** `README.md`, `NOOB.md` and `CLAUDE.md` are always updated **together, in the same PR**, and each names
the current version (`src/lib/docs-sync.test.js` fails otherwise). New feature → README (what it does), NOOB (in plain
French, what the owner sees or must do) and CLAUDE §6 (technical entry). Never a personal value (NAS, pay amount of a
person, payroll total) in any of them: the repository is public.

**What is already solid (do not "fix"):**
- RLS is comprehensive; `get_my_role()` / `is_active_employee()` are `security definer`.
- Employees read only their own `profiles` row and own `jobs` (no peer PII/pay leakage).
- Privileged profile fields protected by a **whitelist** trigger (`0018:14-44`), not a blacklist.
- Export/approval columns trigger-protected (`0011:31-57`); paused accounts write-contained (`0018`).
- `push_approved_batch` re-checks manager role server-side, does an **atomic claim** to prevent
  double-export, and returns a **typed per-job result** so the client never force-approves.
- NAS/SIN live in the `employee_sensitive` vault (`0026`), RPC-only since `0084`: no table policy or grant
  for the browser; `reveal_nas` / `set_nas` / `nas_presence` / `export_ccq_nas` are owner-only and audited
  (bulk export needs a written reason, is rate-limited to 5/h, and the CCQ screen shows only a mask).
  Since `0102` each NAS is a **Supabase Vault secret** (encrypted, key outside the database; plain-text column
  dropped), so a dump/backup holds ciphertext only; `set_nas` rejects a bad check digit (Luhn, `invalid_nas`).
- Two-factor authentication (`0103`, V2.4.157): owner / manager / admin accounts must enter an authenticator-app
  code after the password. `get_my_role()` returns `manager` and `is_privileged()` is true only for an `aal2` JWT
  (every RLS policy and manager RPC goes through them), the manager-level Edge Functions check the same claim
  (`_shared/mfa.js`), and the app shows the enrolment / code screen before any page (`MfaGate`, `src/lib/mfa.js`).
- Overtime proof is atomic (`0084`): `save_own_job_with_overtime_evidence` checks the uploaded file, then
  saves the job, the proof row and the manager notification in one transaction; `save_own_job` honours the
  "proof captured" flag only when a proof exists for that day.
- Job submission is idempotent: a per-new-entry `submission_key` + the `jobs_user_submission_key_uniq`
  constraint; `save_own_job` resolves a reused key to the committed row before inserting, under the same
  per-employee lock as the submission validator, so a retry or concurrent double-tap returns one job.
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
| Render failure loses unsaved work | Low | An unforeseen component exception could blank a route | Root, route and manager-panel error boundaries show a recoverable error (reload keeps the IndexedDB draft); employee drafts are schema-versioned, owner-scoped and persisted in IndexedDB with 30-day expiry | Keep attachment persistence in point 10; wrap any new top-level layout in the route boundary |

### Release gates for recurrence-prone changes

Before releasing changes to time entry, auth, payroll, approval, or imports:

1. Exercise timeout, rejected request, lost-response-after-commit, retry, and rapid double-click cases.
2. Verify the same boundary values against both the UI and a real migrated database.
3. Run payroll parity fixtures in every runtime that calculates or exports pay.
4. Test the employee, team-leader, manager, admin, owner, paused, and subcontractor roles explicitly.
5. Check Sunday/Saturday transitions, midnight crossing, and both DST transitions in the company timezone.
6. Confirm retries produce one business event, one audit event, and no orphaned storage object.
7. Compare query counts and rows read with a production-sized dataset before adding dashboard polling or filters.

The ten protections are in place. Point 6 closed with V2.4.177 (migration 0116): an owner can now say which
occurrence of Montréal's repeated autumn hour was worked. Pay still counts clock time (see §6.1 D).

### Ordre recommandé

- [x] **1.** Soumission atomique et idempotente des jobs.
- [x] **2.** Timeouts communs et récupération garantie de l’interface.
- [x] **3.** Transitions d’approbation sécurisées côté serveur.
- [x] **4.** Tests de contrat entre l’interface et la base.
- [x] **5.** Moteur de paie unique avec tests de parité.
- [x] **6.** Uniformisation du fuseau horaire et gestion du DST (heure répétée : choix du gestionnaire, V2.4.177).
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
  idempotency key is retried (looked up before the INSERT, since BEFORE INSERT triggers run ahead of
  `ON CONFLICT` and the validator would otherwise reject the retry as an overlap). Direct employee writes
  can create/update drafts but cannot submit them.
- **Migration parity:** every file in `supabase/migrations` is named `<version>_<name>.sql` with the exact
  version production recorded in `supabase_migrations.schema_migrations` (4-digit only for legacy
  0000–0026; new files use a 14-digit timestamp — `migrations.test.js` enforces it). The folder rebuilds the
  production schema from scratch, and the Supabase GitHub integration sees every file as already applied.
- **Done (timezone/DST):** Montréal civil times resolve through `America/Toronto` into persisted
  `started_at`/`ended_at` instants, including a migration backfill for existing jobs. The backfill disables
  and restores the snapshot, `updated_at`, and submission-validation triggers so historical payroll and
  optimistic-concurrency timestamps remain unchanged. Nonexistent spring times and ambiguous repeated fall
  times are rejected; elapsed duration therefore reflects the real DST transition rather than wall-clock
  subtraction.
- **Done (submission boundary):** interval/overlap validation runs only on inserts and transitions from
  `saved`/`updated` to `submitted`; export rollbacks and service-role metadata updates are not revalidated.
- **Done (overlap):** submitted/approved ranges are checked under a per-employee transaction lock, so
  concurrent overlapping submissions cannot both pass.
- **Done (repeated autumn hour, V2.4.177, migration 0116):** `jobs.depart_fold` / `fin_fold` (1 = first time,
  EDT; 2 = second time, EST). `montreal_local_instant(local, fold)` tests both Montréal offsets; without a choice a
  repeated time is still refused (`ambiguous_montreal_local_time`). Only the owner's emergency timesheet
  (`create_job_for_employee`, security definer, two new defaulted arguments) writes the choice; a direct browser write
  is refused (`dst_choice_manager_only`); the choice is cleared outside the repeated hour. The employee's confirmation
  keeps it (`EmployeeForm` passes it to the pre-submit check).
- **Status:** ✅ resolved (pay still counts clock time: §6.1 D)

---

## 2. Performance & Latency

| ID | Finding | Anchor | Fix |
|----|---------|--------|-----|
| P-5 | Costing aggregates client-side with the shared payroll engine (status- and date-scoped, every page read via `fetchAllRows` since V2.4.109). A SQL aggregation would fork the payroll rules; revisit only if the payload grows (≈ 90 kB for 760 jobs) | `CostingDashboard.jsx` | optional: Edge Function running the same engine |

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

### S-6 — Evidence/OCR content controls — RESOLVED
- Evidence is checked by magic bytes and size, decoded under a pixel budget, resized, and re-encoded as
  JPEG before Storage/OCR, stripping EXIF/GPS metadata. Storage independently enforces MIME and size.
- OCR runs server-side with a timeout and stores only `processed` / `needs_review` / `failed`; extracted
  message text is not retained. Existing raw OCR text is purged by migration `0065`.
- **Status:** ✅ resolved

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
| Manager | Two managers approve same job | Atomic claim prevents double-export; no reviewed-version check | Explicit conflict on stale version | S-4 (add version/hash) |

**Also tracked (lower tier):**
- **C-8 offline drafts (done):** schema-versioned IndexedDB drafts are keyed by owner and job; edit drafts
  restore only when newer than the server copy and after explicit employee confirmation.

---

## 5. Optimisation — bundle, couleurs, interface (audit 2026-10-09)

Livré par la PR #395 (fusionnée le 2026-10-12, V2.4.99). Mesures initiales : `vite build` → un seul chunk `index-*.js` de 1,27 Mo (360 Ko gzip) ; precache PWA 3,5 Mo.
Contrastes calculés selon WCAG 2.x (texte ≥ 4,5:1, bordures de champs ≥ 3:1). Une PR par lot, chacune
avec le bump de `APP_VERSION`.

### Lot 1 — Nettoyage (risque faible) — ✅ fait (V2.4.94)
Precache PWA : 3 562 Ko → 2 027 Ko (28 → 23 entrées). Bundle JS inchangé (le gain JS est au Lot 3).
- [x] Dépendances jamais importées retirées : `@mui/material`, `@mui/x-date-pickers`, `@emotion/react`,
  `@emotion/styled`, `next-themes`, `@radix-ui/react-select`, `jimp` (145 paquets en moins).
- [x] Fichiers morts supprimés : `src/App.css`, `src/assets/react.svg`, `public/vite.svg`, `public/logo.jpg`.
- [x] Images converties en WebP : en-têtes 171/122 Ko → 14/13 Ko (light réduit à 768 px de large),
  `Auto-fill` 57 → 17 Ko, exemple de preuve 27 → 10 Ko.
- [x] Plus de copie hachée en double : `AppShell`, `Login`, `ProtectedRoute` et `EmployeeForm` référencent
  `/…webp` dans `public/` au lieu d'importer `../../public/…` ; `globPatterns` inclut `webp`.
- [x] `public/inventory-examples` : 3 × 1080×2340 (≈ 250 Ko) → 480×1040 WebP (22 Ko) ; gardés en precache
  pour que les exemples restent visibles hors ligne.

### Lot 2 — Contrastes et thème — ✅ fait (V2.4.95)
- [x] Sombre : `--destructive` `0 84% 64%` (texte sur fond 5,4:1, sur carte 5,1:1) avec
  `--destructive-foreground` foncé (5,4:1) — avant 1,99:1.
- [x] Clair : `--destructive` `0 72% 45%`, texte blanc 5,8:1 (avant 3,59:1).
- [x] `--input` : clair `215 16% 58%` (3,2:1), sombre `0 0% 42%` (3,4:1). Les 30 `<select>`/`<input>`/`<textarea>`
  natifs qui n'avaient que `border` utilisent maintenant `border-input` comme le composant `Input`.
- [x] Sombre unifié sur `#151515` (couleur du fond du logo et du splash) : `--background 0 0% 8.2%`,
  cartes `10.6%`, gris neutres (sans teinte bleue), `--border 20%`. `dark:bg-[#151515]` retiré
  (`AppShell`, `ManagerLayout`) ; la carte de `Login` utilise `dark:bg-background`.
- [x] `theme-color` : une balise par mode dans `index.html`, puis `theme-provider.jsx` aligne la couleur sur
  le thème choisi dans l'app (`#ffffff` / `#151515`), y compris quand il diffère du système.

### Lot 3 — Chargement (P-1, P-7) — ✅ fait (V2.4.96)
JS téléchargé à l'ouverture par un employé : 1 292 Ko (364 Ko gzip) → 792 Ko (233 Ko gzip), −36 %.
Le precache PWA reste ≈ 2 050 Ko (tous les chunks y sont, téléchargés en arrière-plan une fois).
- [x] `App.jsx` : `EmployeeForm` et `Login` restent dans le bundle principal ; `History`, `Week`, `Profile`,
  `ResetPassword`, `ManagerLayout` et `ManagerPages` sont en `React.lazy` sous un `Suspense` (`PageLoading`).
- [x] `ManagerPages.jsx` : chaque panneau (dont `PayrollEngineTester`, 63 Ko) est un chunk séparé via
  `lazyPanel()` (`components/LazyLoading.jsx`), avec son propre `Suspense` : la barre latérale et les onglets
  restent affichés pendant le chargement. `ManagerLayout` entoure aussi `<Outlet/>` d'un `Suspense`.
- [x] `manualChunks` : `vendor-react`, `vendor-supabase`, `vendor-radix`, `vendor-icons` (un déploiement ne
  re-télécharge que le code de l'app ; 76 entrées de precache au lieu de 101 sans le chunk d'icônes).
- [x] Cycle `payroll/index.js` ⇄ `employee-week.js` cassé (imports directs) — Rollup signalait un ordre
  d'exécution cassé une fois le code découpé.
- [x] Après un déploiement, un chunk disparu déclenche `vite:preloadError` → un seul rechargement
  (`main.jsx`, garde d'une minute en `sessionStorage` contre les boucles hors ligne).
- [x] `LiveCrew.jsx` : pas de requête quand l'onglet est caché ; rafraîchit dès qu'il redevient visible.
- Vérifié dans Chromium avec Supabase simulé : un employé ne charge aucun chunk gestionnaire ; un
  propriétaire ouvre Direct, Calcul, Semaine/mois, Journal et Employés sans erreur.
- [ ] Non fait (volontairement) : charger une seule langue de `i18n.js` (206 Ko source). `use-t.js` retombe sur
  `dictionaries.en` pour toute clé française manquante, donc les deux restent nécessaires tant que ce
  repli existe.

### Lot 4 — Couleurs sémantiques — ✅ fait (V2.4.97)
Décision : `--primary` passe au vert du logo Messier (clair `132 55% 28%` #206f30, sombre `120 40% 55%`).
- [x] Jetons `--success` (teal, pour ne pas se confondre avec le vert d'action), `--warning`, `--info`
  + `-foreground`, clair et sombre ; entrées `tailwind.config.js`.
- [x] Couleurs en dur migrées vers les jetons (≈ 450 classes dans 47 fichiers) : amber/yellow/orange → warning,
  red/rose → destructive, emerald/green/lime/teal → success, sky/blue/cyan/indigo → info. Les variantes
  `dark:` correspondantes sont supprimées (215 → 16 `dark:` restants). CSS 52,7 → 44,4 Ko.
- [x] Une seule couleur « succès » ; les nuances `-600` trop pâles en clair disparaissent avec les jetons.
- [x] `button` / `badge` : variantes `success`, `warning`, `info` sur les jetons. Statut `saved` → badge `info`
  (bleu, comme avant) pour qu'un brouillon ne ressemble pas à l'action principale verte.
- [x] Corrections manuelles : bouton Enregistrer de la fiche = bouton principal (n'est plus bleu forcé) ;
  « Soumettre la journée » = `variant="success"` ; bouton du bandeau « vue employé » lisible sur l'ambre.
- [x] `src/lib/theme-contrast.test.js` verrouille les contrastes WCAG de tous les jetons (texte sur fond, carte
  et teinte /15 ; `-foreground` sur fond plein ; `--input` ≥ 3:1). Il a imposé `--destructive` sombre
  `0 92% 70%` (le `0 84% 64%` du Lot 2 tombait à 4,2:1 sur sa propre teinte).
- Reste : `bg-violet`/`slate` ponctuels et le gris de `badge neutral` (non sémantiques) ; couleurs hex du
  talon imprimé (`lib/paystub.js`), volontairement neutres.

### Lot 5 — Ergonomie terrain — ✅ fait (V2.4.98)
- [x] En-tête mobile : Actualiser / Thème / Langue / Déconnexion regroupés dans un menu ⋮ (`PhoneMenu`,
  entrées de 44 px) ; cloches, menu et lien Gestion à 44 × 44 (`size="touch"` dans `ui/button.jsx` :
  44 px sur téléphone, 40 px dès `sm`). Corrige aussi un débordement existant : à 360 px l'en-tête d'un
  gestionnaire faisait 378 px. En-tête et menu de `ManagerLayout` à 44 px.
- [x] 71 textes `text-[10px]`/`[11px]` → `text-xs` (12 px). Exceptions voulues : talon imprimé
  (`PayStubPrint`), pastilles de compte des cloches, glyphe EN/FR de 16 px, libellés de la barre du bas
  (11 px, sinon « Fiche de travail » est tronqué à 360 px).
- [x] Splash PWA retiré au premier rendu (double `requestAnimationFrame`) au lieu d'1 s fixe.
- [x] Manifeste `orientation: "any"`.
- [x] S-7 : `components/ErrorBoundary.jsx` — racine (`main.jsx`, texte bilingue statique), route (`App.jsx`,
  réinitialisée au changement de page) et panneau gestionnaire (`ManagerLayout`, la barre latérale reste).
  Boutons Recharger / Réessayer / Accueil ; le brouillon IndexedDB est restauré au rechargement.
- Vérifié dans Chromium (Supabase simulé) : pas de défilement horizontal sur 10 écrans à 360 et 1280 px ;
  plantage forcé (build de test) d'Historique et d'Équipe en direct → erreur récupérable, navigation OK.

### Lot 6 — Qualité du code — ✅ fait (V2.4.99, V2.4.178)
- [x] ESLint 10 (`eslint`, `@eslint/js`, `globals`, `eslint-plugin-react-hooks` 7, `eslint-plugin-react-refresh`)
  en devDependencies, script `npm run lint`, étape `npm run lint` dans `.github/workflows/ci.yml`.
  Config par environnement (Node pour configs/tests, service worker pour `push-sw.js`) ; les sources Apps
  Script (`apps-script-*.js`) sont exclues. 0 erreur, ~60 avertissements : les règles « React Compiler »
  de react-hooks 7 (`set-state-in-effect`, `refs`, `purity`…) et `exhaustive-deps` sont en *warn* — à
  corriger écran par écran, pas en masse.
- [x] Erreurs corrigées : clés i18n en double (`manager.filters.today/clearDay`, `profile.noReferences` — on
  garde la valeur déjà affichée), code mort (imports, variables, `validateOvertimeSmsText`, fonctions
  d'édition des écrans de taux en lecture seule `CongesIndemnityManager`/`EmployerContributionsManager`),
  `{ cause }` sur les erreurs relancées de la preuve de temps supplémentaire. Moteur de paie : aucun
  changement de logique (deux commentaires `eslint-disable` documentés).
- [x] P-10 : carte de feuille de temps extraite dans `components/manager/JobCard.jsx` (`React.memo`, props
  primitives, `onApprove`/`onUnlock` stables via ref) ; `useT()` mémoïsé par langue. Mesuré (build de test,
  20 cartes) : ouvrir la confirmation d'approbation re-rendait toutes les cartes, maintenant 0.
- [x] V2.4.178 : `EmployeeForm.jsx` 2 120 → 1 237 l. et `EmployeesPanel.jsx` 1 092 → 419 l., avec tests d'écran
  écrits avant le découpage (voir §6.3) ; 64 avertissements → 0 et `npm run lint --max-warnings=0`.
- [ ] Reste (optionnel) : la carte de notification de `ManagerDashboard`.

---

## 6. À faire / à préciser (mis à jour 2026-10-27, V2.4.188)

> Version vulgarisée, point par point : [`NOOB.md`](NOOB.md).
> Fiche de toutes les règles de paie (valeurs lues dans le code, options, état, sources) : Gestion › Avancé ›
> Règles de paie (`src/lib/pay-rules-reference.js`). Mettre à jour cette fiche avec toute nouvelle règle.

Liste unique des points ouverts. Les sections 1 à 5 gardent le détail ; ici, ce qu'il reste à **fournir**,
à **trancher** ou à **coder**, par priorité.

### 6.1 Paie — ce qui manque pour passer de « estimation » à « paie finale »

Le calcul des **heures** (8 h/jour, 1re heure sup. de la semaine à 1,5×, le reste à 2×, souper, options
par employé) est en production et testé. Les **montants** (avantages CCQ + retenues DAS) restent un banc
d'essai `requires_review` (`RULE_VERSION.status = "draft"`, `src/payroll/rules/2026.js`). Il manque :

**A. Documents officiels / sources** — reçus le 2026-10-13 et rangés dans `docs/reference/` ; le
détail article par article est dans `docs/rules/compensation-rules.md` (« Primary-source citations »).
- [x] **Convention collective ICI 2025-2029 (ACQ)** reçue. Confirme 8 h/40 h (20.02), 1re heure sup. de
  la **semaine** à 1,5× puis 2× (21.02 a), repas électricien 30 $ (20.07 3) c), chef d'équipe 8 %
  (22.03), 13 % (19.05), salaires (annexe C), retraite 9 % / 4,5 % (27.05). Écarts → §6.2.
- [x] **CCQ — avantages sociaux patronaux** : grille ACQ du 26 avril 2026, colonne (8) : compagnon
  8,875 $/h, apprentis **7,955 $/h** (corrigé par niveau en V2.4.101).
- [x] **CCQ — prélèvement** : 0,75 % salarié + 0,75 % employeur sur le salaire brut (salaire + prime de
  chef d'équipe CCQ + 13 %), grille ACQ note 10. Deux primes depuis V2.4.103 (migration 0083) :
  `team_leader_premium` = prime **hors CCQ** (hors 13 % et prélèvement, comme les talons) ;
  `team_leader_premium_ccq` = prime de chef d'équipe **CCQ** (dans le 13 % et le prélèvement).
- [x] **CNT 2026** : 0,06 %, maximum 103 000 $ (TP-1015.G §7) — valeurs du code confirmées ; le
  drapeau `unvalidated` de `rules/2026.js` peut passer à `false` avec la citation.
- [ ] **FDRCMO** : seuil 2 M$ et 1 % confirmés (TP-1015.G §8). La **masse salariale** se saisit dans
  Configuration › Paramètres › Paie (`payroll_employer_settings.annual_payroll_estimate`, vide au 2026-10-14).
  Messier Connexion n'existe que **depuis avril 2026** : la masse 2026 couvre avril à décembre. D'après le relevé
  du 3e trimestre (Drive du propriétaire, « Masse salariale RBQ »), la projection avril-décembre est **proche du
  seuil de 2 M$** (montants non reproduits ici : dépôt public). Le comptable doit confirmer comment compte une
  première année partielle avant la saisie. Lus le 2026-10-15 (Drive) : Loi D-8.3 (art. 3 : masse d'une **année
  civile** ; art. 12 : les cotisations au fonds de formation de la CCQ, 0,20 $/h, ACQ (12), **comptent comme
  dépenses de formation admissibles** si la CCQ atteste des déboursés ; art. 11 : excédent reporté) et le
  Sommaire 1 RLZ-1.S (lignes 71-75, 79.1-79.5 : cotisation = 1 % × masse − dépenses admissibles). **Guide RLZ-1.S.G
  (2025-10), lu le 2026-10-15** : la masse de la ligne 71 = total de la **case A des relevés 1** de l'année (§5.7),
  **sans prorata** pour une première année partielle (rien sur un début d'activités, un nombre de jours ou un seuil
  réduit) ; donc la masse 2026 = vrai total avril-décembre. Sous 2 M$ : ligne 75 = 0. Ligne 79.1 : si l'année
  dépasse 2 M$ et pas la précédente, les dépenses de formation de l'année précédente sont reportables. Exemption :
  certificat de qualité des initiatives de formation (CPMT). Employeurs associés : seulement pour le taux du FSS
  (lignes 50.1-50.2), pas pour le FDRCMO. Le guide ne parle pas du fonds de formation CCQ (c'est D-8.3 art. 12).
  FSS : même formule que `rules/2026.js` (1,2662 % + 0,3838 % × masse ÷ 1 M$ entre 1 et 7,8 M$), sans prorata.
  Reste au comptable : sociétés associées au 31 décembre ? Guide 2025 : revoir celui de 2026 à sa sortie.
- [ ] **CNESST** : taux de l'avis 2026 saisi (3,17 $/100 $, unité 80170, `payroll_employer_settings`,
  2026-10-13). Le relevé du 3e trimestre montre que la prime porte sur le **« Salaire admissible CNESST »**,
  pas sur tout le salaire : prime = 3,17 % × admissible, le reste est un « Excédent CNESST » non cotisé.
  `calculateCnesst` (`src/payroll/employer/cnesst.js`) cotise encore sur tout le salaire → **coût trop élevé**.
  Règle de l'excédent **à déterminer** (même des salaires annuels modestes en ont un : ressemble à un plafond
  par paie, non confirmé) — ne pas deviner : la confirmer avec des talons hebdomadaires + le relevé, ou le comptable.
  Indice : la grille ACQ, note (16), donne un **maximum assurable de 103 000 $ par année par salarié** ; hypothèse à
  vérifier : plafond par paie de 103 000 $ / 52 = 1 980,77 $ par semaine.
- [ ] **Cotisations syndicales** : confirmer pour chaque employé son association **et son local**
  (FIPOE / local 568 : formule électricien par local et période d'apprentissage) ; date de début exacte
  de l'ancienne règle SQC (seule la fin, 2026-06-27, est sourcée).

**B. Informations par employé (formulaires)**
- [ ] **TD1 (fédéral) et TP-1015.3 (Québec)** de chaque employé : les montants se saisissent dans
  Paramètres › Paie (`employee_tax_profiles`, gestionnaires/propriétaire seulement, V2.4.103) et sont
  utilisés par Talons, DAS et Calcul — reste à les saisir. Vide = montant personnel de base. Au 2026-10-23 : **0 sur
  36** (les 2 lignes existantes ne portent que la paie fixe / exclusions AE et RRQ). NAS : 1 seul en base, chiffre de
  contrôle invalide (à ressaisir) ; les autres manquent pour le rapport mensuel CCQ.
- [ ] **Paie de la semaine 43** (2026-10-11 → 10-17, 1re semaine payée par Sparklog) : au 2026-10-23, 328 fiches
  soumises non approuvées (21 approuvées), aucune ligne `payroll_period_ledger` après le cumul Dynacom du 10-10.
  Approuver, puis Paie de la semaine › Comptabiliser, avant la semaine 44.
- [x] **Cumul de l'année avant Sparklog** — fait le 2026-10-16 pour tous. Source : « Cumulatif des employés » de
  Dynacom du 2026-03-29 au 2026-10-17 (imprimé le 2026-10-15, Drive du propriétaire ; contient les NAS, jamais copié
  ici), qui couvre jusqu'à la **semaine 42** (chiffres identiques au talon D0038-0002 de la propriétaire et au talon de
  la semaine 41 d'un employé + une semaine). Une ligne `payroll_period_ledger` au **2026-10-10** par employé (35), écrite
  par SQL : mêmes colonnes que l'import de talon (`talon-import-core.js`), brut et normes du travail = « Gains RQAP »,
  `imported_talon` nul. Chaque colonne des 35 personnes = le grand total du PDF au centime. 5 anciens employés sans
  compte : `auth.users` sans mot de passe (`ancien.<nom>@messier-connexion.invalid`) → profil `is_paused`,
  `show_on_boards = false`. Exceptions : l'employé qui avait déjà une suite de cumuls (semaines 14 à 41) garde ses heures
  corrigées (882,75 h + 41,25 h approuvées en semaine 42) et un brut enchaîné ; ailleurs « Heures » = Dynacom, gonflées
  pour 4 chefs d'équipe (lignes de prime comptées comme heures) → seulement la ligne Heures des talons et le RE.
  `planPayrollWeek` part de cette ligne : Sparklog prend le relais à la **semaine 43**. Talons (V2.4.144) : plus de talon
  calculé (gris) pour les semaines payées par Dynacom avant le 2026-10-10 (`isDynacomOnlyWeek`, `src/lib/payroll-opening.js`),
  leurs cumulatifs partaient de zéro ; les talons importés (Simon B.) et la paie fixe (Karine) restent. V2.4.152 : la ligne
  du 2026-10-10 s'ouvre en semaine 42 avec l'icône « talon validé / importé » (`dynacom-cumulative-talon.js`, construit dans le
  navigateur, rien n'est écrit) : ce n'est pas un talon, seulement la colonne Cumulatif. Si Dynacom met à jour les cumuls
  (RRQ d'avant avril ajouté pour un employé le 2026-10-16, « probablement pour tous cette semaine »), réimporter le
  nouveau PDF en remplaçant les lignes du 10-10. L'import de talons (unitaire ou en lot, V2.4.129) reste disponible.
- [ ] **Échelon / période d'apprentissage** et taux horaire confirmés contre le certificat CCQ
  (liste de contrôle « CCQ monthly-report » du README).

**C. Validation et approbation**
- [ ] **3 à 5 vrais talons** à comparer au centime avec WebRAS (Québec) et PDOC (fédéral) : un apprenti,
  une semaine avec temps supplémentaire, une semaine avec souper/stationnement, une semaine avec
  chef d'équipe. Aujourd'hui un seul talon de référence (compagnon, D0033-0007).
- [ ] **Signature d'un spécialiste** paie/CCQ nommé (comptable ou firme de paie) — exigée par l'ADR 0001
  et le gabarit de PR avant de passer `RULE_VERSION.status` à `"validated"`.

**D. Règles non encore spécifiées (ne pas deviner)**
- [ ] Fériés et vacances payés en dehors de l'indemnité de 13 % (si applicable).
- [ ] Primes autres que chef d'équipe.
- [ ] **Trajets, km et frais par employé** (décision du 2026-10-18) : chaque trajet (temps et km), l'indemnité de
  plus de 65 km, le traversier, le stationnement et le souper deviennent une option dans la fiche de l'employé,
  avec « Chargé à Britton ». Grille et décisions : `NOOB.md` étape 7 (le champ de plus dans la fiche de temps n'est plus prévu, décision du 2026-10-26 ; retour maison
  payé dès 65 km ; plus de 65 km = temps de trajet CCQ dans le 40 h, non-CCQ au-delà ; un taux km par employé ; taux Britton
  inconnu). V2.4.155 (migration 0101) : saisie dans **Gestion V3 › Admin › Trajets et frais** (`TravelRulesManager.jsx`,
  `src/lib/travel-rules.js`) — table `travel_pay_rules` (employé × ligne × date d'effet ; lecture gestionnaire, écriture
  seulement par le RPC `set_travel_pay_rule`, gestionnaire / propriétaire, une ligne `travel_rule_set` au Journal par appel).
  Le moteur de paie ne les lit **pas encore** (défaut de chaque ligne = ce que l'app paie aujourd'hui).
- [x] Changement d'heure d'automne : choix gestionnaire de la 1re ou 2e occurrence de l'heure répétée
  (C-6, §1) — V2.4.177, voir §6.3.
- [ ] **Heures payées la nuit d'un changement d'heure** : le moteur de paie compte l'heure affichée
  (`minutesBetween(depart, fin)`), pas le temps réellement écoulé (`started_at` / `ended_at`). Une fiche qui chevauche
  l'heure répétée de l'automne est payée 1 h de moins que travaillée (au printemps, 1 h de trop). Au 2026-10-25 : aucune
  fiche de nuit ni de fin de semaine sur 1 564. Ne pas changer le moteur sans règle confirmée (spécialiste, ADR 0001).

### 6.2 Écarts code ↔ convention / documentation à trancher (aucune règle modifiée)
- [x] **Prélèvement CCQ 0,75 % vs 1,5 %** : tranché, 1,5 % = 0,75 % salarié + 0,75 % employeur.
- [x] **Retour à l'entrepôt** — tranché le 2026-10-13, codé en V2.4.101 (moteur 2.2.0, migration 0081) :
  jamais de temps sup. ; par défaut sans avantages ; case `return_with_benefits_to_8h` (bonus Messier) =
  avec avantages jusqu'à **40 h dans la semaine, moins 8 h par férié du lundi au vendredi** (32 h la semaine de l'Action
  de grâce ; correction du propriétaire le 2026-10-17, V2.4.151, moteur 2.6.0 — avant : 8 h par jour), le travail de la
  semaine d'abord, puis le retour par ordre de date ; cochée pour tous et en vigueur pour les journées depuis la
  **semaine 42 (2026-10-04)** (V2.4.121, moteur 2.5.0, `RETURN_WITH_BENEFITS`, migration 0089). La preuve > 8 h compte le retour ; le souper ne le compte jamais (V2.4.110). Détail :
  `docs/rules/compensation-rules.md` (RETURN). La colonne `return_overtime_no_benefits` est dépréciée
  (à supprimer dans une migration ultérieure).
- [x] **Méthode « Messier » (aperçu Talons / DAS / Paie de la semaine, par défaut)** — le retour sans avantages CCQ devient
  du régulier CCQ **jusqu'au plafond de la semaine** (40 h, moins 8 h par férié en semaine), partagé avec le retour qui
  garde déjà ses avantages ; le travail de la semaine d'abord ; jamais samedi / dimanche / férié (V2.4.151, moteur 2.6.0,
  correction du propriétaire le 2026-10-17 : « c'est pour la semaine »). Historique : V2.4.142 (moteur 2.5.1) l'avait mis
  à 8 h par jour. Trouvé avec Anthony, semaine 42 : jeudi 8 h 30 de travail + 2 h de retour → l'ancienne règle
  convertissait les 2 h (talon 1 724,75 $), la nouvelle les laisse sans avantages comme Dynacom (1 737,88 $ ; réel
  1 736,44 $, écart de 1,44 $ encore à expliquer avec le vrai talon). Corrige aussi un effet de bord : le retour converti
  d'une 1re job poussait le travail d'une job suivante en temps sup. `src/lib/messier-method.test.js`. Les fonctions
  Edge n'utilisent pas cette méthode (aucun redéploiement).
- [x] **Prime de chef d'équipe en temps sup.** — option par employé `team_leader_premium_overtime`
  (V2.4.102, migration 0082, décochée par défaut) : prime majorée ×1,5 / ×2 sur les heures sup.
  (`printedPayLines`, talon, coûts). Décochée = heures normales seulement, comme les talons Messier.
- [x] **Repas** — révisé le 2026-10-13 (V2.4.110, migration 0086, SUPPER v3) : souper dû dès **2 h 15 de temps
  sup. (1,5× ou 2×, les deux comptent)**, soit **10 h 15 de travail** dans la journée, **temps de retour jamais
  compté** (premier trajet non payé exclu aussi). `isMealEligible` / `dayWorkMinutesWithoutReturn` (moteur) et
  `reconcile_overtime_meal` appliquent le même seuil de 615 min. En vigueur depuis la **semaine 41 (2026-09-27)**
  (migration 0087 : demandes en attente revérifiées, 5 sur 8 retirées). Le 2e repas « après quatre autres heures
  supplémentaires » (20.07) n'est pas codé.
- [x] **Arrondi des journées** (V2.4.117, moteur 2.4.0, migration 0088) : chaque journée (travail + retour) payée au
  15 min le plus proche, compteur par employé jamais remis à zéro (`paid = round15(worked − compteur)`), ajustement
  sur le temps de retour s'il y en a, sinon sur la fin du travail (temps sup. au-delà de 8 h), depuis la **semaine 43 (2026-10-11)**, compteur à 0
  (V2.4.153, moteur 2.6.1, migration 0100 : 1re semaine payée par Sparklog, une erreur de la semaine 42 ne peut plus reporter de
  minutes ; avant : semaine 41, puis semaine 42 en V2.4.121, migration 0089). Détail :
  `docs/rules/compensation-rules.md` (DAY_ROUNDING). Pas appliqué à l'export Google Sheet (Apps Script).
- [x] **MÉDIC** — avis CCQ du 2026-04-20 (décision du CASIC) : 0,68 $ salarié / 2,93 $ patronal jusqu'au
  **2027-04-24** (la convention prévoyait 0,86 $ / 3,11 $). Daté depuis V2.4.130 (`MEDIC_RATES` / `medicRatesOn`,
  `src/payroll/ccq-benefits.js`) : **1,06 $ / 3,31 $ dès la semaine du 2027-04-25** (convention ; date CCQ, la
  FIPOE écrit le 30 avril). Taxe de 9 % sur les deux parts ; seule la part salariale est retenue, la part patronale
  est déjà dans l'avantage social patronal ACQ (8). À confirmer avec la CCQ avant cette date (gel prolongé ?) ;
  l'annexe C3 entière (salaires, ACQ (8), avantage imposable) change aussi à cette date : nouvelle grille à fournir.
- [x] **Samedi, dimanche, fériés** — moteur 2.3.0 (V2.4.102) : samedi tout en temps sup. (heure à 1,5× de la
  semaine si libre, puis 2×) ; dimanche et fériés (`company_holidays`, option `holidayDates`) à 2× dès la
  1re heure, sans utiliser l'heure à 1,5×. Tous les appels (écrans, export CCQ, `classify_week`) passent
  la liste des fériés (`src/lib/company-holidays.js`). La saisie employé reste bloquée ces jours-là.
- [x] **Dîner** — les employés l'enlèvent déjà de leur saisie (confirmé le 2026-10-13).
- [ ] `docs/rules/2026-das-payroll.md` dit l'impôt du Québec « placeholder », alors que `rules/2026.js`
  le marque vérifié contre TP-1015.F (2026-01) ; les commentaires de `EI` disent encore `_PLACEHOLDER`
  alors qu'il est vérifié (T4127). Les vrais restants : CNT, FDRCMO, CNESST.

### 6.3 Technique (code) — ouvert
- [x] **Cumul employeur AE / RQAP** (V2.4.104) : le cumul de l'année côté employeur était copié de celui de
  l'employé, donc la part employeur ne s'arrêtait pas à son propre maximum (jusqu'à ≈ 358 $ AE et 177 $
  RQAP de trop par employé et par année dans DAS/coûts). `src/payroll/ytd.js` (`engineYtdFromOpening`)
  le déduit du cumul employé × taux employeur / taux employé, plafonné ; utilisé par Talons, DAS et Calcul.
  Les retenues s'arrêtent aux maximums annuels (RRQ 74 600 $ puis 85 000 $, AE 68 900 $, RQAP 103 000 $)
  à condition que le cumul d'avant Sparklog soit saisi (`payroll_ytd`) et les semaines comptabilisées.
- [x] **Plafond de 1 000 lignes** (V2.4.109) : Supabase renvoie au plus 1 000 lignes par requête et coupe le
  reste sans erreur. Semaine/mois (16 sem.), DAS (14 mois), Talons, Coûts, Sommaire, export CCQ, RE et le
  registre comptabilisé lisaient tous les employés sur de longues périodes en une seule requête (≈ 760 fiches
  en 2 semaines : dépassement imminent). `src/lib/fetch-all.js` (`fetchAllRows`) lit toutes les pages avec un
  tri stable ; vérifié dans Chromium (2 345 fiches → 3 pages, 2 345 h au total).
- [x] **P-11** (V2.4.109) : `push_approved_batch` lit le courriel dans `profiles` (une requête) et n'appelle
  l'API Auth que pour un profil sans courriel (vérifié : 32/32 identiques à auth.users). Redéployée le
  2026-10-14 (version 30, avec `RETURN_WITH_BENEFITS` de V2.4.121 et `_shared/payroll_engine.js` 2.5.0).
  `classify_week` (inutilisée par l'app) est encore sur le moteur 2.3.0 : à redéployer si on s'en sert.
- [x] **Sommaire hebdomadaire imprimable** (V2.4.112) : Rapports › Semaine/mois › Vue semaine › « Imprimer le
  sommaire de la semaine ». `src/lib/weekly-report.js` (`buildWeeklyReport` / `buildWeeklyReportHtml`) : chaque job
  (n° OT, heures rég./1,5×/2×/retour s.a., km, statut), sommaire par employé, paie, coût employeur et DAS
  via `computeEmployeeWeekTalon` (mêmes chiffres que Talons/DAS) ; les cotisations par heure de
  `employer_contributions` déjà calculées par le moteur (RRQ, AE, RQAP, FSS, CNESST, avantages sociaux, équipement)
  ne sont pas recomptées. Jobs soumises/modifiées imprimées mais signalées non approuvées ; rôles hors CCQ sans paie
  (comme l'écran DAS). Aucun NAS ni adresse.
- [x] **Gestion V3** (V2.4.115–116, à côté de la V2) : sélecteur **V2 | V3** dans l'en-tête de la Gestion
  (gestionnaire/propriétaire, mémorisé sur l'appareil, `src/lib/manager-ui-version.js`). V3 = menu `MANAGER_NAV_V3`
  (`src/lib/manager-nav.js`) : groupes ouverts par défaut, libellés simples, accueil sur « À traiter » ; mêmes pages,
  mêmes chemins et mêmes droits que la V2 (test : un admin a les mêmes pages en V2 et V3). La V2 est inchangée.
  - **À traiter** (`components/manager/TodoInbox.jsx`, `lib/todo-inbox.js`) : jobs soumises par employé et par jour,
    preuve / souper / stationnement attachés (la révision des soupers n'avait plus d'écran), anomalies à part,
    approuver la journée / l'employé / tout sans anomalie, retourner, rappeler et débloquer les non-soumis.
  - **Paie de la semaine** (`components/manager/PayrollWeek.jsx`, `lib/payroll-week.js`) : semaine choisie une fois
    (dernière semaine terminée par défaut, `?week=`), état par employé (prêt / comptabilisé / en attente / semaine
    précédente à comptabiliser d'abord / semaine plus récente déjà comptabilisée), « Calculer et comptabiliser les N
    prêts » = exactement l'écriture de Comptabiliser dans Calcul (`ledgerRowFor` : instantané de clôture, n° de talon,
    talon conservé, un vrai talon importé n'est jamais remplacé), impression de tous les talons, approbation
    officielle (propriétaire), DAS de la semaine + CSV, sommaire imprimable, lien rapport CCQ.
  - **Talons** : « Imprimer / PDF » de la semaine inclut maintenant les semaines comptabilisées (talon conservé),
    auparavant ignorées ; `lib/talon-print.js` réunit talons conservés et aperçus dans un seul document.
- [x] **Gestion V3 — menu simplifié, V2 figée** (V2.4.132) : `MANAGER_NAV_V3` passe de 26 à 13 entrées. Pages à onglets
  sur de nouveaux chemins (`todo`, `v3/time`, `v3/pay-history`, `v3/team`, `v3/reports`, `v3/config`) : `TabbedPage`
  (`ManagerPages.jsx`, `?tab=`) rend chaque page V2 telle quelle ; chaque onglet garde la règle de sa page d'origine
  (`tabs[].from`, `visibleTabs` / `resolveTab`, `authorizationFor().tabs`, `docs/security/authorization-matrix.md`).
  `PayrollPage({ compact })` (V3) ; `V2_TO_V3` / `switchTarget` (changement de version) / `v3MenuPath` (surbrillance).
  Verrous : `MANAGER_NAV` figé en littéral (`manager-nav.test.js`), routes V2 → même export → même rendu
  (`manager-routes.test.js`). Toute évolution de menu se fait dans la V3 (la version par défaut depuis V2.4.183).
- [x] **Menu de la Gestion repliable** (V2.4.133) : bouton en haut à gauche de l'en-tête (ordinateur seulement ; le
  téléphone garde son tiroir) qui masque ou affiche tout le menu de gauche, mémorisé sur l'appareil
  (`sparklog.managerNavHidden`, `ManagerLayout.jsx`). Le mode « rail » (« Réduire le menu ») reste.
- [x] **Feuilles de temps V3 : nom de l'employé en premier** (V2.4.134) : `JobCard({ nameFirst })`, passé par
  `ManagerDashboard({ nameFirst })` depuis l'onglet V3 seulement — nom complet en tête de carte, « OT • date » et
  téléphone / courriel dessous, dans une colonne fixe (le nom n'est plus réduit à une lettre sur un écran étroit).
  La carte V2 est inchangée (capture identique à `main`).
- [x] **Feuilles de temps V3 : filtre « Entrées à la main »** (V2.4.135) : bouton bascule (★) à côté des compteurs,
  `ManagerDashboard({ manualFilter })` depuis l'onglet V3 seulement, `?manual=1` dans l'URL. Filtre sans nouvelle
  requête les fiches déjà chargées dont la source est `manual` (`onlyManualEntries`, `src/lib/entry-source.js`) ;
  pour tout voir sur une longue période, choisir un employé ou une journée (sinon « Charger plus »). V2 inchangée.
- [x] **Vérification de la capture Field Service** (V2.4.122) : au remplissage automatique, `workOrderIssues`
  (`src/lib/work-order-parse.js`) avertit l'employé si le # OT, l'heure de début / d'arrivée / de fin ou la
  « Distance réelle parcourue (km) » est vide (« --- ») ou absente, ou si « Miles Traveled » (FR : « Distance parcourue (miles) ») ≠ distance réelle
  (km entiers). Une valeur vide n'est plus remplie par un nombre d'un champ plus bas. L'enregistrement de la
  nouvelle fiche est **bloqué** tant qu'une nouvelle capture ne montre pas un ordre complet (gardé dans le brouillon local).
  V2.4.125 : écran français étroit — étiquettes coupées sur deux lignes avec la valeur entre les deux
  (« Distance » / « parcourue (miles) », « Distance réelle » / « parcourue (km) ») : les distances sont repérées à partir
  du mot « Distance » (avec « (miles) » = champ miles, sinon distance réelle) ; date 2026-10-14 lue aussi.
  V2.4.126 : capture coupée sous « Heure de début » — la date + l'heure juste au-dessus de « Heure de fin » servent
  d'heure de début (jamais l'horloge du téléphone : une date doit précéder l'heure). V2.4.127 : tolère les icônes
  calendrier/horloge lues comme caractères parasites ; « Voir le texte lu sur la capture » (+ Copier) dans la fenêtre de
  vérification, pour diagnostiquer une mauvaise lecture (texte en mémoire seulement, jamais enregistré).
  Saisie à la main (sans capture) : Enregistrer ouvre d'abord « Fiche entrée à la main » (mieux avec la capture ;
  vérifier que Field Service est pareil à la fiche) avec « Prendre une capture » ou « Field Service est exact, enregistrer ».
- [x] **Inventaire : plusieurs captures d'un coup, 2 suffisent** (V2.4.137, migration 0092) : bouton « Choisir les
  captures (plusieurs d'un coup) » à l'étape inventaire de fin de journée (`input multiple`). `planInventoryUploads`
  (`src/lib/inventory-screenshots.js`) : ordre de prise (`lastModified`, sinon ordre du sélecteur) ; 3 fichiers ou plus =
  cases 1 à 3 ; moins = cases manquantes seulement ; le surplus n'écrase jamais une case remplie. Ce qui compte est le
  **nombre de lignes** de la liste, pas le nombre de photos : la soumission exige **au moins une** capture
  (`validate_job_submission_contract`, 0092 ; `inventoryCaptured`) ; « Continuer » s'active dès une capture ; l'employé voit
  « Liste complète : N lignes sur N » ou « X lignes lues sur N » (`fetchInventoryReading`, lecture OCR existante, au plus
  20 lectures espacées de 4 s, indicatif). Gestion › Inventaire : plus d'état « partiel » au nombre de photos, la liste est
  complète quand les lignes lues = « N de N ». Historique : badge vert dès une capture. V2.4.145 : bouton « Qui fait
  l'inventaire » dans Gestion › Inventaire (liste à cocher des employés actifs hors bureau, `inventoryCandidates`),
  même case `profiles.inventory_screenshots_enabled` que la fiche Employés, enregistrée à chaque clic.
- [x] **Inventaire : produits défectueux** (V2.4.146, migration 0097, appliquée par l'intégration Supabase à la fusion ;
  fonctions `process_inventory_screenshot` et `delete_inventory_screenshots` à redéployer). Après les captures de la liste,
  l'employé répond à « Y a-t-il des produits défectueux dans Field Service ? » ; « Oui » exige une capture de la section
  (case 4, `DEFECTIVE_SLOT`) avant « Continuer » (`inventoryStepComplete`). La lecture (`parse.ts`) sépare les lignes sous
  le titre « Produits défectueux » (`inventory_items.section = 'defective'`, total « N de N » de la section dans
  `inventory_screenshots.defective_total`) ; la case 4 ne garde que ces lignes. Elles ne comptent jamais dans la liste
  (`summarizeInventoryDay` → `defective`) ; Gestion › Inventaire : pastille « N défectueux », tableau à part, photo, total
  d'équipe (`sumCrewDefective`). Le pied « 1 - 15 of 17 » (téléphone en anglais) est lu aussi. Seules les cases 1 à 3
  satisfont la soumission (0092 → 0097). La réponse « Non » n'est pas enregistrée.
- [x] **Confirmation avant approuver / refuser / supprimer** (V2.4.147) : toute décision passe par `useConfirmDialog`
  (« Oui / Non ») avec le nom, la date et le montant : approbation d'une fiche ou d'une journée (même sans anomalie),
  accepter / refuser un souper ou un stationnement (À traiter, Feuilles de temps, Soupers ; un refus ne s'annule pas dans
  l'app), retirer un déblocage, supprimer une absence, talon officiel, Comptabiliser / Garder la semaine (Calcul).
  `src/lib/confirm-actions.test.js` vérifie chaque gestionnaire (`await confirm(` avant l'écriture). Le 2026-10-16, un
  stationnement refusé par erreur (4,32 $, 16 oct.) a été remis « en attente » par SQL, avec une ligne
  `parking_review_reset` au Journal.
- [x] **Soupers / stationnements refusés hors des rapports** (V2.4.148) : Rapports › Semaine/mois (`PeriodSummary`)
  additionnait aussi les demandes refusées ; Coûts et le sommaire imprimé ne gardaient déjà que « en attente » et
  « accepté ». Les trois lisent maintenant `COUNTED_CLAIM_STATUSES` (`src/lib/claim-status.js`, test `claim-status.test.js`).
  Talons, DAS et l'export Google ne contiennent ni souper ni stationnement.
- [x] **Fériés et 13 % congés exacts partout** (V2.4.149, migration 0098) : un férié n'est pas payé sur le talon ; il
  l'est par la part de **5,5 %** du 13 % (convention 19.04-19.05 : 6 % congés + 5,5 % fériés + 1,5 % maladie), remise à la
  CCQ. Les écrans le traitent comme une fin de semaine (`src/lib/workdays.js`) : Équipe en direct › semaine (« Férié »,
  plus de « Rien d'entré »), « N'a pas soumis hier » et À traiter (`previousWorkday` saute les fériés). Migration 0098 :
  toutes les dates fixes 2026-2028 de la convention (manquaient 3 et 6 avril, 18 mai, 24 juin, 3 juillet 2026 et 2-3 janvier).
  13 % : Coûts et Semaine/mois le calculaient sur la main-d'œuvre **avec la prime de chef d'équipe hors CCQ** et sans la
  méthode Messier ; ils utilisent maintenant `congesOverWeeks` / `weekCongesIndemnity` (`src/payroll/employee-week.js`),
  identique au talon au centin (test `conges-indemnity.test.js`, 36 cas). Le sommaire imprimé suit aussi la méthode
  Messier (par défaut des talons). Cumulatifs : le registre reprend le 13 % du talon (`vacancesCcq`), inchangé.
- [x] **Verrou des cumulatifs Dynacom** (V2.4.150, migration 0099) : la ligne `payroll_period_ledger` du 2026-10-10 (fin de
  la semaine 42) EST le cumul Dynacom ; « Comptabiliser » une semaine ≤ 42 la remplaçait par un calcul parti de zéro.
  `isClosedBeforeSparklog` (`src/lib/payroll-opening.js`) : Calcul refuse (`payroll.postClosedWeek`), Paie de la semaine
  affiche « Payée par Dynacom » (état `closed`). Base : trigger `protect_dynacom_cumulative` (≤ 2026-10-10, utilisateurs de
  l'app) — seuls un vrai talon (importé / validé, `imported_talon.header.source <> 'calcul'`) et l'approbation officielle
  passent ; calcul et suppression refusés (`dynacom_cumulative_locked`). Maintenance SQL / service role non touchées.
  Le 2026-10-17, à la demande du propriétaire, les approbations des semaines 42 (60 fiches, 5 employés) et 43 (12 fiches,
  1 employée) ont été annulées par SQL (remises « soumises », lignes `approval_reverted` au Journal) ; les lignes déjà
  envoyées restent dans la feuille Google (la réapprobation les saute : clé JobID). V2.4.153 : À traiter ne liste plus les
  fiches jusqu'au 2026-10-10 (`gt("job_date", DYNACOM_CUMULATIVE_END)`, `TodoInbox.jsx`) ; elles restent dans la base, Feuilles
  de temps et l'historique (registre des heures). Les soupers / stationnements en attente de ces semaines restent listés à part.
- [x] **Stationnement : plusieurs reçus de parcomètre par job** (V2.4.141, migration 0095, appliquée par l'intégration
  Supabase à la fusion dans `main`, sous la version du nom de fichier). Toujours **une** demande par job
  (un montant total, une révision, plafond 20 $/jour, Coûts/Semaine/sommaire inchangés) ; 1re photo dans `storage_path`,
  les autres dans `extra_storage_paths` (≤ 9, total 10). Fiche : « Choisir les reçus (plusieurs d'un coup) », puis
  « Ajouter des reçus » / « Remplacer tous les reçus » tant que la demande est en attente (`src/lib/parking-receipts.js` :
  `orderPickedFiles`, `mergeParkingPaths`, `parkingReceiptPaths`). Trigger `validate_parking_receipt_paths` : chaque photo
  dans le dossier de l'employé, sans doublon ; `find_orphaned_evidence_objects` compte les photos supplémentaires.
  Justificatifs et À traiter montrent toutes les photos ; la suppression d'une job (Historique) les efface toutes.
  Avant : choisir un 2e reçu remplaçait le 1er, devenu orphelin (3 reçus effacés par le ménage du 2026-10-16).
- [x] **Communications : plusieurs photos et des PDF par message** (V2.4.143, migration 0096, appliquée par l'intégration
  Supabase à la fusion) : `manager_broadcasts.attachments` = `[{path, kind: image|pdf, name}]` (≤ 10, contrainte), anciens
  messages repris depuis `image_path` ; `image_path` garde la 1re photo pour une app pas encore mise à jour. Bouton
  « Joindre des photos ou des PDF » (`multiple`, coller/glisser plusieurs captures), retrait fichier par fichier ; photos
  compressées en JPEG, PDF tels quels (≤ 10 Mo) ; un envoi raté retire les fichiers déjà envoyés. Bucket `broadcast-images` :
  JPEG/PNG/WebP/PDF seulement, 10 Mo par fichier. Affichage commun `components/BroadcastAttachments.jsx` (fenêtre, cloche,
  journal de la Gestion ; PDF = lien « Ouvrir »). Renvoyer un message garde ses pièces jointes. `src/lib/broadcast-attachments.js`.
- [x] **Étoile rouge sur les fiches entrées à la main** (V2.4.123, migration 0090) : table `job_entry_sources`
  (`screenshot` / `manual`, une ligne par nouvelle fiche, écrite par l'employé après l'enregistrement, lisible par qui
  voit la job, ni modification ni suppression). `src/lib/entry-source.js` ; ★ rouge + légende dans Feuilles de temps
  et À traiter. Pas de ligne (anciennes fiches, feuille d'urgence, écriture ratée) = pas d'étoile. Indicatif seulement.
- [x] **Export Google Sheet : colonnes trouvées par leur en-tête** (V2.4.138) : `apps-script-doPost.js` écrivait chaque
  valeur à une position fixe (A Date, B Employé, C Courriel…) ; l'en-tête de « Data » avait été déplacé/renommé et le
  script déployé ne correspondait plus au dépôt (lignes de Simon et d'Abdoul dans deux ordres différents), donc « Stats »
  (qui lit par en-tête) lisait le téléphone comme « Départ » et la fin comme « KM » → 0h00 dans Sem42. Nouveau `doPost` :
  chaque valeur sous son en-tête (`COLUMNS`, accents/casse ignorés), en-tête manquant ajouté à la fin, colonnes perso
  laissées tranquilles ; testé hors ligne (feuille vide, colonnes mélangées, doublon, 1er trajet non payé). « Data »
  réparée le 2026-10-16 (19 lignes réalignées, valeurs vérifiées contre `jobs`). **À faire par le propriétaire :** coller
  le nouveau `doPost` dans Apps Script puis Déployer › Gérer les déploiements › Nouvelle version (sinon l'ancien code
  écrit encore aux mauvaises positions).
- [x] **Exclusion du RRQ** (V2.4.138, migration 0093) : case « Exclu du RRQ » dans Paramètres › Paie
  (`employee_tax_profiles.rrq_exempt`), jumelle de « Exclu de l'AE » : `calculatePayroll` met `bases.rrq = 0` (aucune
  cotisation, salarié ni employeur), talon « Gains RRQ » à 0, case aussi dans Calcul ; fiche des règles (`rrq-exempt`,
  à confirmer). Cochée en production pour l'employé à qui Dynacom ne retient aucun RRQ (0 $ de gains et de cotisation
  RRQ au cumul). Jamais déduite automatiquement ; garder la preuve du choix (65-69 ans avec rente, etc.).
- [x] **Paie fixe et exclusion de l'AE** (V2.4.133, migration 0091) : Paramètres › Paie › par employé, « Paie fixe :
  heures / semaine » + date de début, et case « Exclu de l'AE » (Loi sur l'AE 5(2)b), > 40 % des actions). La
  propriétaire (Karine) reçoit 40 h × 51 $ chaque semaine sans job, une ligne « Régulier à taux horaire », sans CCQ ni AE :
  talon D0038-0002 reproduit au centime (`employee-week.test.js`). Présente dans Talons, DAS, Calcul, Paie de la semaine,
  Coûts, Semaine/mois et le sommaire imprimé (`src/lib/fixed-pay.js` ; coût : `weeklyCosts` de `src/lib/employer-cost.js` depuis V2.4.181). Hors rapport CCQ.
  En production depuis le 2026-10-15 : `employee_tax_profiles` de Karine = 40 h, `fixed_pay_start` 2026-10-04 (semaine
  42, celle du talon importé ; 2026-04-05 si on veut son coût d'avril à septembre dans les rapports), `ei_exempt` vrai ;
  TD1 / TP-1015.3 vides (montant de base, qui reproduit l'impôt du talon). Reste : confirmer si sa paie est cotisable à
  la CNESST.
- [x] **Capacité à 60 employés** (mesuré le 2026-10-16, détail dans NOOB.md « Limites de l'app ») : 29 actifs ≈ 410
  jobs/sem. ; base 21 Mo, Storage 26 Mo, Supabase Pro + compute Small (90 connexions). Trois points corrigés en
  V2.4.140 : (1) **À traiter** charge 600 jobs soumises, **plus vieilles d'abord** (`QUERY_BUDGETS.todoSubmittedJobs`,
  pairs approuvés `todoApprovedPeers` 800, `.in()` des preuves découpé par `inListChunk` 150 ; `anomalySubmittedJobs`
  reste à 200 pour Feuilles de temps) ; (2)-(3) migration 0094 : `cron_secret` aléatoire dans Vault,
  `invoke_scheduled_function(fn)` (pg_net, anon JWT + en-tête `x-cron-secret`, URL et anon dans Vault
  `sparklog_project_url` / `sparklog_anon_key`, posés hors dépôt), `verify_cron_secret` (service_role seulement) ;
  `ccq_rates_daily_sync` et `cleanup_overtime_evidence` acceptent la clé service_role **ou** ce secret (redéployées
  v16 / v17). Tâches : `ccq-daily-sync` 09:00 UTC (testée : 200, 5 grilles) et `cleanup-evidence-daily` 08:17 UTC
  (401 vérifié sans secret ; 1re exécution la nuit du 2026-10-16 : 24 fichiers sans fiche — 21 preuves, 3 reçus de
  stationnement — seront effacés, rien n'expire avant le 2026-10-27). Encore ouvert : Google Sheet (200 onglets max,
  un « SemXX » par semaine → nouveau fichier chaque année) ; OCR.space gratuit (25 000/mois, ≈ 500/jour par IP,
  1 Mo) : vérifier `OCR_SPACE_API_KEY`.
- [x] **NAS chiffré dans Supabase Vault** (V2.4.156, migration 0102) : la colonne `employee_sensitive.nas` était en
  clair (protégée par RLS, mais visible dans une copie de la base). Chaque NAS devient un secret Vault (chiffré, clé hors
  de la base) ; la table ne garde que `nas_secret_id`, la colonne en clair est supprimée. Les 4 RPC gardent la même
  signature, les mêmes droits (propriétaire) et le même Journal ; `set_nas` refuse un chiffre de contrôle faux (Luhn,
  `sin_is_valid`, même règle que `src/lib/sin.js` côté écran) ; supprimer la ligne supprime le secret. Testé sur un Postgres
  local avec un Vault simulé (migration rejouée deux fois, chaque RPC, effacement, suppression, Journal sans NAS) ; droits
  Vault du rôle `postgres` vérifiés en production. Limite : un administrateur Supabase connecté peut encore déchiffrer
  (2FA actif sur le compte). Le seul NAS en base au 2026-10-19 échoue le chiffre de contrôle : à corriger par la propriétaire.
- [x] **Double authentification des comptes de gestion** (V2.4.157, migration 0103) : propriétaire, gestionnaires et
  administrateurs entrent un code d'application d'authentification (Google / Microsoft Authenticator) après le mot de passe.
  1re connexion : code QR + 1er code (`MfaEnroll`) ; ensuite le code à chaque nouvelle session (`MfaChallenge`), avant toute
  page (`ProtectedRoute` → `MfaGate`). Base : sans session `aal2`, `get_my_role()` rend `employee` et `is_privileged()` faux,
  donc un mot de passe volé n'ouvre ni la Gestion ni les NAS, quel que soit le client ; `set_travel_pay_rule` aussi. Fonctions
  Edge de gestion (`create_employee`, `delete_user`, `reset_employee_password`, `push_approved_*`, `send_*`, `infra_metrics`,
  `ccq_rates`, `classify_week`) : `isAal2(token)` après la vérification du rôle → `mfa_required` (à redéployer). Profil ›
  Double authentification : appareils, appareil de secours, retrait (jamais le dernier d'un compte de gestion). Employés :
  bouclier vert (activée) / orange (obligatoire, pas encore activée), RPC `mfa_enrolled_users`. Mot de passe dans une fuite
  connue (protection Supabase activée le 2026-10-19) : message clair à la création / au changement (`authErrorKey`).
  Téléphone perdu : le développeur supprime les appareils du compte dans Supabase (`auth.mfa_factors`), la personne en
  ajoute un nouveau à la connexion suivante. Vérifié dans Chromium (Supabase simulé) : inscription, mauvais code, bon code,
  code à la connexion, employé jamais bloqué, icônes, Profil ; migration testée sur Postgres local (chaque rôle, aal1 / aal2).
- [x] **Inventaire : quantités négatives et entrepôt par région** (V2.4.158–161, branche Hermes + lecture ; migrations
  0104–0105 ; fonction `process_inventory_screenshot` à redéployer). Field Service peut afficher « -1,00 » (plus installé
  que le camion n'en avait) : la lecture mettait le « - » dans le nom (« Gradateur mural intelligent Jasco - ») et gardait
  1,00, et la table refusait les quantités < 0. `parse.ts` lit le signe (un « - » après une espace, juste avant la quantité ;
  « Sinope - 3000W » reste un nom) ; 0104 : contrainte -99 999 à 99 999, ligne du 2026-10-19 corrigée,
  `inventory_negative_alerts()` (gestionnaire) = dernière liste de chaque employé (7 jours) avec une quantité négative ;
  0105 : la fonction renvoie l'employé, l'appareil et la date ; `dismiss_inventory_negative_alert` (gestionnaire /
  propriétaire, aal2) retire l'avis pour cet employé et ce jour (`inventory_alert_dismissals`, ligne
  `inventory_negative_dismissed` au Journal). Rien ne change pour l'employé. Gestion › Inventaire : carte du stock négatif
  (qui, quoi, quand, bouton pour retirer l'avis), quantité en rouge, compteur sur « Inventaire » dans le menu
  (`src/lib/inventory-alerts.js`). « Entrepôt par région » : total des appareils des employés d'une région ce jour-là
  (`inventoryRegionChoices` / `sumRegionInventory`). `supabase/.temp/` (état local du CLI) n'est plus suivi par git.
- [x] **Sommaire de la semaine : heures CCQ sans le temps sup.** (V2.4.162) : « Heures CCQ » comptait régulier + 1,5× + 2×
  (comme le rapport CCQ), donc le temps sup. apparaissait deux fois à côté de la colonne « Temps sup. » (Anthony, semaine
  43 : 34 h 19 « CCQ » dont 2 h 19 sup.). Le sommaire imprimé montre maintenant « Heures CCQ (régulier) » (32 h), « Temps
  sup. » (heures CCQ à 1,5× et 2×) et « Hors CCQ » : Total = régulier + temps sup. + hors CCQ (`ccqRegularMinutes` /
  `ccqOvertimeMinutes`, `src/lib/weekly-report.js`). Un rôle hors CCQ garde toutes ses heures dans « Hors CCQ ».
  Colonnes « Souper » et « Stationnement » ajoutées (montants de la semaine, demandes acceptées ou en attente, avec totaux).
- [x] **Absences : catégorie « Maladie » et registre** (V2.4.163, migration 0106 : contrainte `employee_time_off_category_chk`
  avec `'maladie'`) : choix « Maladie » partout où on saisit une absence (Employés › Absences, fiche de l'employé). Carte
  « Registre maladie » dans Absences : par employé et par année (sélecteur, année courante + années avec une entrée),
  nombre d'absences, **jours ouvrables** (sans fins de semaine, fériés ni vacances de la construction, `company_holidays`),
  heures des parties de journée, dates et notes, total, export CSV. `sickLeaveRegister` / `sickLeaveYears`
  (`src/lib/timeoff.js`) ; une période qui chevauche le 1er janvier compte dans chaque année. Les règles récurrentes ne
  comptent pas. Indicatif : aucun effet sur la paie (le 13 % comprend déjà la part maladie de 1,5 %).
- [x] **Communications : modifier un message envoyé, le retirer pour ceux qui ne l'ont pas lu** (V2.4.164, migration 0107 ;
  fonction `send_push` à redéployer). Bouton ✏️ dans « Notifications envoyées » (`BroadcastEditForm.jsx`) : texte et pièces
  jointes, en tout temps ; RPC `edit_broadcast` (gestionnaire, aal2) garde l'ancienne version dans `broadcast_revisions`
  (« Versions précédentes », gestionnaires seulement), étiquette « Modifié le … » chez l'employé. Si quelqu'un a déjà fait OK,
  case « Redemander la lecture » (cochée par défaut) : leur OK est effacé, la fenêtre revient et une push « Message modifié : … »
  part vers ceux qui n'ont pas fait OK (`send_push` `{ reread: true }`, seulement le dernier gestionnaire qui a modifié) ; sans
  relecture, aucune push. Bouton « Retirer pour ceux qui ne l'ont pas lu » : RPC `withdraw_broadcast_unread` met
  `broadcast_recipients.withdrawn_at` ; les politiques RLS cachent alors le message à l'employé (cloche, fenêtre, compteur,
  même une app pas à jour) ; ceux qui ont fait OK le gardent. « Renvoyer » saute les retirés. Une ligne `broadcast_edited` /
  `broadcast_withdrawn` au Journal. `src/lib/broadcast-edit.js`, `broadcast-upload.js`. Testé sur Postgres local (rôles,
  pièces jointes invalides, relecture, retrait, employé retiré ne peut ni voir ni se « dé-retirer »).
- [x] **Anomalie « OT déjà utilisé »** (V2.4.165, migration 0108) : rien n'empêchait deux fiches d'avoir le même n° d'OT
  (au 2026-10-21 : 9 OT en double sur 1 355 fiches, dont des retours sur la même job). Rien n'est bloqué : À traiter et
  Feuilles de temps demandent à la base, pour les jobs soumises affichées, les **autres** fiches au même n° (tout employé,
  toute date, tout statut) — RPC `ot_reuse_for_jobs` (gestionnaire, aal2), `normalized_ot` (4 chiffres ou plus, espaces
  retirés : « FORMATION », « OK KARINE » ignorés) + index. Ligne « OT 200451 déjà utilisé : Patrick G. · 14 oct. (soumis) »
  avec les autres anomalies (la journée sort de « Tout approuver sans anomalie »). La même fiche entrée deux fois (même
  employé, jour et heures) reste l'anomalie « Doublon ». `otReuseAnomalies` (`src/lib/job-anomalies.js`), `src/lib/ot-reuse.js`
  (si l'appel échoue, les autres anomalies s'affichent quand même). Le message « Un job avec l'OT … existe déjà » du formulaire
  ne vient pas d'une règle sur l'OT (aucune en base) : à revoir si on ajoute un avertissement côté employé.
- [x] **Configuration › Contacts** (V2.4.166, Gestion V3, aucune migration) : onglet à côté de Formulaires et Références,
  sur les **mêmes lignes** que Références › Contacts (`profile_references`, section `contacts`, cartes `contact`) — le Profil
  des employés les affiche comme avant. Par section (Britton, HILO…) : ajouter / modifier / retirer / déplacer un contact,
  ajouter / renommer / masquer / supprimer / déplacer une section (retirer le dernier contact supprime la section, après
  confirmation). Chaque contact : nom, titre (ex. Contremaître, champ `role` existant), téléphone, courriel, note et **rôles**
  (`roles`, liste de base `CONTACT_ROLES` : inventaire, temps supplémentaire, stationnement, répartition, support installation,
  paie — plus des rôles perso tapés par le gestionnaire, au plus 10). Filtre par rôle. Rôles = affichage seulement :
  étiquettes dans Profil › Contacts (`ReferenceContent`) ; aucune autre partie de l'app ne les lit. Les autres blocs d'une
  section (titre, texte) restent en place. `src/lib/contacts.js`, `ContactsManager.jsx`, `sanitizeRoles` (`reference-blocks.js`).
- [x] **Nouvelles inscriptions et anciens employés** (V2.4.167, migration 0109) : compteur rouge sur « Employés » (V2) et
  « Équipe › Employés » (V3, aussi sur l'en-tête du groupe fermé : `groupBadgeTotal`) = comptes jamais activés
  (`profiles.first_activated_at` nul), inactifs, courriel validé, pas anciens employés — RPC `pending_signups()`
  (gestionnaire, aal2). Il baisse dès l'activation (`SIGNUPS_EVENT`). Employés : nouvelles inscriptions en haut, étiquettes
  « Nouvelle inscription » / « Courriel non validé » / « Mis à pied » / « Ne travaille plus » / « Inactif », filtres. Ancien
  employé : `profiles.departure_status` (`mise_a_pied` / `depart`) + note ; le marquer rend le compte inactif, le réactiver
  efface la marque (trigger `sync_departure_status`) ; ligne `departure_change` au Journal. Les 5 anciens importés de Dynacom
  (`@messier-connexion.invalid`) passent à « Ne travaille plus ». `src/lib/signups.js`. **Courriels d'inscription** : le service
  intégré de Supabase plafonne les courriels par heure (le 2026-09-23, 14 inscriptions sur 15 sans courriel) ; pour une
  arrivée en groupe, désactiver « Confirm email » le temps des inscriptions (les comptes restent inactifs jusqu'à
  l'activation) ou brancher un SMTP et monter la limite (Authentication › Rate Limits).
- [x] **Nouvel(le) employé(e) et premier jour de travail** (V2.4.168, migration 0110) : le choix « Embauche / départ » de la
  fiche Employés (anciennement « Ancien employé ») offre aussi « Nouvel(le) employé(e) », qui exige la date du premier jour
  (`profiles.start_date`, après aujourd'hui ; rien n'est enregistré sans date). Avant cette date, la personne n'est ni dans
  Équipe en direct, ni dans la vue semaine (cachée si elle commence après la semaine, jours d'avant gris, « 1er jour » le jour
  même), ni dans « Pas soumis hier » (Équipe en direct, À traiter), ni comptée dans les jours manquants du Journal employé
  (`notStartedOn` / `isRegularCrew(person, date)`, `src/lib/live-crew.js`) ; une job entrée quand même l'affiche. Le compte
  n'est pas touché : il peut être activé avant (profil, 2FA). Employés : trois états — **Actif**, **En attente** (« En attente ·
  début le … », compte activé ou non, compté à part, filtre) et **Inactif / en pause** ; `employeeStatus(profile, pending, today)`.
  `pending_signups()` laisse de côté une personne en attente : si son compte n'est toujours pas activé le premier jour, elle
  revient dans le compteur rouge. La date reste après le début (date d'embauche).
  Ligne `start_date_change` au Journal (`audit_profile_change`). `isNewHire` / `employmentChoice` / `employmentUpdate`
  (`src/lib/signups.js`). La saisie de temps n'est pas bloquée avant la date.
- [x] **Notes et rappels** (V2.4.169, migration 0111, Gestion V3 › Aujourd'hui › Notes) : table `manager_notes`
  (texte 1 à 5 000 caractères, `shared`, `remind_at` facultatif, `done_at`, `done_by`). **Privée** : seul l'auteur la lit,
  la modifie ou la supprime (même la propriétaire ne voit pas celles des autres). **Partagée** : tous les gestionnaires la
  voient et peuvent la modifier, la repousser ou la marquer faite ; seul l'auteur la supprime ou la rend privée (RLS :
  lecture / modification `user_id = auth.uid() or shared`, suppression auteur seulement, session `aal2` via
  `get_my_role()` ; trigger `manager_notes_guard` : auteur figé, `done_by` = qui l'a faite). À l'écran : privée = pastille
  grise « Privée » (cadenas) ; partagée = bord gauche bleu, fond bleuté, « Partagée par toi / par Karine » ; filtres
  Toutes · Mes notes privées · Partagées. Un rappel partagé dû compte chez tous les gestionnaires.
  Un rappel passé et pas fait = « dû » : carte rouge en tête de liste et compteur rouge sur Notes dans le menu
  (`ManagerLayout` lit les rappels ouverts, minuterie jusqu'au prochain, au plus 6 h, + retour sur l'onglet +
  `NOTES_EVENT`). Fait / Rouvrir / Plus tard (1 h, demain 8 h, 1 semaine) / Modifier / Supprimer (confirmation).
  Cartes en `text-base`/`sm:text-lg`, plus grosses que les notifications envoyées. `src/lib/notes.js`,
  `NotesPanel.jsx`. Pas de push ni de notification du téléphone (dans l'app seulement). V2 inchangée.
- [x] **Image que le téléphone refuse de lire** (V2.4.170, migration 0112) : le 2026-10-22, Yohan a eu
  « NotReadableError » sur la capture SMS de temps sup. ; les journaux Supabase montrent qu'aucun envoi n'est parti de
  son téléphone (4 autres preuves envoyées au même moment), donc Android a refusé la lecture du fichier choisi.
  `readPickedFile` (`src/lib/evidence-file.js`) lit tout le fichier en mémoire avec 3 essais (0,4 s puis 0,8 s) quand la
  lecture est refusée ; la copie sert ensuite à tout, y compris « Réessayer avec la même capture » (plus de relecture du
  fichier ; bouton caché si le fichier n'a jamais pu être lu). Message clair `form.evidence.reason.unreadable` (refaire
  la capture, attendre, choisir dans Galerie ou Fichiers, pas Google Photos) ; reçu de stationnement illisible : raison
  affichée au lieu de « enregistrement échoué ». `EvidenceFileError` donne l'étape (lire / type / ouvrir / préparer).
  Diagnostic au Journal (« Image illisible ») : RPC `log_file_read_error(contexte, détails)` (tout compte connecté, son
  entrée seulement, clés connues seulement, 20 par heure) — taille, type, âge du fichier, étape, erreur, essais,
  navigateur, app installée ou non ; jamais l'image. Preuve de temps sup., inventaire et reçus de stationnement.
- [x] **Documentation toujours à jour** (V2.4.171) : README (15 entrées V3, 2FA, NAS dans Vault, 4 fonctions Edge
  ajoutées à la liste, nouveautés employés / gestionnaires), NOOB (paie de la semaine 43, TD1 0 / 36, NAS, changement
  d'heure du 1er novembre, Apps Script, SMTP) et CLAUDE. `src/lib/docs-sync.test.js` : les trois fichiers nomment
  `V${APP_VERSION}` ; règle « Docs rule » en tête de ce fichier.
- [x] **Notification téléphone refusée sans le dire, déconnexion partout** (V2.4.172) : le 2026-10-22, un test de
  message vers un compte employé n'est pas arrivé. Journaux : `send_push` 401 (« Session not found » côté Auth). Le
  gestionnaire s'était déconnecté du compte de gestion sur le téléphone ; `signOut()` (portée « global » par défaut)
  avait fermé aussi la session de l'ordinateur, dont le jeton restait accepté par la base (message enregistré) mais plus
  par `auth.getUser` de la fonction ; `notifyBroadcastPush` ignorait l'erreur. Correctif : `AuthContext.signOut` →
  `signOut({ scope: "local" })` (cet appareil ; `ResetPassword` garde la déconnexion globale après un nouveau mot de
  passe). `notifyBroadcastPush` (`src/lib/push.js`) rend `{ ok, sent, failed }` ou `{ ok: false, reason }`
  (`pushFailureReason` : session / not_configured / error), rafraîchit la session et réessaie une fois sur un refus de
  session, ne lance jamais d'erreur ; `pushOutcome` → message : Communications (envoi, Renvoyer), modification avec
  relecture, rappel de À traiter, feuille d'urgence. Test `push-outcome.test.js`.
- [x] **Notifications téléphone activées par défaut** (V2.4.173, migration 0113) : au 2026-10-23, 2 comptes actifs sur 36
  avaient un abonnement (l'option était à activer soi-même dans Profil). Le navigateur exige une permission donnée par un
  geste de la personne, donc : `syncPushSubscription(userId)` (`src/lib/push.js`) à chaque ouverture (`PushPrompt`, dans
  `AppShell` hors vue employé et `ManagerLayout`) — si la permission est déjà accordée, abonne l'appareil et rappelle
  `register_push_subscription` (rattache aussi un téléphone partagé au compte connecté) ; sinon la carte
  `PushPrompt.jsx` (`pushPromptMode` : `ask` / `install` pour un iPhone dans Safari ; jamais pour `denied`, `on`, non pris
  en charge) demande le geste. « Plus tard » = 3 jours (`sparklog.pushPromptSnooze`). Désactiver dans Profil enregistre
  `sparklog.pushOff.<userId>` sur l'appareil : ni synchronisation ni carte pour ce compte ; réactiver l'efface.
  `PUSH_EVENT` garde la carte et Profil d'accord. Employés : RPC `push_enabled_users()` (ids, gestionnaire aal2 via
  `get_my_role()`), cloche verte / barrée par compte actif, filtre « Sans notifications ». Test `push-default.test.js`.
  V2.4.174 : la propriétaire (Windows, Edge seulement, d'après les journaux) touchait « Activer » sans effet — aucun appel à
  `register_push_subscription` : Edge cache par défaut la question (« demandes silencieuses »), `requestPermission` ne rend
  pas `granted`. La carte ne s'affiche plus que sur téléphone / tablette (`isMobileDevice`, `src/lib/push-support.js` :
  `userAgentData.mobile`, iOS, « Android » / « Mobile ») ; un ordinateur passe par Profil. `enablePush` distingue `denied`
  de `dismissed` (question fermée ou cachée) → message `push.prompt.dismissed` (cadenas › Notifications › Autoriser) dans la
  carte et dans Profil, au lieu de « refusées ».
- [x] **Groupes d'employés et nouveaux en attente dans Communications** (V2.4.175, migration 0114) : tables
  `employee_groups` (nom 1-60 car., unique sans casse ni espaces, note ≤ 300) et `employee_group_members` (groupe ×
  profil, cascade des deux côtés) ; RLS `get_my_role() = 'manager'` (gestionnaire / propriétaire / admin avec sections,
  aal2) pour tout, aucun accès employé ni anon. Onglet **Groupes** de Gestion V3 › Équipe (`v3/team?tab=groups`, même
  règle que `employees`, `GroupsManager.jsx`) : créer, renommer, supprimer (confirmation), cocher les membres (actifs,
  nouveaux en attente ; un membre inactif reste listé pour le retirer). `src/lib/employee-groups.js` (`groupsTargetIds`,
  `pendingNewHires`, `memberChanges`, `inventoryGroupChoices` / `sumGroupInventory`). Communications : 3e choix
  « Groupes » (union des membres non en pause, chaque personne une fois ; enregistré `audience = 'selected'` avec la liste
  des destinataires). Avec « Tous » ou des groupes, si des nouveaux en attente (`isNewHire`, compte non en pause) sont
  parmi les destinataires, une fenêtre demande Oui (inclure) / Non (sans eux) / Annuler (rien n'est envoyé) ; aucune
  question sans nouveau en attente ni en « Employés précis ». Inventaire › Entrepôt : total d'un groupe en plus des
  régions. Testé sur Postgres local (propriétaire, employé, anon, nom en double, nom vide, cascades). Test
  `employee-groups.test.js`. Pas de ligne au Journal pour les groupes (aucun effet sur la paie ni les droits).
- [x] **Date d'embauche, dernier jour travaillé, « Données CCQ »** (V2.4.176, migration 0115) : nouvelle colonne
  `profiles.last_work_date` (contrainte `profiles_last_work_after_start_chk` : jamais avant `start_date`) ; la date
  d'embauche **est** `start_date` (0110 : à venir = « En attente »). `audit_profile_change` reprend les 4 entrées de 0110
  (identiques à la production, vérifié) et ajoute `last_work_date_change`. Écriture réservée aux gestionnaires par la liste
  blanche 0018 (colonne absente de la liste employé). Fiche Employés : ligne date de naissance · NAS · date d'embauche ·
  dernier jour travaillé, au-dessus des sections ; la naissance et le NAS sortent de la section CCQ, renommée « Données
  CCQ » (`employees.ccqExport`). Le NAS s'affiche maintenant aussi pour les rôles hors CCQ (bureau, propriétaire), sauf
  sous-traitant ; mêmes droits (`NasField`, propriétaire). `saveEmploymentDate` vérifie l'ordre (`employmentDatesError`,
  `src/lib/signups.js`) et rafraîchit le compteur des inscriptions. Relevé d'emploi : `roeEmploymentDates` — blocs 10 / 11
  pris dans la fiche quand remplis, sinon déduits des paies. Test `employment-dates.test.js`.
- [x] **Changement d'heure de l'automne : choix de l'heure répétée** (V2.4.177, migration 0116) : le 1er novembre 2026,
  1 h à 1 h 59 arrive deux fois. Avant, toute fiche avec un départ ou une fin dans cette heure était refusée et l'employé
  devait « demander à un gestionnaire », qui n'avait aucun moyen de l'entrer. Maintenant : l'employé reçoit un message
  clair (envoyer ses heures au gestionnaire) ; la propriétaire entre la fiche dans Admin › Feuille de temps d'urgence et,
  seulement pour un départ ou une fin dans l'heure répétée, choisit « 1re fois (avant de reculer) » ou « 2e fois (après) »
  (`repeatedHourFields`, `validateManagerEntry` → `dstChoice`, `src/lib/manager-entry.js`) ; l'employé confirme comme
  d'habitude (le choix est gardé). Client : `resolveCompanyWallTime(date, time, fold)`, `isRepeatedCompanyTime`,
  `jobEndDate` (`src/lib/company-time.js`), `validateJobSubmissionContract` lit `depart_fold` / `fin_fold`. Corrigé au
  passage : l'erreur du contrôle avant soumission (`invalid_dst_time`) donne maintenant le cas (`:ambiguous` /
  `:nonexistent`), sinon l'employé voyait « intervalle invalide » au lieu du message du changement d'heure. Production :
  `resolve_montreal_job_instants` et `create_job_for_employee` identiques au dépôt avant la migration (empreintes
  comparées). Testé sur Postgres local (1re / 2e fois, 22 h → 1 h 30 = 3,5 h ou 4,5 h réelles, choix effacé hors de
  l'heure, écriture directe refusée, RPC par le rôle navigateur) et dans Chromium (horloge au 2 novembre). La paie compte
  encore l'heure affichée (§6.1 D). Test `dst-repeated-hour.test.js`.
- [x] **Gestion V3 : mots clairs, justificatifs à traiter, mois CCQ** (V2.4.179, aucune migration, V2 inchangée :
  tout passe par des props données par les onglets V3 de `ManagerPages.jsx`). (1) `UnlockDayManager({ plainWords })`,
  `ManagerDashboard({ plainWords })` → `JobCard({ plainWords })` : clés `….plain` (« Rouvrir une journée », « Retourner
  pour correction » = `return_job_for_correction`, inchangé) ; onglet `mgr.nav3.tab.unlockDay` et `todo.unlock` /
  `todo.toast.unlocked` (V3 seulement) reformulés. (2) `ManagerDashboard({ reviewFilters })` (Justificatifs de À traiter) :
  `receiptNeedsReview` / `filterReceiptJobs` / `receiptEmployees` (`src/lib/receipts-review.js`) — à traiter = stationnement
  ou souper `pending` (dernier souper de la job), ou preuve de temps sup. d'une job non approuvée ; case « À traiter
  seulement » cochée par défaut (décochée si `?job=` d'un lien de notification), employé, journée. Filtre sur les lignes
  déjà chargées, aucune requête de plus (le souper lit aussi `status`). (3) `CcqJsonExport({ lastFinishedMonth })` :
  `lastFinishedReportMonth(companyDate())` (mois avant celui de la période en cours, `src/lib/monthly-report-period.js`)
  et `reportMonthPeriod` pour afficher les semaines. Tests `receipts-review.test.js`, `monthly-report-period.test.js`,
  `UnlockDayManager.test.jsx` (mots V2 / V3, chaque clé `.plain` dans les deux langues).
- [x] **Gestion V3 : fiche employé unique** (V2.4.180, aucune migration, V2 inchangée) : `EmployeesPanel({ tabbed })`
  depuis l'onglet V3 `v3/team?tab=employees` — recherche (`matchesEmployeeSearch` : nom, courriel, n° d'employé / CCQ,
  chiffres du téléphone, sans accents), filtre « Chefs d'équipe » (`isTeamLeader`), fiche ouverte = `EmployeeTabs`
  (`employeeCardTabs(profile, viewerRole)` : CCQ pour métier et sous-traitant, Impôts pour un lecteur gestionnaire /
  propriétaire et jamais pour un sous-traitant, comme la RLS 0083 de `employee_tax_profiles`). Les morceaux de la fiche V2
  sont exportés et réutilisés tels quels (`EmployeeAccountSection` : type, n°, rôle, pause, embauche / départ ;
  `CcqDataFields` / `CcqOptionsFields` ; `OfficePayFields` / `ManagementAccessFields` ; `EmployeeDeleteBlock`) ; la fiche V2
  les assemble comme avant (tests d'écran V2 inchangés). Règles de temps : `src/lib/pay-options.js` (`payRuleToggles`,
  `reimbursements`, `parsePayAmount`) + `components/employees/PayOptionsFields.jsx`, partagés avec `TimeRulesManager` (V2).
  TD1 : `src/lib/tax-profile.js` (`taxFormRow`, `taxProfileUpsert`) + `TaxProfileFields.jsx`, partagés avec
  `PayrollSettings` ; onglet `EmployeeTaxTab` (lit la ligne de l'employé à l'ouverture, même upsert). Menu V3 : onglet
  `time-rules` retiré de `v3-config` ; `V2_TO_V3["config/rules"]` → `v3/team?tab=employees` avec `merged: true` (retour
  V3 → V2 sur Employés, même règle `employees`) ; `SettingsPanel({ taxForms: false })` en V3. Tests
  `EmployeesPanel.test.jsx` (6 cas V3), `employee-card.test.js`, `manager-nav.test.js`, `authorization-matrix.test.js`.
- [x] **Coûts et Semaine / Mois = calcul de la paie** (V2.4.181, aucune migration, V2 et V3) : `src/lib/employer-cost.js`
  — `payrollWeekCost` (= `computeEmployeeWeekTalon`, méthode Messier : brut, 13 % `ccqAmounts.vacation`, charges
  légales de l'employeur du moteur, `employerSocialBenefit`, taux par heure de `employer_contributions` **hors**
  `ENGINE_CONTRIBUTION_CODES`, km / cellulaire / entreposage / équipement), `nonPayrollWeekCost` (bureau, propriétaire sans
  paie fixe, sous-traitant : taux figé sur la job, sans charges), `weeklyCosts` (une ligne par employé × semaine CCQ ;
  jobs `COST_JOB_STATUSES` = soumises / retournées / approuvées ; souper CCQ seulement), `costsByEmployee` (Coûts),
  `openingLookup` (cumul = dernière semaine comptabilisée de la même année fiscale — date de paie = samedi + 5 j — sinon
  `payroll_ytd`, comme le sommaire imprimé). `src/lib/employer-cost-data.js` (`loadCostInputs`) charge tout ;
  `src/lib/period-costs.js` (`periodsFromWeeklyCosts`) regroupe par semaine / période mensuelle CCQ. `weekly-report.js`
  (`employeePay`) utilise `payrollWeekCost` (chiffres inchangés, tests existants). Avant : charges = taux par heure de
  `employer_contributions` × heures (RRQ, AE… approximés) et brut au taux figé sur la job ; PeriodSummary comptait aussi
  les brouillons. `fixed-pay-cost.js` retiré (sa logique est dans `weeklyCosts`). Mesuré : 40 employés × 1 an (16 800
  jobs) ≈ 0,3 s dans le navigateur. Tests `employer-cost.test.js` (égalité au centime avec le sommaire imprimé),
  `fixed-pay.test.js`, `claim-status.test.js`, `conges-indemnity.test.js`.
- [x] **Gestion V3 : petits plus** (V2.4.182, aucune migration) : (1) compteur « À traiter » dans le menu V3
  (`badges.todo`, `fetchTodoCount` : `jobs` soumises après `DYNACOM_CUMULATIVE_END`, `count: exact, head: true`, aucune
  ligne lue ; rechargé à chaque changement de page et sur `TODO_EVENT`, émis par `TodoInbox` après chaque chargement).
  (2) onglet `missing` de `v3-time` (« Jours sans saisie », règle de `advanced-audit`) : `MissingDaysPanel.jsx` +
  `src/lib/missing-days.js` (`loadMissingEntryDays`, aussi utilisé par `EmployeeActivityLog`) ; `missingEntryDays` saute
  maintenant les fins de semaine et `company_holidays` (`isNonWorkday`, comme `workdays.js` l'exige) et rend les `dates`.
  (3) Communications : recherche du choix d'employés et des notifications envoyées (`src/lib/broadcast-search.js`).
  (4) une seule cloche en V3 (`components/manager/ManagerBell.jsx`) : notifications de gestion pour
  `canAccessSection(…, "notifications")` + messages reçus pour un non-gestionnaire, un seul compteur ; V2 et l'app
  employé gardent leurs deux composants, sur les mêmes hooks (`use-manager-notifications.js`,
  `use-employee-broadcasts.js`). « Tout marquer comme lu » (`markRead(visible)`, un seul upsert de
  `manager_notification_reads`) dans les deux. Les admins de bureau ont la V3 (donc la cloche unique) depuis V2.4.183 (« V3 par défaut »). Tests `bell-and-todo.test.js`,
  `broadcast-search.test.js`, `live-crew.test.js` (fins de semaine / fériés), `manager-nav.test.js`,
  `authorization-matrix.test.js`.
- [x] **Gestion V3 par défaut** (V2.4.183, aucune migration) : `src/lib/manager-ui-version.js` — clé
  `sparklog.managerUiChoice` (`MANAGER_UI_KEY`), défaut `DEFAULT_MANAGER_UI_VERSION = "v3"` ; l'ancienne clé
  `sparklog.managerUi` (`MANAGER_UI_KEY_BEFORE_V3`) est ignorée, donc chaque appareil ouvre la V3 une fois, puis garde le
  choix fait depuis. `ManagerLayout` : plus de `canSwitch` réservé aux gestionnaires — tout le monde dans la Gestion
  (admins de bureau compris, qui étaient forcés en V2) a la V3 par défaut et le sélecteur ; `ManagerIndex` atterrit selon
  la version pour tous (`firstAllowedPath(role, sections, version)`). Les droits ne changent pas : chaque entrée et chaque
  onglet V3 gardent la règle de leur page (tests existants : un admin atteint en V3 exactement ses pages V2). Cloche V3 :
  `notificationTargetV3` (`switchTarget("v3", …)`) ouvre Justificatifs de À traiter / Équipe › Employés. Reste : retirer
  la V2 (sélecteur, `MANAGER_NAV`, pages en double, redirection des anciens chemins). Tests `manager-ui-version.test.js`,
  `bell-and-todo.test.js`.
- [x] **V2 retirée** (V2.4.186, aucune migration) : `MANAGER_NAV` = l'ancien menu V3 (15 entrées) ; `MANAGER_PAGES` =
  les pages de l'ancien menu V2 sans `config-rules`, gardées comme règles d'accès (`from` des onglets, `authorizationFor().pages`)
  et dont certaines restent des entrées (live, inventory, messages, journal, état du service, feuille d'urgence).
  `OLD_PATHS` / `oldPathTarget` (`src/lib/manager-nav.js`) : chaque ancien chemin V2 (+ `payroll`, `reports`, `config`)
  → page à onglets + `?tab=`, la requête gardée (`reports/period?view=` → onglet) ; routes générées dans `App.jsx` vers
  `OldPathRedirect` (`ManagerPages.jsx`) ; `legacySectionTarget` passe par la même table ; `/testing` → `v3/reports?tab=costs`.
  Retirés : `manager-ui-version.js` (sélecteur, clés `sparklog.managerUi*` ignorées), `VersionSwitch`, `switchTarget`,
  `v3MenuPath`, `V2_TO_V3`, `notificationTargetV3` (`notificationTarget` mène directement aux pages V3, aussi depuis
  `NotificationsBell` de l'app employé), les deux cloches de la Gestion (`ManagerBell` seule), les pages V2
  (`TimesheetsPage`… `PeriodPage`, `MethodSwitch` : la barre de méthode compacte partout), `TimeRulesManager.jsx`,
  `ManagerDownloads.jsx`. Droits inchangés (`manager-nav.test.js` : un admin atteint exactement les pages de ses sections).
  Vérifié dans Chromium : propriétaire et admin (employees + notifications), 8 anciennes adresses, aucune erreur.
  Reste (ménage, sans effet visible) : les props qui choisissaient le rendu V3 (`EmployeesPanel tabbed`, `ManagerDashboard
  nameFirst / manualFilter / plainWords / reviewFilters`, `UnlockDayManager plainWords`, `SettingsPanel taxForms`,
  `CcqJsonExport lastFinishedMonth`) sont toujours passées ; le rendu V2 qu'elles désactivent est du code mort à retirer.
- [x] **Inventaire : employés en congé grisés** (V2.4.187, aucune migration) : `fetchInventoryDay` lit aussi
  `employee_time_off` qui couvre la date ; `markInventoryAbsences(entries, timeOffRows, date)` (`src/lib/inventory-items.js`)
  donne `off` (la ligne de congé, `isOffOn`, journée entière seulement : pas de `start_time`) à une entrée « missing » et la
  met en fin de liste ; affichage grisé, pastille `mgr.inventory.state.off` (« Absent · {catégorie} »), hors du compte
  « reçus / attendus ». Attendus = option inventaire, ni pause, ni `departure_status`, ni `isNewHire` ; quiconque a envoyé
  des captures reste listé. Test `inventory-items.test.js`.
  **« La lecture automatique a trouvé 16 appareils… sur 17 »** (expliqué le 2026-10-27, rien changé) : du 2026-10-13 au
  2026-10-26, 5 journées sur 42 (toujours 1 ligne sur 17) ; chaque fois une capture `needs_review` = `parseInventoryText`
  a vu un code `EQ…` sans quantité après (ligne coupée au bord de la capture, ou nom long sur deux lignes) → `unparsed`,
  ligne non enregistrée. Lignes perdues vues : « Module d'expansion pour pl… », « Sinope - 3000W », « Calypso V1 ». Corrigé
  en V2.4.188 (entrée suivante).
- [x] **Inventaire : lignes illisibles et capture de complément** (V2.4.188, migration 0117 ; fonctions
  `process_inventory_screenshot` et `delete_inventory_screenshots` **à redéployer** après la fusion). 0117 :
  `inventory_items.quantity` nullable ; `slot between 1 and 5` sur `inventory_screenshots` et `inventory_items` (5 =
  complément, ligne de liste comme 1-3 ; le verrou de soumission 0092/0097 reste sur 1-3). `parseInventoryText` garde un
  code lu sans quantité (`quantity: null`, nom sans l'avatar « E- » suivant) et le compte toujours dans `unparsed`
  (`needs_review`) ; l'Edge garde, pour un même code, la ligne qui a sa quantité. Client : `mergeInventoryItems` préfère une
  quantité lue à `null` (sinon la capture la plus récente) ; `summarizeInventoryDay` rend `unreadable` et `missing`
  (total « N de N » − lignes vues), « ok » seulement si tout est lu ; `compareInventory` garde `null` inconnu.
  `fetchInventoryReading` rend `unreadable`, `missing` et `probable` (`probableMissingLines` : codes de la dernière liste
  complète absents aujourd'hui). Écran employé (`InventoryStep`, `useInventoryStep.pickComplement`) :
  `inventoryReadingBlock(reading, rows)` → `wait` (lecture en cours, levé après 20 lectures : `timedOut`), `retake` (lignes
  illisibles ou manquantes, pas de complément : « Continuer » bloqué, bouton « Prendre une capture de ces lignes » → slot 5),
  `override` (encore incomplet après le complément : « Continuer quand même »). Gestion › Inventaire : « illisible » dans la
  colonne quantité (jamais masqué par « cacher les zéros »), message qui nomme les lignes, tuile « Capture de complément »
  dans Photos. Tests `inventory-items.test.js`, `InventoryStep.test.jsx`.
- [x] **Liste des employés sur téléphone** (V2.4.184, aucune migration, V2 et V3) : `EmployeeCardHeader.jsx` mettait n°,
  icônes, nom, région, état et « manquant(s) » sur une seule ligne ; les étiquettes `shrink-0` écrasaient le nom
  (`truncate`) jusqu'à « J… » ou rien (comptes « En attente »). Maintenant : ligne 1 = n°, rôle, chef d'équipe, nom
  (`break-words`, jamais tronqué), 2FA, notifications ; ligne 2 = courriel ; ligne 3 (`flex-wrap`) = état, manquant(s),
  région. Recherche V3 en pleine largeur sous `sm` ; texte d'aide raccourci (`employees.search`). Vérifié dans Chromium à
  360 px (nom long de 30 caractères en entier, aucun défilement horizontal).
- [x] **Groupes : employés sans groupe** (V2.4.185, aucune migration) : `ungroupedPeople(groups, people, today)`
  (`src/lib/employee-groups.js`) = rôles `employee` / `subcontractor_1` dans aucun groupe, actifs (ni pause ni
  `departure_status`) ou nouveaux en attente (`isNewHire`), triés par nom. Carte `UngroupedCard` en tête de
  `GroupsManager.jsx` (lit aussi `profiles.role`) ; « Ajouter à… » = `saveGroupMembers(group, before, [...before, id])`
  (même insertion que la case à cocher, mêmes droits RLS 0114). Test `employee-groups.test.js` ; vérifié dans
  Chromium à 360 px (compteur, ajout = une insertion `employee_group_members`).
- [ ] P-5 (optionnel) : agrégation des coûts côté serveur — voir §2. (Faits : S-2 / S-3b V2.4.105, P-12 V2.4.106.)
- [x] Filtres gestionnaire (V2.4.107) : `src/lib/latest-request.js` (`useLatestRequest`) — chaque chargement
  annule le précédent (AbortController) et seule la dernière réponse s'applique ; `withRetry` ne réessaie
  pas une requête annulée. Appliqué à Feuilles de temps (liste, compteurs, anomalies, « charger plus »),
  Journal et Journal employé. Reproduit puis corrigé dans Chromium (réponse lente d'un ancien filtre).
- [x] Erreurs réseau / serveur (V2.4.108) : `src/lib/api-errors.js` (`classifyApiError` : auth / transient /
  permanent / unknown). `withRetry` ne réessaie plus un refus du serveur (code SQL ou 4xx) ; 401 et pannes
  passagères gardent rafraîchir-puis-réessayer. Fiche de temps : après une panne passagère, la fiche reste sur
  l'appareil et est renvoyée seule (retour du réseau, ou 15 / 30 / 60 / 120 / 240 s), même clé de soumission,
  arrêt si l'employé la modifie. Vérifié dans Chromium : coupure réseau, 503, refus (aucun réessai).
- [x] **Ménage du code** (V2.4.178, aucun changement visible) : tests d'écran — `jsdom`, `@testing-library/react`
  (dev), `// @vitest-environment jsdom` par fichier, faux client `src/test/fake-supabase.js` (requêtes enregistrées,
  réponses par table / RPC, réponse différée possible) ; `EmployeeForm.test.jsx` (18 : champs manquants, rappel
  « entrée à la main », double tap = un seul `save_own_job`, preuve > 8 h, retour + inventaire + soumission de la
  journée, km de retour, stationnement, brouillon de l'appareil plus récent / plus ancien / panne de lecture, envoi
  automatique depuis Historique, job verrouillée, job d'un autre) et `EmployeesPanel.test.jsx` (8) — ceux d'avant le
  découpage passent sur l'ancienne et la nouvelle version. Découpage : `src/components/employee-form/` (messages,
  champs, stationnement, conseil de capture, vérifications, `EndOfShiftDialog`, preuve, inventaire,
  `useInventoryStep`) + `src/lib/` (`parking-upload`, `meal-claim-request`, `overtime-evidence-check`,
  `employee-form-helpers`) ; `src/components/employees/` (en-tête, ajout, compte, contact et dates, CCQ et avantages,
  bureau) + `src/lib/employees-panel.js` (ordre, taux CCQ, compteurs, filtres, testé). ESLint 64 → 0 :
  chargements lus dans l'effet et appliqués au rappel (garde à la fermeture), états qui suivent une valeur ajustés
  pendant le rendu, remises à zéro dans l'action qui les cause, fournisseurs séparés de leurs hooks
  (`AuthProvider.jsx`, `ViewModeProvider.jsx`, `LanguageProvider.jsx`, `ThemeProvider.jsx`), `lazy-panel.jsx`,
  `clockOrDash` (`lib/time.js`). Corrigés au passage : DAS ne recalculait pas au changement de méthode (`messier`
  absent des dépendances) ; État du service relançait en boucle un chargement raté ; le talon imprimable
  réécrasait l'en-tête à chaque rendu si la semaine changeait d'objet. La preuve de temps sup. garde le mode de
  son flux (`pendingReturn.mode`). Vérifié dans Chromium (Supabase simulé) : 41 écrans (propriétaire V3, employé)
  sans erreur ni écran d'erreur.
- [ ] Optionnel : charger une seule langue de `i18n.js` (nécessite de retirer le repli anglais).

---

## Notes on scope
- **Documents de paie réels** (relevés trimestriels, talons) : le relevé « Masse salariale RBQ » contient le NAS de
  chaque employé. Ne jamais en copier une valeur personnelle dans le dépôt (public) ; seuls des totaux anonymes.
- No clock-in/out/break buttons exist; the employee flow is manual Départ/Arrivée/Fin entry, so the
  repetitive Save/Submit paths were audited in place of clock-button races.
- Re-check line numbers before editing; the tree moves under active development.
