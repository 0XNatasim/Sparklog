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

All ten recurrence protections are in place (history: git log). Pay still counts clock time across a DST change (§6.1 D).

---

## Priority Tier (fix in this order)

| # | ID | Severity | Title | Anchor |
|---|----|----------|-------|--------|
| — | — | — | No open critical/blocking finding | — |

---

## 1. Critical / Blocking Bugs

No open item. The interval, overlap, timezone and repeated-autumn-hour invariants (C-5 / C-6) are in the database
(`trg_validate_job_submission`, `save_own_job`, `montreal_local_instant(local, fold)`, `depart_fold` / `fin_fold`, 0116).

---

## 2. Performance & Latency

| ID | Finding | Anchor | Fix |
|----|---------|--------|-----|
| P-5 | Costing aggregates client-side with the shared payroll engine (status- and date-scoped, every page read via `fetchAllRows` since V2.4.109). A SQL aggregation would fork the payroll rules; revisit only if the payload grows (≈ 90 kB for 760 jobs) | `CostingDashboard.jsx` | optional: Edge Function running the same engine |

---

## 3. RBAC & Security

### Low-value / deprioritized
- **Wildcard CORS** on the approval functions is low value (they validate bearer tokens). Prioritize
  CSP/XSS, short sessions, reauth for sensitive ops, and audit correlation instead.
- **Profile-sync error surfacing:** `Login.ensureProfile()` failures are only `console.warn` — a typed,
  retryable error to the user is an optional robustness follow-up.

---

## 4. Edge Case Matrix (open items only)

| Persona | Scenario | Found Behavior | Expected | Patch |
|---|---|---|---|---|
| Manager | Two managers approve same job | Atomic claim prevents double-export; no reviewed-version check | Explicit conflict on stale version | S-4 (add version/hash) |

---

## 5. Optimisation — bundle, couleurs, interface (audit 2026-10-09)

