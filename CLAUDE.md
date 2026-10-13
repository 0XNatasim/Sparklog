# Sparklog — Code Audit & Remediation Tracker

> Working document for the Employee/Manager workflow audit. **Only OPEN findings are
> listed** — resolved items are removed (see git history). Every finding was verified
> against the source at the cited `file:line`; re-check line numbers before editing.

**Stack:** React 18 + Vite PWA, Supabase (Postgres + RLS + Edge Functions), payroll
export to Google Apps Script. Roles: `employee` / `manager` / `admin` / `owner` (lowercase).

**Release rule:** always bump the patch of `APP_VERSION` in `src/lib/version.js` in every PR (shown in the header as `V…`), and mention it in the commit/PR title.

**What is already solid (do not "fix"):**
- RLS is comprehensive; `get_my_role()` / `is_active_employee()` are `security definer`.
- Employees read only their own `profiles` row and own `jobs` (no peer PII/pay leakage).
- Privileged profile fields protected by a **whitelist** trigger (`0018:14-44`), not a blacklist.
- Export/approval columns trigger-protected (`0011:31-57`); paused accounts write-contained (`0018`).
- `push_approved_batch` re-checks manager role server-side, does an **atomic claim** to prevent
  double-export, and returns a **typed per-job result** so the client never force-approves.
- NAS/SIN live in the RLS-gated `employee_sensitive` vault (`0026`); privilege is role-based (`owner`).
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
- **Remaining:** add a manager-only choice of the first or second occurrence for legitimate work during the
  repeated autumn hour; rejection without this override is safe but operationally incomplete.
- **Status:** 🟠 partial

---

## 2. Performance & Latency

| ID | Finding | Anchor | Fix |
|----|---------|--------|-----|
| P-5 | Costing does full client-side joins/aggregation (now status-scoped, still client-side) | `CostingDashboard.jsx` | server aggregation endpoint |
| P-11 | Batch approval calls Auth Admin `getUserById` once per employee (N+1) | `push_approved_batch/index.ts:202-207` | one bulk lookup, or avoid exporting contact data |

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
| Manager | Filter while requests overlap | No cancellation; older response can overwrite | Latest-wins | AbortController / request id |
| Manager | Sensitive export | Owner can bulk-read NAS un-audited from the browser | Audited server-side export | S-2 |
| Both | 401/403/500 during autosave | Generic error; no typed recovery/queue | Refresh on 401, queue on 5xx | shared API adapter |

**Also tracked (lower tier):**
- **P-12 export rollback re-rates pending jobs (open, pre-existing):** `revertClaim` in
  `push_approved_batch` sets `status='submitted'`, which fires `jobs_stamp_rate_snapshot` (`0034`) and
  overwrites the rate snapshot with the employee's *current* rate. → skip re-stamping on
  `approved → submitted` (keep the snapshot taken at submission).
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

### Lot 6 — Qualité du code — ✅ en partie (V2.4.99)
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
- [ ] Reste : découper `EmployeeForm.jsx` (≈ 1 750 l.) et `EmployeesPanel.jsx` (≈ 900 l.), et la carte de
  notification de `ManagerDashboard`. Volontairement non fait ici : `EmployeeForm` est le chemin de saisie
  du temps soumis aux « release gates » (timeouts, double-clic, DST…) ; un découpage doit venir avec des
  tests de composant (pas encore d'environnement jsdom/testing-library dans le projet).

---

## 6. À faire / à préciser (mis à jour 2026-10-13, V2.4.104)

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
  Configuration › Paramètres › Paie (`payroll_employer_settings`, V2.4.103) — reste à la saisir.
- [ ] **CNESST** : le **taux de l'avis de cotisation** (par 100 $) se saisit au même endroit — reste à le
  saisir. Sans lui, le calcul renvoie `requires_review` (plus aucun taux deviné : l'ancien défaut de
  2 % de `DEFAULT_EMPLOYER` est retiré).
- [ ] **Cotisations syndicales** : confirmer pour chaque employé son association **et son local**
  (FIPOE / local 568 : formule électricien par local et période d'apprentissage) ; date de début exacte
  de l'ancienne règle SQC (seule la fin, 2026-06-27, est sourcée).

**B. Informations par employé (formulaires)**
- [ ] **TD1 (fédéral) et TP-1015.3 (Québec)** de chaque employé : les montants se saisissent dans
  Paramètres › Paie (`employee_tax_profiles`, gestionnaires/propriétaire seulement, V2.4.103) et sont
  utilisés par Talons, DAS et Calcul — reste à les saisir. Vide = montant personnel de base.
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
- [ ] Changement d'heure d'automne : choix gestionnaire de la 1re ou 2e occurrence de l'heure répétée
  (C-6, §1).

### 6.2 Écarts code ↔ convention / documentation à trancher (aucune règle modifiée)
- [x] **Prélèvement CCQ 0,75 % vs 1,5 %** : tranché, 1,5 % = 0,75 % salarié + 0,75 % employeur.
- [x] **Retour à l'entrepôt** — tranché le 2026-10-13, codé en V2.4.101 (moteur 2.2.0, migration 0081) :
  jamais de temps sup. ; par défaut sans avantages ; case `return_with_benefits_to_8h` (bonus Messier) =
  avec avantages jusqu'à 8 h. Repas et preuve > 8 h comptent toujours le retour. Détail :
  `docs/rules/compensation-rules.md` (RETURN). La colonne `return_overtime_no_benefits` est dépréciée
  (à supprimer dans une migration ultérieure).
- [x] **Prime de chef d'équipe en temps sup.** — option par employé `team_leader_premium_overtime`
  (V2.4.102, migration 0082, décochée par défaut) : prime majorée ×1,5 / ×2 sur les heures sup.
  (`printedPayLines`, talon, coûts). Décochée = heures normales seulement, comme les talons Messier.
- [x] **Repas** — dès que la journée payée dépasse **10 h** (> 600 min), V2.4.102, migration 0082
  (`isMealEligible`, `reconcile_overtime_meal`, `payroll_rules` SUPPER v2). Le 2e repas « après quatre
  autres heures supplémentaires » (20.07) n'est pas codé.
- [x] **MÉDIC** — 0,68 $ confirmé : avis CCQ du 2026-04-20 (décision du CASIC) maintient 0,68 $ salarié /
  2,93 $ patronal jusqu'au **2027-04-24**, malgré le 0,86 $ de 27.03 A) 2). À revoir avant cette date.
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
- [ ] S-2 export NAS côté serveur et audité ; S-3b soumission atomique (preuve + job) ; P-12 rollback
  d'export qui ré-estampille le taux ; P-5 agrégation des coûts côté serveur ; P-11 N+1 `getUserById`.
- [ ] Filtres gestionnaire : annuler les requêtes qui se chevauchent (AbortController / id de requête) ;
  adaptateur API commun (401 → rafraîchir, 5xx → file d'attente).
- [ ] Lot 6 restant : découper `EmployeeForm.jsx` / `EmployeesPanel.jsx` avec des tests de composant
  (jsdom + testing-library à ajouter) ; corriger les ~63 avertissements ESLint écran par écran.
- [ ] Optionnel : charger une seule langue de `i18n.js` (nécessite de retirer le repli anglais).

---

## Notes on scope
- No clock-in/out/break buttons exist; the employee flow is manual Départ/Arrivée/Fin entry, so the
  repetitive Save/Submit paths were audited in place of clock-button races.
- Re-check line numbers before editing; the tree moves under active development.
