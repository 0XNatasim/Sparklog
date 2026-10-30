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

## 6. À faire / à préciser (mis à jour 2026-10-31, V2.4.212)

> Version vulgarisée, point par point : [`NOOB.md`](NOOB.md).
> Fiche de toutes les règles de paie (valeurs lues dans le code, options, état, sources) : Gestion › Configuration ›
> Règles de paie (`src/lib/pay-rules-reference.js`). Mettre à jour cette fiche avec toute nouvelle règle.

Liste unique des points ouverts. Ce qui est fait est retiré (historique Git) ; ici, ce qu'il reste à **fournir**,
à **trancher** ou à **coder**, par priorité.

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
`km_aller + km_retour`) garde son trajet payé (minutes non payées 0). Le script se colle à la main dans Google : le propriétaire
doit le redéployer. `push_approved_batch` envoie déjà `km_aller` / `km_retour`, pas de redéploiement de la fonction.

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
- [ ] **Google Sheet** : nouveau fichier en janvier 2027 (200 onglets max, un « SemXX » par semaine). Le propriétaire doit
  aussi coller le `doPost` de `apps-script-doPost.js` (V2.4.138) et déployer une nouvelle version, si ce n'est pas fait.
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