Lots 1 à 6 livrés (V2.4.94 → V2.4.99, V2.4.178 ; détail : historique Git, PR #395). Garde-fous en place :
`src/lib/theme-contrast.test.js` (contrastes WCAG des jetons), `npm run lint --max-warnings=0` en CI, chunks
`React.lazy` / `lazyPanel()` et `manualChunks`, `ErrorBoundary` racine / route / panneau. Reste (optionnel) :
- [ ] Charger une seule langue de `i18n.js` (206 Ko source) : il faut d'abord retirer le repli `dictionaries.en` de `use-t.js`.
- [ ] Couleurs non sémantiques restantes : `bg-violet` / `slate` ponctuels, gris de `badge neutral`.
- [ ] Carte de notification de `ManagerDashboard` (à extraire / mémoïser comme `JobCard`).

---

## 6. À faire / à préciser (mis à jour 2026-11-11, V2.4.252)

> Version vulgarisée, point par point : [`NOOB.md`](NOOB.md).
> Fiche de toutes les règles de paie (valeurs lues dans le code, options, état, sources) : Gestion › Configuration ›
> Règles de paie (`src/lib/pay-rules-reference.js`). Mettre à jour cette fiche avec toute nouvelle règle.

Liste unique des points ouverts. Ce qui est fait est retiré (historique Git) ; ici, ce qu'il reste à **fournir**,
à **trancher** ou à **coder**, par priorité.

**V2.4.252 (technique).** `WeekSnapshot.jsx` : `foremanDayTopUp(date, jobCount, hours, holidays)` (jour lundi–vendredi hors `company_holidays`, au moins une fiche comptée, moins de 8 h travaillées) pour un profil `role = "foreman"` → étiquette « min. 8 h » dans la case (`live.week.foremanMin`) et ligne « Payé … » du total (`foremanPaid` = 8 h pour chaque jour complété + heures des autres jours ; `live.week.foremanPaid`). Affichage seulement : la paie vient du moteur 2.8.0 (`minDayMinutes`), l'arrondi de 15 min (`day-rounding.js`) ne connaît toujours pas le minimum du contremaître (ligne « payé · arr. · cpt » inchangée). Tests dans `WeekSnapshot.test.jsx`. Aucune migration.

**V2.4.251 (technique).** `History.jsx` : `isOwner(job)` compare `job.user_id` à `effectiveUserId` (l'employé vu en « Vue en tant que »), plus à `user.id` du gestionnaire ; en `isViewMode`, les boutons Ouvrir / Supprimer / Soumettre / Soumettre la journée sont affichés `disabled`, et `submitJob` / `deleteJob` / `submitDay` sortent tout de suite. Test : `src/pages/History.test.jsx`. Reste : `Week.jsx`, `Profile.jsx` et `EmployeeForm.jsx` (champs déjà désactivés par `disableInputs`) n'ont pas été revus bouton par bouton.

**V2.4.250 (technique).** `RETURN_TIME_OPTIONS` (`job-contract.js`) commence par `0` (0 est déjà accepté par `isValidReturnMinutes` et la base : `return_time_minutes` 0, 5, 10, …) ; le bouton « 0 min » mène à l'étape des km comme les autres. `form.return.askDescription` raccourci (sans « entrepôt, maison ou ailleurs »). Aucune migration.

**V2.4.249 (technique).** Textes `form.return.askTitle` / `askDescription` (« Retour facturable ? ») et `form.return.kmBreakdown` (« retour » sans « à l'entrepôt ») ; la logique du retour (`EndOfShiftDialog`, `return_time_minutes`, `km_retour`) ne change pas. `EmployeeForm.jsx` : à l'enregistrement, Départ = Fin (même HH:mm) est refusé avec `form.errors.invalidInterval` avant tout appel `save_own_job` (avant : une fiche 6 h 30 → 6 h 30 était stockée en 24 h — `started_at` / `ended_at` à +24 h —, chevauchait les autres fiches du jour et bloquait « Soumettre la journée » ; V2.4.247 n'avait corrigé que le message du chevauchement). Test ajouté. Aucune migration. Note : en « Vue en tant que… » (lecture seule) la soumission échoue par conception (le RPC `save_own_job` tourne avec le compte du gestionnaire).

**V2.4.248 (technique).** `UnlockDayManager.jsx` : option `__all__` (« Tous les employés ») du sélecteur → un seul `upsert` de `job_entry_unlocks` pour tous les profils actifs (non en pause), puis une seule requête des fiches `submitted` du jour (`.in("user_id", …)`) et une seule confirmation pour les retourner (`returnJobs`, `return_job_for_correction` par fiche, comme pour un employé) ; bouton « Tout refermer » (`removeAllUnlocks` : un `delete().in("id", …)` de toutes les lignes affichées, après confirmation). Textes `timeRules.allEmployees / allUnlocked / reopenAllSubmittedConfirm / removeAll / allUnlocksRemoved`, `confirm.removeAllUnlocks` (+ `.plain`). Tests dans `UnlockDayManager.test.jsx`. Aucune migration (RLS de `job_entry_unlocks` inchangée).

**V2.4.247 (technique).** `findJobOverlap` / `interval` (`src/lib/job-overlap.js`) : une fiche dont Départ = Fin (0 minute) renvoie `null` au lieu d'être comptée comme 24 h (`end <= start` → `end < start`) ; avant, le message « chevauche » masquait « Heures invalides » (`job-contract.js` compte aussi 0 comme 1440 min, refusé > 16 h). Test ajouté. Aucun changement de base.

**V2.4.246 (technique).** Règle « 4 jours de 10 h » (moteur 2.9.0). Migration 0135 : colonne `profiles.ten_hour_days` (booléen, défaut faux ; écrite par les gestionnaires via la politique de profil, l'employé reste hors de la liste blanche) ; `validate_job_submission_contract` (seuil de la preuve de temps supp. : 480 → 600 min) et `reconcile_overtime_meal` (souper : 615 → 735 min) recréées, corps de 0125, seuls les deux seuils changent ; sans effet pour `foreman` / `subcontractor_1`. Moteur : `DAILY_REGULAR_MINUTES` (480), `TEN_HOUR_DAY_MINUTES` (600), `dailyRegularMinutesFor(profile)`, option `dailyRegularMinutes` de `calculatePayrollEntries` (journée régulière et plafond de la semaine pour le retour), renvoyée par `overtimeOptionsFromProfile` ; `isMealEligible({ dailyRegularMinutes })`. Écrans : la colonne est lue partout où l'on lit `overtime_first_hour_double` (Talons, DAS, Paie de la semaine, Calcul, Rapports, Coûts, RE, Export CCQ, `classify_week`) et `Week.jsx` / `History.jsx` / `EmployeeForm.jsx` (preuve de temps supp.), `meal-claim-request.js` / `mealDecision` (souper), `ManagerDashboard` + `TodoInbox` + `detectJobAnomalies({ tenHourUsers })` (« temps supp. sans preuve » après 10 h). Case dans `pay-options.js` (verrouillée à faux pour sous-traitant et contremaître), fiche des règles de paie et `docs/rules/compensation-rules.md` (TEN_HOUR_DAYS) à jour. `push_approved_batch` et la feuille Google ne changent pas (la feuille ne calcule pas le temps supp.). Ouvert : 5e journée de la semaine (l'export CCQ ramène déjà en temps supp. les heures régulières au-delà de 40 h / semaine ; les autres écrans non) et férié en semaine (retire encore 8 h du plafond de la semaine). Règle non signée par un spécialiste (ADR 0001). Migration 0135 appliquée à la base le 2026-11-11 (fichier ajouté à `main` avant le code ; vérifié : colonne, seuils 600 / 735 min, déclencheur présent) ; **à faire :** redéployer `classify_week`.

**V2.4.245 (technique).** Documents seulement : `docs/governance/reunions-securite/` reçoit les PDF des rencontres d'équipe (1 : consignes générales Hilo / Messier Connexion, 2 : pause sécurité, non-conformités avec photos de chantier). Dépôt public : aucune donnée personnelle ni nom de client dans les fichiers ; à retirer si une photo permet de reconnaître un client. Aucun code changé, seule la version change.

**V2.4.244 (technique).** Fichier de la migration 0134 : `revoke all on public.foreman_reports from anon, public, authenticated` (Supabase donne par défaut update / delete / truncate… à `authenticated` sur une nouvelle table ; `grant select, insert` seul ne les retirait pas, les politiques RLS bloquaient déjà update / delete). Même correction appliquée à la base le 2026-11-10 (vérifié : `authenticated` = INSERT, SELECT). À reprendre pour toute nouvelle table : retirer aussi `authenticated` avant de donner les droits voulus. Aucun changement de code.

**V2.4.243 (technique).** Notes du contremaître. Migration 0134 : table `foreman_reports` (`user_id` défaut `auth.uid()`, `submission_key` unique par auteur, `report_date`, `audited_name` texte libre ≤ 120 — l'employé ne lit pas les autres profils, donc pas de lien —, `body` 1–5000 ; trigger `foreman_reports_guard` : heure du serveur, texte nettoyé). RLS : lecture par l'auteur ou `get_my_role() = 'manager'` (aal2), insertion seulement par un profil `foreman` non en pause et pour lui-même ; droits `select, insert` seulement (jamais modifié ni supprimé). `src/lib/foreman-reports.js` (`isForemanOt` via `matchPreset`, `cleanReport`, `submitForemanReport` : un doublon 23505 = même rapport, `fetchForemanReports` : budget `foremanReports` = 300, noms lus dans `profiles`, `filterReports`). `EmployeeForm.jsx` : avec `foremanEmployee` et l'OT « CONTREMAÎTRE », le bouton Remplir auto est remplacé par « Notes du contremaître » (`ForemanNotesDialog.jsx`, clé de soumission créée à l'ouverture, bloqué en « vue employé »). Gestion : l'entrée `notes` devient une page à onglets (`mine` = `NotesPanel`, `foreman` = `ForemanReportsPanel.jsx`, règle gestionnaire / propriétaire), route `NotesTabsPage`. Pas de pastille ni de notification téléphone ; pas de photo ; pas de « lu » par la gestion. **Appliquer la migration 0134 avant de déployer le code.**

**V2.4.242 (technique).** Export Google pour le contremaître. `push_approved_batch/index.ts` : champ `employee_day_minimum_minutes` (480 pour un `foreman` un jour du lundi au vendredi hors `company_holidays`, sinon 0), `employee_first_trip_unpaid` et `employee_return_with_benefits_to_8h` forcés à faux pour lui. `apps-script-doPost.js` : colonne « Minimum 8 h (min) » (ajoutée à la fin par `ensureHeaders`) ; pour chaque jour (employé + date) portant un minimum, complément = 480 − minutes payées de toutes les fiches du jour (feuille + envoi), écrit sur la 1re fiche (Départ, puis id), 0 sur les autres ; recalculé quand une autre fiche du jour arrive dans un envoi suivant ; « Heures payées » l'inclut. Test : `src/lib/apps-script-foreman.test.js` (feuille simulée, le script est exécuté tel quel). **À faire :** recoller le script dans Google + nouvelle version de déploiement ; redéployer `push_approved_batch`. Le temps supp. au-delà de 8 h n'est pas calculé par la feuille (inchangé).

**V2.4.241 (technique).** Rôle `foreman` (contremaître), migration 0133 : contrainte `profiles_role_check`, `get_my_role()` (niveau employé, aal2 inchangé pour les gestionnaires), `is_active_employee()` et `create_job_for_employee` (saisie par un gestionnaire) recréées ; ligne `CONTREMAÎTRE` ajoutée à `preset_work_orders` (et à `DEFAULT_PRESET_LABELS`). La preuve de temps supp. (`validate_job_submission_contract`) n'est **pas** modifiée : un contremaître la fournit comme les autres. **Moteur 2.8.0** : `overtimeOptionsFromProfile` renvoie `{ minDayMinutes: FOREMAN_DAY_MINUTES (480), noReturn: true, firstOtHourDouble }` pour `foreman` ; `calculatePayrollEntries` avec `noReturn` met `return_time_minutes` à 0 et ignore le retour avec avantages et le premier trajet non payé (tout est du travail) ; avec `minDayMinutes`, une journée de semaine (jour « regular », pas samedi / dimanche / férié) payée moins de 480 min est complétée en régulier sur sa 1re fiche ; au-delà de 8 h le temps supp. 1,5× / 2× est celui de tout le monde. `src/lib/roles.js` (`isForemanRole`, employé CCQ : pas `isNonCcqRole`), `EmployeeForm.jsx` (`foremanEmployee` : pas de `ManualEntryCheckDialog`, pas d'étoile `job_entry_sources` sauf si une capture est utilisée, `workOrderBlocked` ignoré), sélecteur de rôle / type de compte, `ROLE_ORDER`, `FIELD_ROLES`, `EmergencyTimesheet`, matrice d'autorisation, textes `manager.foremanLabel` / `employees.typeForeman`. Règle non signée par un spécialiste (ADR 0001) ; à confirmer : minimum de 8 h seulement du lundi au vendredi, férié / samedi / dimanche sans complément. **À faire côté déploiement :** appliquer 0133 avant le code ; redéployer `push_approved_batch` et `classify_week` (moteur) ; le script Apps Script est adapté en V2.4.242. Le souper (`reconcile_overtime_meal`) n'a pas été modifié.

**V2.4.240 (technique).** Option « Km saisis à la main » : migration 0132, colonne `profiles.km_apart_from_capture` (booléen, défaut faux ; écrite par les gestionnaires via la politique de profil existante, l'employé reste hors de la liste blanche, comme `first_trip_unpaid`). `workOrderIssues(parsed, { kmOptional })` (`work-order-parse.js`) : avec l'option, l'absence de km sur la capture n'est plus un problème (`code: "km"`) ; les autres champs manquants et `kmMismatch` (miles ≠ km, quand les deux sont lus) restent bloquants. `EmployeeForm.jsx` lit la colonne avec le profil (`kmApartFromCapture`) et la passe à `handleExtractFromImage` ; le champ km reste obligatoire (`formComplete`). `EmployeeCcqSection.jsx` (`CcqOptionsFields`) : case + texte `employees.kmApartFromCapture*` ; `EmployeesPanel` charge la colonne. Cause : sur un écran court, le bloc « Déplacement » de l'onglet Bilan sort de la capture, donc aucun km n'était lu. **Appliquer la migration 0132 avant de déployer le code** (le profil lit la nouvelle colonne).

**V2.4.239 (technique).** Rappel de la cotisation annuelle de base à l'AECQ : `src/lib/aecq-dues.js` (`AECQ_BASE_DUES` = montant avant taxes par année du rapport, 2026 : 240, 2027 : 245 ; `aecqOctoberReminder(mois)` renvoie `{ year, amount }` seulement pour un mois `AAAA-10`, `amount` nul si l'année n'est pas dans la table). `CcqJsonExport.jsx` affiche l'encadré (`manager.download.aecqReminder` / `aecqReminderUnknown`) sous le sélecteur de mois ; rien n'est ajouté au JSON ni au moteur de paie. Cette cotisation est la facture manuelle de la CCQ, distincte des 0,03 $/h de `ccq-benefits.js`. Chaque année : ajouter le montant publié dans la table. Corrige la note de NOOB qui disait « ajoutée automatiquement ».

**V2.4.238 (technique).** Rappel du calendrier CCQ en bandeau global : `CcqCalendarBanner` (`CcqCalendarCard.jsx`) monté dans `AppShell` après `UpdateBanner` (pas en mode « vue employé », `sticky z-40`), bouton « OK » ; `blockKey` (`début|libellé`), `reminderBlock(..., dismissed)` saute les blocs fermés, `readDismissed` / `dismissBlock` → `localStorage` `sparklog.ccqCalendarSeen.<userId>` (entrées finies depuis plus de 30 jours retirées ; aucune migration : un « OK » ne suit pas l'employé d'un appareil à l'autre). `use-ccq-calendar.js` met la lecture en cache (une par jour et par chargement de page). Le rappel est retiré du haut de `Profile.jsx`, la carte reste.

**V2.4.237 (technique).** Calendrier CCQ du Profil : `src/lib/ccq-calendar.js` (logique pure : `calendarBlocks` regroupe les jours consécutifs de même libellé de `company_holidays` en un bloc, `upcomingBlocks`, `daysUntil`, `reminderBlock` = prochain bloc qui commence dans 0 à `REMINDER_DAYS` = 7 jours, `formatBlockRange`), `use-ccq-calendar.js` (lecture `company_holidays` à partir d'aujourd'hui, budget `ccqCalendar` = 200, un échec = liste vide), `components/CcqCalendarCard.jsx` (`CcqCalendarReminder` en tête et `CcqCalendarCard` dans `Profile.jsx`), textes `ccqCalendar.*`. Aucune migration : la table est lisible par tout compte connecté et couvre 2026-2028 (0098). Pas de notification téléphone (il faudrait une tâche planifiée + `send_push`). Pour les années suivantes : une nouvelle migration de dates.

**V2.4.236 (technique).** `EmployeeEmploymentField` (`EmployeeAccountSection.jsx`) : la date du premier jour n'a plus de `min` et accepte toute date non vide (avant : `>= today`, une date passée était ignorée). Une date passée s'enregistre dans `start_date` ; `employmentChoice` la renvoie `""` (le sélecteur repasse à « Aucun », la date reste dans « Date d'embauche »). Aucun changement de base.

**V2.4.235 (technique).** `EmployeeForm.jsx` : `workOrderProblems` n'est plus enregistré dans le brouillon ni restauré (`restoreLocalDraft` le remet à `[]`) ; le blocage Field Service ne vient que de la capture lue pendant la session (`handleExtractFromImage`). L'exemption des OT prédéfinis (V2.4.233) reste. Test mis à jour (brouillon restauré, OT prédéfini ou tapé : Save actif).

**V2.4.234 (technique).** `JobEntryFields.jsx` et `EmergencyTimesheet.jsx` : `placeholder="0"` retiré du champ km (restait obligatoire : `formComplete`, `validateManagerEntry`). Tests dans `EmployeeForm.test.jsx` : OT prédéfini + `workOrderProblems` restaurés ne bloquent pas Save, un OT numérique les bloque encore ; km vide = Save désactivé, 0 = accepté.

**V2.4.233 (technique).** `EmployeeForm.jsx` : `workOrderBlocked` et `WorkOrderCheckDialog` ignorent `workOrderProblems` quand l'OT est un OT prédéfini (`matchPreset(ot, usePresetWorkOrders())`) ; avant, le brouillon restauré (`draft.workOrderProblems`) gardait le blocage d'une ancienne capture Auto-fill et Save restait désactivé pour une fiche manuelle. Les km restent obligatoires (0 accepté). Aucun changement de base.

**V2.4.232 (technique).** Sélecteur « Embauche / départ » (`EmployeeEmploymentField`) : la date du premier jour accepte aujourd'hui (`min={today}`, `>= today`) ; avant, `min` = demain et
une date d'aujourd'hui était ignorée. `signups.js` : `startsToday` ; `employmentChoice` renvoie `NEW_HIRE` aussi quand `start_date === today` (le sélecteur garde la date visible et « Aucun » efface
encore la date). `isNewHire` / `employeeStatus` ne changent pas (strictement futur) : ce jour-là la personne est « active » ou en attente d'activation, déjà sur les listes (`live-crew.js`), et
`pending_signups` la recompte (0110 : `start_date <= aujourd'hui`). Texte `employees.newHire.today`. Aucun changement de base.

**V2.4.231 (technique).** « À vérifier avant d'approuver » : `src/lib/anomaly-seen.js` (`seenId` = clé de l'anomalie, plus les jobs « autres » pour `ot_reused` afin qu'une
3e job sur le même OT ré-alerte ; `readSeen` / `unseenAnomalies` / `seenCount`, hooks `useSeenAnomalies(userId)` → `localStorage` `sparklog.seenAnomalies.<userId>`, entrées de plus de 90 jours
retirées, et `useAnomaliesFolded` → `sparklog.anomaliesFolded`). `ManagerDashboard.jsx` : titre cliquable (`aria-expanded`) qui replie l'encadré, bouton « J'ai vu » par ligne,
« Réafficher les alertes vues », et `anomalyWarning` (confirmation d'approbation) n'utilise que les alertes non vues ; `TodoInbox.jsx` filtre aussi (`buildInbox`, `approveDay`) et a le même bouton.
Choix : stockage navigateur (aucune migration) — un « vu » partagé entre gestionnaires demanderait une table. Les anomalies détectées (`job-anomalies.js`) ne changent pas.

**V2.4.230 (technique).** Mots de passe : le projet Supabase exige une minuscule, une majuscule, un chiffre et un symbole (`!@#$%^&*()_+-=[]{};'\:"|<>?,./`~`) et active la
vérification des mots de passe divulgués (lu dans `auth_logs`, 2026-11-02). `authErrorKey` (`src/lib/mfa.js`) distingue maintenant `auth.passwordCharacters`
(raison `characters` ou message « at least one character of each »), `auth.passwordLeaked` (`pwned` / « known to be weak »), `auth.passwordShort` (`length`) puis
`auth.passwordWeak` ; priorité aux caractères manquants. `Login.jsx` (`clearError` à chaque saisie) et `ResetPassword.jsx` effacent l'ancienne erreur dès qu'un champ
change ; `auth.passwordRequirement` (règle complète) est affiché sous le champ à l'inscription. Aucun changement de base ni de fonction Edge.

**V2.4.229 (technique).** Ajout de `docs/governance/politique-confidentialite.md` (brouillon, Loi 25) ; aucun code changé. Faits vérifiés dans le code pour le rédiger : aucune géolocalisation ni
outil d'analyse / publicité (`package.json`, `src/`) ; photos recompressées (EXIF / GPS retirés, `evidence-file.js`) ; conservation des preuves 30 jours par défaut
(`overtime_settings.evidence_retention_days`, 1–365) ; brouillons locaux 30 jours (`draft-store.js`) ; lecture des captures par OCR.space depuis le navigateur (`ocr.js`) ;
courriels d'annonces Resend / Brevo (README) ; base Supabase `us-west-2`. À compléter par la propriétaire : responsable, durées (comptable), fournisseurs / ententes.

**V2.4.228 (technique).** Documentation seulement : section « Loi 25 » de `NOOB.md` (obligations, ce que l'app couvre déjà, reste à faire) ; le `doPost` Google est collé
et redéployé (2026-11-02), point retiré. Constats utiles pour la conformité : base Supabase en région `us-west-2` (hors Québec → ÉFVP et entente écrite à prévoir),
sous-traitants qui reçoivent des renseignements : Vercel, Google Sheets / Apps Script, OCR.space, service de courriel, notifications push. Ajouts possibles à coder sur
demande : export « Mes renseignements » (portabilité), registre des incidents, accusé de réception de la politique, purge des anciens employés, déplacement de la base
dans une région canadienne.
**V2.4.227 (technique).** Ajout de `docs/governance/consentement-sparklog-punch.md` : modèle de lettre de consentement à l'utilisation de Sparklog comme punch
(recommandation AECQ / Annexe N : références à valider contre le texte officiel, entre crochets). Aucun code changé ; seule la version change.

**V2.4.226 (technique).** Ménage de `NOOB.md` seulement (aucun code) : retrait des « À faire » faits (migrations 0120 à 0131 vérifiées appliquées dans la base le 2026-11-01 ;
`classify_week` redéployée le 2026-10-30 avec le moteur 2.7.0 — `push_approved_batch` n'importe que `RETURN_WITH_BENEFITS`, rien à redéployer ; `cleanup_overtime_evidence`
et `process_inventory_screenshot` redéployées ; entrepôts Alma, Charlevoix, Rimouski à « Oui »). Ajout : barèmes 2027 à saisir avant le 1er janvier.

**V2.4.225 (technique).** Fiche employé guidée : `REQUIRED_EMPLOYEE_FIELDS` (`src/lib/employee-fields.js`, [colonne, clé de texte, onglet]), `getMissingEmployeeItems`
(`{ field, label, tab }`), `getMissingEmployeeFields` (étiquettes, V2) et `missingCountByTab`. `components/employees/missing-fields.js` : contexte
`MissingFieldsContext` (Set des colonnes vides) + `useIsMissing` ; `EmployeeField` reçoit `name` et se met en rouge (`MISSING_CONTROL`, « à remplir »),
`PayOptionsFields` fait de même pour `km_rate`. `EmployeeTabs` fournit le contexte, affiche un compteur rouge par onglet (`aria-hidden`, pas dans le nom de
l'onglet) et `MissingFieldsAlert` (rouge) ouvre l'onglet au clic (`onGo`). Les rôles non CCQ restent exemptés. Retiré : le point ouvert sur la
facturation MÉDIC de la semaine du Nouvel An (congé de la construction).

**V2.4.224 (technique).** « Barèmes annuels » : migration 0131, table `statutory_rate_sets` (`tax_year` → `data` jsonb, 8 sections : `rrq`, `ei`, `rqap`,
`federalTax`, `quebecTax`, `fss`, `labourStandards`, `workforceFund`), lecture gestionnaire, écriture seulement par `set_statutory_rate_set` /
`delete_statutory_rate_set` (`is_privileged()`, forme vérifiée, audit `statutory_rates_set` / `statutory_rates_deleted`, on ne retire qu'une année
pas commencée). `src/payroll/rules/rule-overrides.js` : `validateRuleData` (maximums = gains × taux à 0,06 $ près, paliers croissants, constantes K à
1 $ près du calcul `bracketConstants`, 2e cotisation RRQ = limite basse = maximum des gains), `setRuleSetOverrides` (n'installe que les barèmes
valides), `getRules` lit l'override avant le barème codé, `resolveTaxYear` (année sans barème = dernier précédent, `assumedFrom`), `payYearForWeek`
(année de paie = début de semaine + 11 jours, comme `WeeklyReportButton`). `employee-week.js` n'écrit plus `taxYear: 2026` en dur : année de paie
résolue, `ytd` avec le barème de cette année, et un talon sur barème de repli reçoit `taxYearAssumedFrom` + une raison de révision. Chargé avec
les taux simples par `loadPayrollRates` (un échec = barème codé). `statutory-fields.js` (champs, texte ↔ nombre, K recalculés, `diffRuleData`),
`StatutoryRatesManager.jsx` (onglet `statutory-rates`), `missingScaleAlert` (pastille de Configuration dès 28 jours avant le 1er janvier, puis tant que
l'année manque). Limites : `PayrollEngineTester` garde `taxYear: 2026` ; les montants de la CNESST et du barème syndical ne sont pas ici ; règles
de paie non signées par un spécialiste (ADR 0001).

**V2.4.223 (technique).** Rappel avant un changement de taux : `upcomingRateChanges(today, overrides, 28)` (`src/lib/payroll-rates.js`) réunit les dates
déjà dans le code (`MEDIC_RATES`, `MEDIC_TAX_RATES`) et les lignes `payroll_rates` pas encore en vigueur ; `rateAlertStage(jours)` = 4 (≥ 15 j),
2 (8–14 j), 1 (≤ 7 j). Hook `usePayrollRateAlerts` (rafraîchi par `PAYROLL_RATES_EVENT`, aussi envoyé après la 1re lecture) : pastille
`v3-config` dans `ManagerLayout` (gestionnaires et propriétaire) et encadré en tête de `PayrollRatesManager`. Aucune notification téléphone.
Pour qu'une nouvelle date connue du code déclenche le rappel, elle doit être dans une de ces listes ou saisie dans la table.

**V2.4.222 (technique).** « Taux et barèmes » : migration 0130, table `payroll_rates` (`rate_key` × `effective_from` → `value`, 9 clés
verrouillées par un check et par `payroll_rate_max`), lecture `get_my_role() = 'manager'`, écriture seulement par `set_payroll_rate` /
`delete_payroll_rate` (`is_privileged()` = propriétaire + aal2 ; bornes par clé ; audit `payroll_rate_set` / `payroll_rate_deleted` ; on ne
retire qu'une ligne pas encore en vigueur). Code : registre de surcharges datées dans `ccq-benefits.js` (`setPayrollRateOverrides`,
`payrollRateOn(key, date, fallback)`, `PAYROLL_RATE_KEYS`) ; les constantes du code restent la valeur de repli (table vide = aucun
changement). `medicRatesOn`, `medicTaxRateOn`, `employerSocialBenefitRateFor(level, date)`, `employeePensionRateFor(level, date)` et
`computeCcqLevies({ date })` les lisent ; `employee-week.js` passe la date de la semaine. `src/lib/payroll-rates.js` (lecture, RPC, hook
`usePayrollRatesReady`) ; `ManagerLayout` attend la 1re lecture avant d'afficher une page (un échec = valeurs du code) ;
`PayrollRatesManager.jsx` (onglet `payroll-rates` de Configuration, règle `config-settings`, propriétaire seul pour écrire). Hors
périmètre : salaires par niveau (déjà `ccq_rate_snapshots`), avantage imposable 3,377 $ et équipement de sécurité 0,80 $/h, barèmes
syndicaux, CNESST/FSS/FDRCMO (déjà dans `payroll_employer_settings`). Les pages d'ancien talon / banc d'essai gardent leurs taux
explicites. Pas de fonction Edge touchée (les montants ne sont pas dans le moteur d'heures).

**V2.4.221 (technique).** `MEDIC_TAX_RATES` / `medicTaxRateOn(date)` (`src/payroll/ccq-benefits.js`, exportés par `src/payroll/index.js`) : taxe sur les primes
d'assurance de la retenue MÉDIC, 9 % jusqu'au 2026-12-31 puis 9,975 % dès 2027-01-01 (avis CCQ du 2026-10-28). `computeCcqBenefits` : `medicProvincialTaxRate`
vaut `null` par défaut (= taux daté de la semaine de paie) et la taxe est arrondie avec 5 décimales (9,975 % ne devient pas 9,98 %) ;
un taux explicite reste respecté (banc d'essai, vieux talons). Fiche des règles de paie et `docs/rules/compensation-rules.md` à jour.
Pas de point ouvert pour la semaine du 27 déc. 2026 au 2 janv. 2027 : congé de la construction, aucune heure travaillée (décision de la propriétaire du 2026-11-01).

**V2.4.220 (technique).** Pastille du menu « Registre d'accidents » retirée : `ManagerLayout.jsx` ne compte plus les dossiers ouverts ; code mort supprimé
(`fetchOpenAccidentCount`, `ACCIDENT_EVENT` et son envoi par `AccidentRegister`). L'étiquette « Ouvert » et le filtre « Ouverts (n) » de la
page restent (`openAccidentCount`). Remplace la pastille de V2.4.197.

**V2.4.219 (technique).** Migration 0129 : RPC `evidence_download_alert(p_days default 21)` (security definer, `get_my_role() = 'manager'` sinon zéros ;
exécution `authenticated` seulement) : photos gardées (`overtime_evidence`, `parking_receipts` + `extra_storage_paths`) absentes de
`evidence_downloads` et âgées de `p_days` jours ou plus, ou supprimées dans 3 jours ou moins ; renvoie total / temps supp / stationnement /
plus vieux / jours restants (aucun chemin ni nom). `src/lib/evidence-alert.js` (`fetchEvidenceAlert`, hook `useEvidenceAlert`,
`EVIDENCE_ALERT_EVENT` envoyé après un téléchargement) ; `components/manager/EvidenceAlertBanner.jsx` en tête de `TodoInbox` (avec lien) et
de la vue Justificatifs de `ManagerDashboard`. Pas de pastille de menu ni de notification téléphone.

**V2.4.218 (technique).** `EvidenceDownload.jsx` : un seul menu de semaine (`week` = choix ou la plus récente de `evidenceWeeks`), plus de plage ;
`zipEntryNames(files, labels, folders)` met chaque photo dans un dossier par type (`evidence.download.folderOvertime` / `folderParking`) ;
nom du fichier `evidence.download.zipFile` (« justificatifs Sem{numéro CCQ} ») + `zipPart` (« - partie N », N = déjà téléchargés ÷ 100 + 1,
seulement si la semaine dépasse `MAX_FILES_PER_ZIP`). Textes `evidence.download.from / to / firstWeek / lastWeek / zipName` retirés.

**V2.4.217 (technique).** `docs/reference/formation-hilo-field-2024-08-20.md` : texte (sans images) du PDF « Formation Hilo.pdf » (Drive, « Talons paie »,
formation installateurs Hilo du 2024-08-20). Le PDF complet (12 Mo, 109 pages, REV01) `formation-hilo-field-2024-08-20.pdf` a été téléversé par le propriétaire sur GitHub ; son renommage dans
l'éditeur web de GitHub l'avait réduit à 2 octets (rétabli une première fois depuis le commit d'origine `cb73850`, puis re-téléversé par le
propriétaire sous son nom final) — ne pas renommer un PDF dans l'éditeur web. Document tiers
publié dans un dépôt public : à retirer si Hilo le demande. `docs/reference/explications-des-defis-hilo.pdf` : PDF de 7 pages (« guide pour
installateur Hilo.pdf » du Drive, renommé « Explications des Défis Hilo »), copié tel quel. Aucun code changé.

**V2.4.216 (technique).** `supabase/functions/_shared/equipment_names.js` (`EQUIPMENT_NAMES`, `canonicalEquipmentName(code, fallback)`, ré-exporté par
`src/lib/equipment-names.js`) : nom officiel des 17 codes connus. Appliqué dans `parseInventoryText` (`process_inventory_screenshot/parse.ts` —
**fonction à redéployer**, elle importe `_shared`), `mergeInventoryItems`, `knownEquipment`, `fetchStockLevels` (`item_name`) et
`inventory-alerts`. Migration 0128 : réécrit `inventory_items.name` et `inventory_min_ratios.name` des codes connus (un test verrouille la
migration contre `equipment_names.js`). Code inconnu = nom lu. Pour ajouter un appareil : la liste JS et la migration suivante.

**V2.4.215 (technique).** `inventoryReadingBlock` : l'état `photos` (aucune ligne lue) compte comme un problème (« retake », puis « override » avec
complément ou tentative) ; `InventoryStep.jsx` (`RetakeNote` : `form.inventory.nothingRead`, `retakeListButton`). Migration 0127 : table
`inventory_reading_log` (compteurs seulement : état de lecture, lignes lues / attendues / manquantes / illisibles, `step_block`
wait / retake / override, `reading_known`, `complement_tried`) ; RLS : insertion par l'employé pour lui-même (le trigger fixe
`user_id` et l'heure), lecture gestionnaire, jamais de mise à jour ni de suppression. `useInventoryStep.recordContinue(block)` est appelé
au clic sur « Continuer » (sans bloquer ni échouer). Pas encore d'écran : lecture par SQL. Constat du 2026-10-30 : une lecture
entièrement échouée ne demandait rien ; pour une lecture à 15 / 17 le blocage aurait dû s'afficher (cause non établie avant ce journal).

**V2.4.214 (technique).** `buildWeeklyReport` : `calculatePayrollEntries(..., { messierMethod: messierMethod && !isSubcontractorRole(role) })` —
la méthode « Messier » (retour sans avantages converti en régulier) ne s'applique plus aux sous-traitants du Sommaire imprimable :
le retour reste dans `returnNoBenefitMinutes` (colonne « Retour »), le régulier n'inclut plus le retour. Même total payé. L'onglet
Rapport › Sommaire (`WeekViewTab`) n'utilisait déjà pas cette méthode.

**V2.4.213 (technique).** `weekly-report.js` : en-tête `returnHeader` (« Retour » pour la catégorie `subcontractor`, « Retour s.a. » sinon), colonne
« Retour » (`returnNoBenefitMinutes`, tout le retour d'un sous-traitant) dans le tableau Sous-traitants ; `WeekViewTab.jsx` : colonne et
libellé `week.return` pour les sous-traitants. Aucun calcul changé.

**V2.4.212 (technique).** `lookbackWorkdays(today, holidays)` (`workdays.js`, ré-exporté par `todo-inbox.js`) : jour ouvrable précédent
puis chaque jour ouvrable plus ancien jusqu'au lundi de la semaine courante (fériés sautés). `TodoInbox.load` lit les fiches de
tous ces jours en une requête (`in("job_date", …)`) et garde le plus récent qui a encore quelqu'un de non soumis
(`state.prevDay` = ce jour : titre, rappel et déverrouillage le visent). « Pas soumis hier » de `LiveCrew` n'a pas changé.

**V2.4.211 (technique).** `lowStockByWarehouse(rows)` renvoie `{ name, count, rows }` ; `lowStockCount(levels)` compte maintenant les
**entrepôts** (une notification par entrepôt, pastille du menu dans `ManagerLayout` et bouton `InventoryMinimumsLink`, qui reçoit
`lowStockByWarehouse(lowStock).length`). `InventoryLowStock.jsx` : un bloc par entrepôt, appareils bas en rouge (`lowLine`) ; le
lien « Voir le détail » reste seulement hors de la page Minimums. Texte `mgr.inventory.ratios.lowTitle` = entrepôts. Pas de
notification téléphone (hors périmètre).

**V2.4.210 (technique).** `EvidenceDownload.jsx` : deux menus de semaine (`evidenceWeeks(files)` dans `evidence-download.js`, semaines
dimanche → samedi qui contiennent des photos) à la place des deux dates ; `selectEvidence` reçoit toujours `from` / `to` en dates
(début de la 1re semaine, fin de la dernière). Aucun changement de base ni de fonction Edge.

**V2.4.209 (technique).** Migration 0126 : `parking_receipts.expires_at` / `pictures_purged_at`, `storage_path` nullable, trigger
`parking_receipts_set_expiry` (échéance = `overtime_settings.evidence_retention_days` à l'insertion, non modifiable par le
navigateur ; rattrapage des anciennes lignes à `created_at` + durée), `validate_parking_receipt_paths` accepte un reçu purgé.
`cleanup_overtime_evidence` : retire les photos échues (`parking-receipts`), vide la ligne (le montant et l'état restent) et
efface les marques `evidence_downloads` des photos disparues — **fonction à redéployer** ; tant qu'elle ne l'est pas, rien n'est
purgé. Table `evidence_downloads` (`bucket`, `storage_path`, clé primaire = pas de doublon ; RLS gestionnaire lecture / insertion,
jamais de mise à jour ni de suppression côté navigateur). `src/lib/evidence-download.js` (catalogue, `selectEvidence`,
`zipEntryNames`, `downloadEvidenceZip` : 100 photos au plus par ZIP, une photo illisible n'est pas marquée), `src/lib/zip-store.js`
(écrivain ZIP « stocké », sans dépendance), `components/manager/EvidenceDownload.jsx` (carte « Justificatifs » de
`ManagerDashboard`), budget `evidenceDownload`. Les reçus de repas ne sont pas inclus.

**V2.4.208 (technique).** `OtField.jsx` remplace `OtPresetSelect.jsx` : une seule case (`Input` + bouton flèche + liste
`role="listbox"`) dans `JobEntryFields` et `EmergencyTimesheet` ; texte `form.otPresetPlaceholder` retiré. Bouton et fenêtre « Inventaire du crew » retirés de `InventoryScreenshotsPanel.jsx` ; code mort
supprimé : `sumCrewInventory`, `sumCrewDefective` (`inventory-items.js`), leurs tests et les textes `mgr.inventory.crew*`
(la somme des produits défectueux de l'équipe n'existe plus dans l'app). `apps-script-doPost.js` :
`FIRST_TRIP_PAID_KM` / `FIRST_TRIP_PAID_FROM` (65 km, 2026-10-11) — la 1re fiche du jour de 65 km ou plus (`km_total` ou
`km_aller + km_retour`) garde son trajet payé (minutes non payées 0). Le script se colle à la main dans Google (fait le 2026-11-02). `push_approved_batch` envoie déjà `km_aller` / `km_retour`, pas de redéploiement de la fonction.

**V2.4.207 (technique).** Premier trajet payé dès 65 km (décision de la propriétaire du 2026-10-30, **moteur 2.7.0**) :
`FIRST_TRIP_PAID_FROM_KM` (65 km, depuis 2026-10-11) et `jobKilometres` (`km_total`, ou `km_aller + km_retour` si plus grand) dans
`payroll_engine.js` ; `firstTripUnpaidMinutes` saute la 1re fiche de la journée quand elle atteint le seuil ;
`dayFirstTripUnpaidMinutes` garde la date du jour. Jumeaux SQL recréés par la 0125 : `reconcile_overtime_meal` (souper) et
`validate_job_submission_contract` (preuve des 8 h payées). Les lectures de fiches qui alimentent ces calculs prennent `km_total,
km_aller, km_retour` (`day-rounding.js`, `CcqJsonExport`, `overtime-evidence-check.js`, `meal-claim-request.js`, fiche en cours de
`EmployeeForm`). **Les fonctions Edge qui importent le moteur (`push_approved_batch`, `classify_week`) sont à redéployer.** Règle de
paie non signée par un spécialiste (ADR 0001). Le réglage Trajets et frais « temps entrepôt → client : payé CCQ » n'est toujours pas
lu par le moteur (§6.1 D) : en attendant, l'option + ce seuil sont toute la règle. Fiche des règles et
`docs/rules/compensation-rules.md` (FIRST_TRIP) à jour.

**V2.4.206 (technique).** OT prédéfinis : table `preset_work_orders` (0124 ; lecture pour tout compte connecté, écriture
`get_my_role() = 'manager'` ; libellé de 2 à 60 caractères, jamais un numéro de 4 chiffres ou plus car `normalized_ot` /
`ot_reuse_for_jobs` (0108) ne regardent que les numéros ; unique sans casse) ; `jobs.ot` reste du texte libre, le libellé choisi y
est écrit tel quel. `src/lib/preset-work-orders.js` (hook `usePresetWorkOrders` : copie locale `sparklog.presetWorkOrders`, repli sur
`DEFAULT_PRESET_LABELS` si la lecture échoue, `PRESETS_EVENT` après un changement ; `matchPreset`, `cleanPresetLabel`,
`moveChanges`) ; `OtPresetSelect.jsx` (remplacé en V2.4.208 par `OtField.jsx`) dans `JobEntryFields` et `EmergencyTimesheet` ; écran `PresetWorkOrdersManager.jsx`
(onglet `ot-presets` de Configuration, règle de `config-settings`). L'arrivée et les km restent obligatoires comme pour tout OT
(0 km accepté) : à revoir avec la propriétaire pour une formation sans déplacement.

**V2.4.205 (technique).** `WeekSnapshot.jsx` : état `offset` (initialisé par la prop `weekOffset`), filtre de semaine
(`<select>` + flèches, `SNAPSHOT_WEEKS` = 13 semaines dont la courante, `weekChoices`), tableau atténué pendant le chargement
d'une autre semaine ; les deux boutons de `ManagerDashboard` ouvrent la même vue (titre `live.week.dialogTitleAny`). Chaque
changement de semaine relit les fiches de la semaine et le compteur d'arrondi (`loadDayRounding` jusqu'à sa fin).

**V2.4.204 (technique).** `WeekSnapshot.jsx` plus compact : `visibleDays` (samedi / dimanche seulement si une cellule a `count > 0`),
heures + km sur une ligne par carré, total + km sur une ligne et une seule ligne « payé · arr. · cpt » (minutes signées,
`signed()` ; textes `rounding.week.line` / `rounding.week.note`). `PayrollWeek` garde son propre format (`counterOnly`).

**V2.4.203 (technique).** Explication de la pastille d'« Inventaire » : hook `useLowStock` (`src/lib/use-low-stock.js`, lignes
`is_low && alert_enabled`, rafraîchi par `RATIOS_EVENT`) lu par `InventoryScreenshotsPanel` ; `InventoryLowStock.jsx` (ligne
rouge avec `lowStockByWarehouse`, ou liste détaillée sur `InventoryMinimums`) ; `InventoryMinimumsLink` reçoit `count` ;
`title` de la pastille du menu (`mgr.inventory.badgeTitle`). La pastille additionne toujours avis négatifs + appareils sous le
minimum (`ManagerLayout`).

**V2.4.202 (technique).** Bouton et fenêtre « Entrepôt » retirés de `InventoryScreenshotsPanel.jsx` (remplacés par
`InventoryMinimums`) ; code mort supprimé : `sumRegionInventory`, `inventoryRegionChoices` (`inventory-items.js`),
`sumGroupInventory`, `inventoryGroupChoices` (`employee-groups.js`), leurs tests et les textes `mgr.inventory.storage*`. Le
total par région n'existe plus dans l'app ; la fenêtre « Équipe » (`sumCrewInventory`) reste.

**V2.4.201 (technique).** Arrondi visible : `weekRoundingSummary(rounding, start, end)` (`day-rounding.js` : jours comptés
de la semaine, minutes travaillées / payées, écart, compteur en fin de semaine) lue par `WeekSnapshot.jsx` (ligne « payé /
arrondi / compteur » sous le total ; `loadDayRounding` en plus, un échec n'empêche pas l'affichage) et `PayrollWeek.jsx`
(colonne « Arrondi »). Le compteur compte les fiches soumises / modifiées / approuvées (`ROUNDING_STATUSES`) : en Paie de la
semaine, l'écart peut donc inclure des jours soumis pas encore approuvés (le talon, lui, ne part que des fiches approuvées).

**V2.4.200 (technique).** Fichiers du registre d'accidents : bucket privé `accident-files` (0123, 10 Mo, types listés : images
JPEG / PNG / WebP, PDF, Word, Excel, texte, CSV ; pas de HTML ni de SVG) avec une seule politique de stockage
`get_my_role() = 'manager'` (aucune lecture employé ni destinataire) ; table `accident_files` (chemin
`<accident>/<uuid>.<ext>`, RLS gestionnaire, droits `select / insert / delete`, jamais `update`, trigger de garde : auteur,
horodatage et 20 fichiers au plus ; trigger d'audit `accident_file_added` / `accident_file_removed`) ;
`src/lib/accident-files.js` (classement par extension, images recompressées en JPEG, rangée créée avant l'objet retiré en
cas d'échec) ; `AccidentFiles.jsx` ; `accidents.js` lit `accident_files(count)`. Les fichiers d'un nouveau dossier sont
envoyés après sa création ; un échec ramène au dossier enregistré pour les rajouter.

**V2.4.199 (technique).** Minimums par entrepôt : page `InventoryMinimums.jsx` (`#/manager/inventory/minimums`, sous-page
déclarée dans `MANAGER_SUBPAGES` de `manager-nav.js` : titre et garde, hors menu) ouverte par `InventoryMinimumsLink.jsx`
(bouton de la page Inventaire, avec le nombre d'appareils sous le minimum). Colonne `employee_groups.low_stock_alert` (0122,
défaut faux = « Non ») ; la RPC `inventory_stock_levels()` est recréée avec `alert_enabled` ; `lowStockRows` ne garde que
`is_low && alert_enabled` (pastille du menu et bouton). Un entrepôt « Non » n'affiche rien de plus. Données saisies hors
dépôt (74 lignes `inventory_min_ratios`, tableau du courriel du 2026-10-28).

**V2.4.198 (technique).** Stock minimum : table `inventory_min_ratios` (0121, `group_id` × `code`, `per_employee` > 0, RLS
`get_my_role() = 'manager'`) et RPC `inventory_stock_levels()` (membres non en pause du groupe ; stock = dernière liste
de chaque membre sur 7 jours, une ligne par code ; `is_low` seulement si au moins une liste comptée) ;
`src/lib/inventory-ratios.js` ; `InventoryRatios.jsx` (bannière + gestion) dans `InventoryScreenshotsPanel` ; la pastille
d'`inventory` additionne les appareils sous le minimum (`ManagerLayout`). Le « stock » ignore les employés sans liste :
afficher « — » plutôt qu'une fausse alerte. Pas de notification téléphone ni de ratio par défaut pour tous les entrepôts.

**V2.4.197 (technique).** Registre d'accidents : table `accident_log` (0120, RLS `get_my_role() = 'manager'`, aucun droit
`delete`, trigger `accident_log_guard` pour auteur / horodatages / fermeture, trigger d'audit `accident_logged` /
`accident_status`) ; `src/lib/accidents.js` (validation, filtre, CSV protégé contre les formules, budget `accidentLog`) ;
`components/manager/AccidentRegister.jsx` ; entrée de menu `accidents` (groupe Équipe) avec pastille des dossiers ouverts
(`ACCIDENT_EVENT`).

**V2.4.196 (technique).** `validateManagerEntry` (`manager-entry.js`) refuse un champ km vide (0 accepté) ;
`WeekSnapshot.jsx` ajoute `km_*` à sa requête et affiche `getKilometreBreakdown` par jour ; `WeekViewTab.jsx` et
`weekly-report.js` ajoutent le tableau « Sous-traitants » (`regularMinutes` / `ot50Minutes` / `ot100Minutes`).

### 6.1 Paie — ce qui manque pour passer de « estimation » à « paie finale »

Le calcul des **heures** (8 h/jour, 1re heure sup. de la semaine à 1,5×, le reste à 2×, souper, options
par employé) est en production et testé. Les **montants** (avantages CCQ + retenues DAS) restent un banc
d'essai `requires_review` (`RULE_VERSION.status = "draft"`, `src/payroll/rules/2026.js`). Il manque :

**A. Documents officiels / sources** — reçus le 2026-10-13 et rangés dans `docs/reference/` ; le
détail article par article est dans `docs/rules/compensation-rules.md` (« Primary-source citations »).
- Déjà reçu et codé (détail : `docs/rules/compensation-rules.md`) : convention ICI 2025-2029 (8 h / 40 h, 1re heure
  sup. de la semaine à 1,5× puis 2×, repas 30 $, chef d'équipe 8 %, 13 %, annexe C, retraite) ; avantages sociaux
  patronaux ACQ (8) par niveau ; prélèvement CCQ 0,75 % + 0,75 % sur salaire + prime CCQ + 13 %
  (`team_leader_premium` = prime **hors CCQ**, `team_leader_premium_ccq` = prime **CCQ**, 0083) ; CNT 0,06 % jusqu'à
  103 000 $ (le drapeau `unvalidated` de `rules/2026.js` peut passer à `false` avec la citation TP-1015.G §7).
- [ ] **FDRCMO** : seuil 2 M$ et 1 % confirmés (TP-1015.G §8). La **masse salariale** se saisit dans
  Configuration › Paramètres › Paie (`payroll_employer_settings.annual_payroll_estimate`, estimation saisie au 2026-10-27 ;
  le vrai total = case A des relevés 1, à confirmer par le comptable en décembre).
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
  Autre question au comptable : la paie fixe de la propriétaire (> 40 % des actions, exclue de l'AE) est-elle
  cotisable à la CNESST ? Aujourd'hui l'app la cotise.
- [ ] **Cotisations syndicales** : confirmer pour chaque employé son association **et son local**
  (FIPOE / local 568 : formule électricien par local et période d'apprentissage) ; date de début exacte
  de l'ancienne règle SQC (seule la fin, 2026-06-27, est sourcée).

**B. Informations par employé (formulaires)**
- [ ] **TD1 (fédéral) et TP-1015.3 (Québec)** de chaque employé : les montants se saisissent dans
  Équipe › Employés › fiche › Impôts (`employee_tax_profiles`, gestionnaires/propriétaire seulement, V2.4.103) et sont
  utilisés par Talons, DAS et Calcul — reste à les saisir. Vide = montant personnel de base. Au 2026-10-27 : **aucun
  saisi** (les 2 lignes existantes ne portent que la paie fixe / exclusions AE et RRQ). NAS : 1 seul en base, chiffre de
  contrôle invalide (à ressaisir) ; les autres manquent pour le rapport mensuel CCQ.
- [ ] **Paie des semaines 43 et 44** (2026-10-11 → 10-24 ; la 43 est la 1re semaine payée par Sparklog) : au
  2026-10-27, semaine 43 = 328 fiches soumises non approuvées (21 approuvées), semaine 44 = 440 soumises (0 approuvée),
  aucune ligne `payroll_period_ledger` après le cumul Dynacom du 10-10. Approuver, puis Paie de la semaine ›
  Comptabiliser, une semaine à la fois.
- [ ] **Dates d'embauche / de réembauche** (`start_date`, `rehire_date`, 0119) à faire vérifier par la propriétaire :
  elles alimentent les cases 10 / 11 du relevé d'emploi (`roeEmploymentDates`).
- [ ] **Échelon / période d'apprentissage** et taux horaire confirmés contre le certificat CCQ
  (liste de contrôle « CCQ monthly-report » du README).
- Cumul d'avant Sparklog (fait le 2026-10-16) : une ligne `payroll_period_ledger` au **2026-10-10** par employé (35),
  copiée du « Cumulatif des employés » Dynacom jusqu'à la semaine 42 (Drive du propriétaire, contient les NAS : jamais
  copié ici). `planPayrollWeek` part de cette ligne ; trigger `protect_dynacom_cumulative` (0099) la protège ;
  `isDynacomOnlyWeek` / `isClosedBeforeSparklog` (`src/lib/payroll-opening.js`) ; colonne Cumulatif en semaine 42
  (`dynacom-cumulative-talon.js`). « Heures » gonflées pour 4 chefs d'équipe (lignes de prime) : seulement la ligne
  Heures des talons et le RE (corriger en important leur talon de la semaine 42). Si Dynacom met à jour les cumuls,
  remplacer les lignes du 10-10 depuis le nouveau PDF. 5 anciens employés : `ancien.<nom>@messier-connexion.invalid`.

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
  avec « Chargé à Britton ». Grille et décisions : `NOOB.md` étape 6 (le champ de plus dans la fiche de temps n'est plus prévu, décision du 2026-10-26 ; retour maison
  payé dès 65 km ; plus de 65 km = temps de trajet CCQ dans le 40 h, non-CCQ au-delà ; un taux km par employé ; taux Britton
  inconnu). V2.4.155 (migration 0101) : saisie dans **Gestion › Admin › Trajets et frais** (`TravelRulesManager.jsx`,
  `src/lib/travel-rules.js`) — table `travel_pay_rules` (employé × ligne × date d'effet ; lecture gestionnaire, écriture
  seulement par le RPC `set_travel_pay_rule`, gestionnaire / propriétaire, une ligne `travel_rule_set` au Journal par appel).
  Le moteur de paie ne les lit **pas encore** (défaut de chaque ligne = ce que l'app paie aujourd'hui).
  Reste : la propriétaire finit de remplir les lignes (145 réglages au 2026-10-27) ; taux Britton ; moteur + talon qui lisent ces options ; rapport
  « Chargé à Britton » par semaine.
- [ ] **Heures payées la nuit d'un changement d'heure** : le moteur de paie compte l'heure affichée
  (`minutesBetween(depart, fin)`), pas le temps réellement écoulé (`started_at` / `ended_at`). Une fiche qui chevauche
  l'heure répétée de l'automne est payée 1 h de moins que travaillée (au printemps, 1 h de trop). Au 2026-10-25 : aucune
  fiche de nuit ni de fin de semaine sur 1 564. Ne pas changer le moteur sans règle confirmée (spécialiste, ADR 0001).

### 6.2 Écarts code ↔ convention / documentation à trancher (aucune règle modifiée)
- [ ] `docs/rules/2026-das-payroll.md` dit l'impôt du Québec « placeholder », alors que `rules/2026.js`
  le marque vérifié contre TP-1015.F (2026-01) ; les commentaires de `EI` disent encore `_PLACEHOLDER`
  alors qu'il est vérifié (T4127). Les vrais restants : CNT, FDRCMO, CNESST.

Déjà tranché et codé (référence ; détail et historique dans `docs/rules/compensation-rules.md`) :
- **Retour à l'entrepôt** : jamais de temps sup. ; sans avantages par défaut ; `return_with_benefits_to_8h` = avec
  avantages jusqu'à 40 h dans la semaine moins 8 h par férié en semaine, travail d'abord puis retour par date (moteur
  2.6.0, depuis la semaine 42). Colonne `return_overtime_no_benefits` dépréciée (à supprimer, §6.3).
- **Méthode « Messier »** (défaut de Talons / DAS / Paie de la semaine / Coûts) : le retour sans avantages devient du
  régulier CCQ jusqu'au même plafond de semaine, jamais samedi / dimanche / férié (`src/lib/messier-method.test.js`).
  Écart de 1,44 $ encore à expliquer sur le talon de la semaine 42 qui l'a révélée. Pas utilisée par les fonctions Edge.
- **Prime de chef d'équipe en temps sup.** : option `team_leader_premium_overtime` (décochée = heures normales seulement).
- **Souper** : dû dès 615 min de travail sans le retour (`isMealEligible`, `reconcile_overtime_meal`) ; le 2e repas
  (20.07, « quatre autres heures ») n'est pas codé.
- **Premier trajet non payé** (option par employé) : payé quand la 1re fiche de la journée fait **65 km ou plus** (65 compte), depuis le
  2026-10-11 (moteur 2.7.0, 0125).
- **Arrondi des journées** : au 15 min, compteur par employé (`paid = round15(worked − compteur)`), depuis la
  semaine 43, compteur à 0 (moteur 2.6.1). Pas appliqué à l'export Google Sheet.
- **MÉDIC** : 0,68 $ / 2,93 $ jusqu'au 2027-04-24, puis 1,06 $ / 3,31 $ (`medicRatesOn`) — à confirmer avec la CCQ
  avant cette date ; l'annexe C3 entière change aussi (nouvelle grille ACQ à fournir).
- **Samedi / dimanche / fériés** (moteur 2.3.0) : samedi tout en temps sup. (1,5× si libre, puis 2×), dimanche et
  fériés à 2× ; la liste des fériés (`company_holidays`) est passée à tous les appels. Saisie employé bloquée ces jours-là.
- **Fériés et 13 %** : un férié n'est pas payé sur le talon, il l'est par la part de 5,5 % du 13 % (`weekCongesIndemnity`).
- **Dîner** : les employés l'enlèvent eux-mêmes de leur saisie.
### 6.3 Technique (code) — ouvert

Ce qui est fait est dans l'historique Git (V2.4.104 → V2.4.195). Ouvert, du plus utile au moins utile :

- [ ] **CNESST sur le salaire admissible** (`calculateCnesst`, `src/payroll/employer/cnesst.js`) : dès que la règle de
  l'excédent est connue (§6.1 A). Toucher aussi la fiche des règles (`pay-rules-reference.js`).
- [ ] **Moteur de paie qui lit `travel_pay_rules`** (§6.1 D) + rapport « Chargé à Britton » ; une fixture de parité par
  ligne avant de coder (règle « Payroll logic forks »).
- [ ] **Ménage des fonctions Edge** (constaté le 2026-10-27) : déployées sans source dans le dépôt — `send_sms`,
  `quick-handler` (ancienne copie nommée `process_overtime_evidence`), `purge_reset_evidence_20260928` (ponctuelle) ;
  dans le dépôt mais jamais appelées par `src/` — `push_approved_to_sheet` (remplacée par `push_approved_batch`),
  `send_announcement` (seul appelant : `ManagerAnnouncePanel.jsx`, jamais importé), `classify_week` (moteur 2.3.0,
  citée seulement par la fiche des règles), `reset_employee_password` (aucun `invoke` trouvé : vérifier avant de
  retirer). Supprimer après confirmation (chaque fonction est une surface exposée avec `verify_jwt`).
- [ ] **Code mort côté écran** (`npx knip`) : props qui choisissaient le rendu V3 et le rendu V2 qu'elles désactivent
  (`EmployeesPanel tabbed`, `EmployeeDetails`, `ManagerDashboard nameFirst / manualFilter / plainWords / reviewFilters`,
  `UnlockDayManager plainWords`, `SettingsPanel taxForms`, `CcqJsonExport lastFinishedMonth`) ; fichiers jamais importés
  `ManagerAnnouncePanel.jsx`, `MealClaimsManager.jsx`, `ui/separator.jsx`, `ui/sonner.jsx` ; dépendances
  `@radix-ui/react-separator`, `sonner`, `@testing-library/user-event`. Les tests d'écran existants couvrent la V3.
- [ ] **S-4** : conflit explicite quand deux gestionnaires approuvent la même fiche (version / `updated_at` attendu
  passé à `push_approved_batch` et aux RPC de retour / révision).
- [ ] **Notifications téléphone pour les notes** : réponse à une note partagée et rappel dû (`send_push` existe ;
  aujourd'hui badge dans l'app seulement).
- [ ] **Migration** : retirer `profiles.return_overtime_no_benefits` (dépréciée depuis 0081 ; vérifier qu'aucune
  fonction ni vue ne la lit).
- [ ] **Google Sheet** : nouveau fichier en janvier 2027 (200 onglets max, un « SemXX » par semaine). Le `doPost` de
  `apps-script-doPost.js` (65 km) a été collé et redéployé par la propriétaire le 2026-11-02.
- [ ] **Vérifier** `OCR_SPACE_API_KEY` dans les secrets Edge (sinon clé « helloworld ») et le forfait Vercel (Hobby =
  usage commercial interdit).
- [ ] P-5 (optionnel) : agrégation des coûts côté serveur — voir §2.

---

## Notes on scope
- **Documents de paie réels** (relevés trimestriels, talons) : le relevé « Masse salariale RBQ » contient le NAS de
  chaque employé. Ne jamais en copier une valeur personnelle dans le dépôt (public) ; seuls des totaux anonymes.
- No clock-in/out/break buttons exist; the employee flow is manual Départ/Arrivée/Fin entry, so the
  repetitive Save/Submit paths were audited in place of clock-button races.
- Re-check line numbers before editing; the tree moves under active development.
