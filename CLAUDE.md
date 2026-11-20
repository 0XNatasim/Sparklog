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

## 6. À faire / à préciser (mis à jour 2026-11-20, V2.4.295)

> Version vulgarisée, point par point : [`NOOB.md`](NOOB.md).
> Fiche de toutes les règles de paie (valeurs lues dans le code, options, état, sources) : Gestion › Configuration ›
> Règles de paie (`src/lib/pay-rules-reference.js`). Mettre à jour cette fiche avec toute nouvelle règle.

> **Conformité (convention collective résidentiel art. 18.01 2) b, Loi R-20, Loi 25, hébergement au Québec) : plan complet dans [`OFFICIEL.md`](OFFICIEL.md)**
> (exigences, écarts, architecture en deux côtés, phases P0–P6). Étape en cours : P0 (avis juridique, responsable, hébergeur).
> Migrations **0135 à 0140 appliquées à la base le 2026-11-13** (vérifiées une à une) ; aucune migration en attente.

Liste unique des points ouverts. Ce qui est fait est retiré (historique Git) ; ici, ce qu'il reste à **fournir**,
à **trancher** ou à **coder**, par priorité.

**V2.4.295 (technique).** Snapshot de la semaine : `WeekSnapshot.jsx` lisait `jobs` de la semaine en une requête (PostgREST renvoie 1000 lignes au plus, sans ordre, le reste est abandonné sans erreur) : la semaine du 15 au 21 nov. 2026 compte 1054 fiches, donc des fiches (dont un lundi complet de plusieurs employés) manquaient dans les cases. Lecture par pages (`fetchAllRows`, `.order("id")`). Les autres lectures de fiches d'une semaine entière passaient déjà par `fetchAllRows` ou `limit` budgété. Aucune migration. Test : `WeekSnapshot.test.jsx` (lecture paginée).

**V2.4.294 (technique).** Feuille de temps : le menu ajouté en V2.4.293 est retiré de la ligne des filtres (`statuses` / `statusFilter` supprimés : la requête `jobs` ne filtre plus par état, l'URL ne porte plus `status`). Le sélecteur de piles du téléphone (`mobileStatus`, un seul employé choisi) reçoit l'option « Tout » (`manager.filters.everything`, première et par défaut : les quatre piles visibles ; `?status=<état>` d'un lien choisit encore une pile, `initialPile` de `status-filter.js`). Aucune migration. Tests : `status-filter.test.js`.

**V2.4.293 (technique).** Feuille de temps : le menu des états remplace les cases de la V2.4.291 (`ManagerDashboard.jsx` : `<Select>` « Tout » (`manager.filters.everything`) / un état ; l'état `statuses` et `src/lib/status-filter.js` restent : un seul état = une seule colonne, aussi avec un employé choisi). Aucune migration.

**V2.4.292 (technique).** Aperçu OCR : `ocr.preview.compare` = « Capture form / temps Sparklog » (EN « Form capture / Sparklog time ») ; `ocr.preview.legend` et sa ligne dans `JobSummary` retirés (les écarts restent en rouge). Aucune migration.

**V2.4.291 (technique).** Feuille de temps de la gestion : filtre des états en cases à cocher. `src/lib/status-filter.js` (`STATUS_KEYS`, `parseStatusParam` : `?status=a,b`, rien de valide = les quatre ; `statusKey` : `all` ou la liste jointe par une virgule ; `toggleStatus` : on ne décoche pas le dernier). `ManagerDashboard.jsx` : état `statuses` (les quatre par défaut) à la place de `statusFilter` (maintenant dérivé) ; la requête `jobs` applique `.in("status", statuses)` dès qu'il manque un état, **aussi avec un employé choisi** (avant, le menu y était ignoré) ; colonnes et menu téléphone = les états cochés (`shownKeys`, `mobileKey`). Le compteur `manager_job_counts` reste sans total « à mettre à jour ». Aucune migration. Tests : `status-filter.test.js`.

**V2.4.290 (technique).** Aperçu OCR : début de journée et heure des 8 h. `expectedProofForJob` renvoie aussi `dayStart` (Départ de la 1re fiche), `lineMinutes` (480 / 600) et `lineAt` (`dayLineTime(jobs, regular, unpaidFirst)` : heure d'horloge où les minutes payées du jour atteignent la ligne, dans la fiche qui la franchit, Départ + ce qui manquait, premier trajet non payé ajouté ; null si jamais atteinte). `proofSheetLines` (`ocr-sheet.js`) ajoute « Début de la journée » et « 8 h atteintes à » (`ocr.sheet.dayStart` / `lineAt`) : visibles dans l'aperçu et l'image téléchargée. Aucune migration. Tests : `ocr-sheet.test.js`.

**V2.4.289 (technique).** Onglet OCR : téléchargement. `OcrDownload.jsx` (bouton à côté de « Tout relire ») : même principe que `EvidenceDownload` (`evidenceWeeks`, `selectEvidence`, `downloadEvidenceZip`, marques `evidence_downloads` du bucket `overtime-evidence`), sur les lignes déjà chargées du tableau ; `downloadEvidenceZip` reçoit une option `transform(file, blob, bytes)` : chaque preuve devient **une image JPEG** (`renderProofSheet` de `src/lib/ocr-sheet.js`, canvas : capture à gauche, fiche à droite). `ocr-sheet.js` (pur, testé) : `proofSheetLines` (OT, état, **départ → arrivée → fin**, retour en minutes seulement s'il est déclaré — minutes ou km —, km total, km aller, km retour si retour), `proofCompareLines` (lu / attendu, écarts en rouge), `hasReturn`, `jobKilometres` ; l'aperçu (`JobSummary`) utilise les mêmes lignes ; `JOB_COLUMNS` lit `arrivee`. Les marques sont partagées avec Justificatifs (une preuve téléchargée ici ne revient pas en brut là-bas). Aucune migration. Tests : `ocr-sheet.test.js`, `OcrReadings.test.jsx`.

**V2.4.288 (technique).** Statut `updated` visible côté gestion. `ManagerDashboard.jsx` : l'option « À mettre à jour » (`manager.updatedSection`) du filtre d'état (et `?status=updated`) ; `split` ne jetait plus les fiches `updated` quand un employé est choisi : 4e pile `updated` (menu mobile, en-têtes et grille `grid-cols-4`). `status.updated` : FR « à mettre à jour », EN « to update » (`history.updated` inchangé). Le compteur `manager_job_counts` n'a pas de total `updated`. Aucune migration.

**V2.4.287 (technique).** Onglet OCR : filtre par jour. `ocr-readings.js` : `filterOcrRows(rows, { state, query, day })` (`day` = `jobDate` AAAA-MM-JJ, vide = tous) et `ocrDays(rows)` (jours présents, du plus récent au plus ancien, avec leur nombre) ; `OcrReadings.jsx` : menu « Jour » (`ocr.dayLabel` / `ocr.allDays`) ; « Tout relire » agit sur les lignes affichées, donc sur le jour choisi. En-têtes renommés (`ocr.col.clientRead` « Form », `clientExpected` « Sparklog », `returnRead` « Retour form », `returnExpected` « Retour Sparklog ») ; l'aperçu garde des libellés explicites (`ocr.preview.clientLine` / `returnLine`, titre « Form (capture) / Sparklog (feuille de temps) »). Aucune migration. Tests : `ocr-readings.test.js`, `OcrReadings.test.jsx`.

**V2.4.286 (technique).** Onglet OCR : renvoyer pour correction. **Interrupteur** (migration 0151 : `overtime_settings.send_back_enabled`, défaut faux ; `SettingsPanel` › Paramètres généraux, `settings.sendBack.*`) : `OcrReadings.jsx` ne montre le bouton que si la colonne est vraie (une colonne absente = caché). **Appliquer la 0151.** `OcrReadings.jsx` : bouton « Renvoyer pour correction » (`sendBack`, icône `Undo2` sur la ligne et bouton dans l'aperçu) visible pour une fiche `submitted` ; après `useConfirmDialog`, appelle `return_job_for_correction(p_job_id, p_expected_updated_at)` (le même RPC que `TodoInbox` / `ManagerDashboard` ; `JOB_COLUMNS` lit `updated_at` ; refus si la fiche a changé : `ocr.sendBackFailed`). La preuve reste ; l'employé la remplace par l'horloge de l'Historique (0144). Titre de l'aperçu : `· OT <numéro>`. Constat à l'origine : un employé avait déclaré 167 min chez le client (capture lue correctement) pour une fiche de 148 min. `OvertimeProofDialog.jsx` (quand `editable`) : bloc `proofs.redo.*` (reprendre la capture, ne pas renvoyer le formulaire, la prendre avant « Envoyer ») + l'exemple `/overtime-form-example.webp` ; `form.evidence.requiredCrop` dit « avant » (plus « ou juste après »). Tests : `OcrReadings.test.jsx`, `OvertimeProofDialog.test.jsx`, `ocr-readings.test.js` (verrou du SQL 0151).

**V2.4.285 (technique).** Onglet OCR : tout relire. Migration 0150 : `requeue_overtime_proofs` accepte toute preuve qui n'est pas déjà `pending` (image encore gardée, non échue ; même contrôle gestionnaire, 1–300 ids) au lieu de seulement `failed` / `needs_review` / `wrong_document` / lue sans rien. `ocr-readings.js` : `canRequeue(row)` (image gardée, pas en file) ; `OcrReadings.jsx` : bouton « Relire » sur toute ligne `canRequeue`, « Tout relire (n) » = les lignes affichées (filtre + recherche) après `useConfirmDialog`, par paquets de 300. **Appliquer la 0150 avant d'utiliser « Relire » sur une lecture déjà lue** (avant : la base les ignore, « 0 remise »). Tests : `OcrReadings.test.jsx`, `ocr-readings.test.js` (verrou du SQL 0150).

**V2.4.284 (technique).** Lecteur OCR : une date n'est plus lue comme des minutes. Constat : `proof_return_minutes = 2026` (date « 2026-11-19 » de la question 6, lue quand la réponse du retour était vide : le saut de 12 caractères atteignait la date). `_shared/overtime_form.js` : `ANSWER` = `(\d{1,3})(?!\d)(?![-/.]\d)` + garde sur le numéro de question suivant (au plus 3 chiffres, jamais suivi d'un autre chiffre ni d'un séparateur de date). **Fonction `process_overtime_evidence` à redéployer.** Donnée corrigée à la main : la seule ligne touchée (retour 2026) remise à `null`. Lecture **par lignes** : `process_overtime_evidence` demande `isOverlayRequired` (position de chaque ligne), `parseOvertimeFormLines` (`_shared/overtime_form.js`, `{ text, top, left }`, tri par position) prend, pour chaque question repérée (OT, « chez le client », « retour à l'entrepôt » sur 1 à 3 lignes), la première ligne sous la question avant la suivante (nombre de 1 à 3 chiffres ; OT de 3 à 8) ; `readOvertimeForm({ text, lines })` : question repérée = réponse des lignes (même vide), sinon repli sur `parseOvertimeForm` (texte). Structure de `TextOverlay.Lines` d'OCR.space supposée d'après la doc, **non vérifiée sur un vrai retour** : à contrôler après redéploiement. Tests : `overtime-form.test.js` (capture du formulaire reconstruite, ordre inversé, retour vide / 0). Aucune migration.

**V2.4.283 (technique).** Onglet OCR : liens et aperçu double. `OcrReadings.jsx` : le nom (`DropdownMenu`) ouvre la fiche employé (`Dialog` + `EmployeesPanel tabbed onlyId`, chargé par `lazyPanel`) ou `/manager/v3/time?tab=timesheets&emp=<id>&date=<jour>` ; l'OT ouvre la même page avec `&job=<id>` (cette fiche) ou sans (la journée). L'œil ouvre un `Dialog` : image (URL signée 10 min) + `JobSummary` (fiche liée : OT, état, départ → fin, retour, km, lu / attendu avec `row.wrong` en rouge) ; `buildOcrRows` renvoie aussi `job`. Le composant utilise `useNavigate` : tests dans un `MemoryRouter`. Aucune migration.

**V2.4.282 (technique).** Onglet OCR : état de la file. `OcrReadings.jsx` lit aussi `ocr_attempts` / `ocr_next_try_at` (`buildOcrRows` : `attempts`, `nextTryAt`) et affiche sous « En file » « n essai(s) sur 5 refusé(s) » ou « Pas encore essayée » + « prochain essai vers HH:mm » (`ocr.queue*`). Constat du 2026-11-19 : toutes les lectures échouent en `ocr.space HTTP 429` (clé partagée « helloworld ») : la file et la reprise fonctionnent, c'est le service qui refuse → clé personnelle dans `OCR_SPACE_API_KEY` (§6.3). Aucune migration.

**V2.4.281 (technique).** Renvoi automatique d'une mauvaise preuve, derrière un interrupteur. Migration 0149 : `overtime_settings.auto_return_wrong_proof` (défaut faux ; lecture tous comptes connectés, écriture gestionnaires par les politiques existantes) ; `auto_return_wrong_proof(p_proof_id)` (`security definer`, `service_role` seulement) : réglage coupé → `disabled` ; preuve non `wrong_document` → `not_wrong_document` ; fiche pas `submitted` → `job_not_submitted` (brouillon, approuvée ou exportée jamais touchée) ; sinon supprime la ligne de preuve (la règle de soumission cherche une ligne), si une autre preuve reste → `other_proof_kept`, sinon fiche `updated` + déverrouillée + `overtime_evidence_captured` faux, audit `job_returned_wrong_proof` (acteur « Système ») → `returned`. `process_overtime_evidence/index.ts` (**à redéployer, après 0148 et 0149**) l'appelle après avoir écrit `wrong_document` (erreur journalisée, jamais bloquante). Interrupteur : `SettingsPanel` › Paramètres généraux (`settings.proofCheck.*`). Limite : ne joue qu'à la lecture ; une preuve lue avant l'activation ou avant la soumission n'est pas renvoyée (remettre en file dans l'onglet OCR). Tests : `ocr-readings.test.js` (verrous du SQL 0149 et de la fonction). Objet du stockage retiré par le nettoyage des orphelins.

**V2.4.280 (technique).** Mauvaise capture. Constat (2026-11-18) : une fiche de travail (page « Bilan », en-tête « OT-198909 ») envoyée comme preuve était `processed` / « conforme », car le lecteur ne demandait qu'un nombre d'OT trouvé ; 7 preuves sur 34 lues n'avaient que l'OT. `_shared/overtime_form.js` : `isOvertimeFormText(texte)` (au moins 2 des marques : « chez le client », « retour à l'entrepôt », « combien de minute(s) », « numéro du OT », « confirmation de temps supp » ; ré-exporté par `src/lib/overtime-form.js`). `process_overtime_evidence/index.ts` (**à redéployer, après 0148**) : texte vide → `needs_review` ; formulaire reconnu → `processed` si au moins un nombre, sinon `needs_review` ; ancien SMS → `processed` ; **autre chose → `wrong_document`, chiffres lus abandonnés (null)**. Migration 0148 : contrainte `overtime_evidence_ocr_status_check` + `wrong_document` ; `requeue_overtime_proofs` accepte aussi `wrong_document`. Écran : état `wrongDoc` (« Mauvaise capture », dans `check`, relisible) ; `proofAnomalies` : anomalie `proof_wrong` (`manager.anomalies.proof_wrong`) pour une fiche `submitted` dont une preuve est `wrong_document`. **Non fait — blocage de l'employé :** la lecture est asynchrone (1 / min), donc elle ne peut pas refuser l'envoi ; options étudiées : refuser la soumission en base tant que la seule preuve est `wrong_document` (ne joue que si la lecture a eu lieu avant la soumission), renvoi automatique de la fiche soumise à l'employé (`submitted` → `updated`, drapeau de preuve retiré, audit), ou lecture immédiate à l'envoi. Tests : `overtime-form.test.js` (fiche de travail réelle), `overtime-proof-check.test.js`, `ocr-readings.test.js` (verrous du SQL 0148 et de la fonction).

**V2.4.279 (technique).** L'onglet OCR ne lit que `job_date >= OCR_FIRST_DAY` (`ocr-readings.js`, 2026-11-16, décision du 2026-11-18) : `OcrReadings.jsx` ajoute `.gte("job_date", OCR_FIRST_DAY)`. Donnée corrigée à la main le même jour : les 76 preuves `pending` d'avant le 16 (remises en file par le rattrapage de la 0147) sont repassées `failed` (`proof_read_at` posé, hors file) ; la file ne garde que celles depuis le 16. Pas de migration : la 0147 reste telle quelle (son rattrapage de 14 jours n'est plus pertinent). Test : `OcrReadings.test.jsx`.

**V2.4.278 (technique).** OCR : file d'attente, une lecture par minute (suite de V2.4.277, même PR). Migration 0147 : colonnes `overtime_evidence.ocr_attempts`, `ocr_last_try_at`, `ocr_next_try_at` + index partiel `ocr_status = 'pending'` ; trigger `overtime_evidence_guard_proof_fields` (insertion) remet aussi ces trois colonnes à zéro / null (l'employé ne choisit pas sa place) ; `claim_next_overtime_proof()` (service_role seulement ; `ocr_status = 'pending'`, `ocr_next_try_at` échu, ordre `ocr_last_try_at nulls first, created_at`, `for update skip locked`, bail de 5 min posé dans `ocr_next_try_at`) ; `requeue_overtime_proofs(uuid[])` (`get_my_role() = 'manager'`, 1–300 ids ; remet en `pending` les preuves `failed` / `needs_review` / lues sans rien trouver, dont l'image est encore gardée) ; rattrapage : les `failed` des 14 derniers jours sont remises en file ; tâche `pg_cron` `ocr-proofs-queue` chaque minute → `invoke_scheduled_function('process_overtime_evidence', {"queue": true})`. `process_overtime_evidence/index.ts` (**à redéployer, après 0147**) : mode cron (`x-cron-secret` vérifié par `verify_cron_secret`) = prend la prochaine preuve et la lit **une seule fois** (plus de boucle de reprises ni de paramètre `reread`) ; échec → `pending`, `ocr_attempts + 1`, `ocr_last_try_at = maintenant` (bas de la file), `ocr_next_try_at = maintenant + 10 min × essais` ; au 5e échec → `failed` + `proof_read_at` ; l'appel du téléphone de l'employé (après envoi) ne lit plus rien : il vérifie le propriétaire et répond 202 (la tâche lira). **Ordre de déploiement : appliquer 0147, puis redéployer la fonction** (la fonction écrit les nouvelles colonnes) ; avant 0147, ne pas redéployer. Écran : état `queued` (`ocr_status = pending`), `requeueProofs` (RPC, remplace `rereadProof`), « Remettre les échecs en file (n) », rechargement automatique chaque minute tant qu'il y a des preuves en file. Testé dans un Postgres jetable (ordre de lecture : jamais essayée d'abord puis la plus anciennement essayée ; une preuve refusée passe derrière les autres et n'est pas reprise avant 10 min ; bail ; rattrapage ; employé refusé / gestionnaire accepté / liste vide refusée). Tests : `ocr-readings.test.js` (verrous du SQL et de la fonction), `OcrReadings.test.jsx`.

**V2.4.277 (technique).** OCR : échecs distingués et relecture. Constat (2026-11-18) : sur les 59 preuves lues les 16-17 novembre, **32 étaient `ocr_status = failed`** (journal de la fonction : `ocr.space HTTP 429`, une fois `TimeoutError`) — le service refusait les demandes, la capture n'était pas en cause ; 3 `needs_review` et 2 `processed` sans rien trouvé ; parmi les 22 lues, 13 n'ont pas la valeur « retour » (cause non établie : il faudrait un texte OCR d'exemple). `process_overtime_evidence/index.ts` : *(remplacé par la file de V2.4.278 : plus de boucle de reprises ni de paramètre `reread`)*. `ocr-readings.js` : état `failed` (≠ `unread`), `canReread`, filtre `reread` ; `overtime-proofs.js` : `rereadProof` ; `OcrReadings.jsx` : badge « Lecture échouée », « Relire » par ligne, « Relire les échecs (n) » (une à la fois, pause de 1,5 s, rechargement après 8 s), « Actualiser ». **À faire côté propriétaire :** clé personnelle OCR.space dans le secret Edge `OCR_SPACE_API_KEY` (point de §6.3 « Vérifier `OCR_SPACE_API_KEY` » : confirmé nécessaire). Tests : `ocr-readings.test.js` (dont verrous sur la source de la fonction), `OcrReadings.test.jsx`. Aucune migration.

**V2.4.276 (technique).** Onglet « OCR » de À traiter. `manager-nav.js` : `tab("ocr", "receipts", "mgr.nav.ocr")` dans l'entrée `todo` (règle de Justificatifs), `ManagerPages.TODO_TABS.ocr` → `components/manager/OcrReadings.jsx` (lecture seule : `overtime_evidence` les 300 dernières preuves — budget `ocrReadings` —, `profiles` et `jobs` des mêmes jours par morceaux, URL signée à la demande pour voir la capture). Logique pure `src/lib/ocr-readings.js` : `buildOcrRows` (état `ok` / `mismatch` / `unread` / `notRead`, valeurs lues, attendues, champs en écart), `filterOcrRows`, `countOcrStates`. `overtime-proof-check.js` : `expectedProofForJob(jours, fiche, options)` = valeurs attendues **par fiche** (OT de la fiche ; minutes chez le client = part de cette fiche au-delà de la ligne 480 / 600, retour et premier trajet non payé exclus ; retour de la fiche) — `proofAnomalies` (alertes de « À regarder d'abord ») ne l'utilise pas encore et saute toujours les journées à plusieurs preuves : **à brancher ensuite**. Tolérances inchangées (15 min client, 5 min retour). Définition de « minutes chez le client » toujours à confirmer. Tests : `ocr-readings.test.js`, `OcrReadings.test.jsx`. Aucune migration.

**V2.4.275 (technique).** Texte de la demande de preuve : `OvertimeEvidenceStep.jsx` (titre `form.evidence.title`, bloc règle `form.evidence.rule` + lien `form.evidence.formName` vers la ligne `employee_forms` « Confirmation de Temps supp. » (`useOvertimeConfirmationForm` / `pickOvertimeConfirmationForm` dans `src/lib/overtime-form-link.js` : identifiant de la ligne puis nom ; l'adresse n'est jamais dans le code ; ligne absente = nom sans lien) — puis `form.evidence.perJob` « Celle-ci est pour l'OT … » ; `form.evidence.description` retiré ; ligne `requiredCrop` en rouge). `EmployeeForm` passe `explain` toujours (`perJob` selon `proofPerJob`). Test : `OvertimeEvidenceStep.test.jsx`. Aucune migration. **Phase suivante gardée en mémoire :** OCR par OT (comparer chaque preuve à sa fiche ; décisions à prendre : avertissement employé, définition de « minutes chez le client », photo illisible).

**V2.4.274 (technique).** Date de bascule de la preuve par OT avancée au **2026-11-16** (la décision date du soir du 16, heure de Montréal ; j'avais pris la date UTC). `PER_JOB_PROOF_FROM = "2026-11-16"` ; migration 0146 = `validate_job_submission_contract` de 0145 recréée, seule la date change (`date '2026-11-16'` aux deux endroits) ; le test de parité lit désormais 0146 (le corps le plus récent). Tests des dates adaptés (15 nov = règle d'avant). **Appliquer 0146** ; sans elle la base garde 0145 (preuve par OT dès le 17).

**V2.4.273 (technique).** Souper et horloge. Cause du « souper automatique n'a pas pu être ajouté » : `EmployeeForm.createMealClaim` passait `overtimeDailyMinutes` (état initialisé à 0, rempli seulement par `requiresOvertimeEvidence`) alors que `meal_claims_daily_work_minutes_check` exige ≥ 615 ; `createMealClaim` (`meal-claim-request.js`) relit les fiches du jour et recalcule avec `mealDecision`. En cas d'échec, plus de `form.meal.failed` à l'employé (console seulement) ; `mealMissingAnomalies(jobs, claims, profiles)` (`job-anomalies.js`, type `meal_missing`, texte `manager.anomalies.meal_missing`) signale aux gestionnaires une journée soumise éligible sans ligne `meal_claims`, lue dans `TodoInbox` et `ManagerDashboard`. `History.jsx` : l'horloge-bouton s'affiche aussi avant `PER_JOB_PROOF_FROM` (sur la dernière fiche du jour, `overtimeMarkerJobIds`), lecture seule si soumise. Tests : `job-anomalies.test.js`. Aucune migration.

**V2.4.272 (technique).** La base refuse de soumettre une fiche au-delà de la ligne sans sa preuve (Phase 11, décision du 2026-11-17 : « 2 OT qui dépassent, 2 preuves obligatoires »). Migration 0145 : `validate_job_submission_contract` recréée (corps de la base au 2026-11-17 = 0135 + 0137 `owner_submit` ; **seul le bloc de la preuve de temps supp. change**) : pour `job_date >= '2026-11-17'` (même date que `PER_JOB_PROOF_FROM`, un test les compare), la fiche est « au-delà de la ligne » quand les minutes des fiches du jour qui la précèdent (ordre `coalesce(left(depart::text, 5), '') collate "C"` puis `id::text collate "C"`, comme `overtimeLineJobIds`) + les siennes − le premier trajet non payé du jour dépassent `daily_regular_minutes` (480 / 600) ; elle exige alors **une ligne `overtime_evidence` pour cette fiche** (le drapeau `overtime_evidence_captured` n'est pas cru : `save_own_job` accepte un drapeau réclamé sur la foi d'une preuve d'une autre fiche) ; avant cette date, règle d'avant (une preuve n'importe où dans la journée) ; personnel de bureau et `sparklog.owner_submit` exemptés ; transition vers `submitted` seulement (jamais un brouillon) ; message `overtime_evidence_required` (texte `form.errors.overtimeEvidenceRequired` réécrit : chaque OT au-delà a sa capture, horloge rouge « + » de l'Historique). **Appliquer 0145** (avant ou après le code : sans elle la base garde l'ancienne règle d'une preuve par journée). App : `History.submitDay` ne redirige plus vers la dernière fiche pour les dates concernées, il dit combien d'OT n'ont pas leur capture (`proofs.submitDayMissing`) ; `WeekSnapshot` : tuile rouge si au moins un OT au-delà de la ligne n'a pas sa preuve (règle par fiche dès la date de bascule). Tests : `overtime-evidence-rules.test.js` (verrous du SQL 0145 + parité de la date) ; **migration exécutée dans un Postgres jetable avec la vraie fonction et son déclencheur (18 scénarios)** : fiche sous la ligne acceptée, fiche qui franchit la ligne refusée puis acceptée avec sa preuve, fiche suivante refusée même si la précédente a la sienne, drapeau réclamé sans ligne de preuve refusé, ancienne date (règle par journée) acceptée, fiche d'abord entrée plus tôt qui pousse une autre au-delà, employé de 10 h, premier trajet non payé, bureau et saisie du propriétaire exemptés, insertion directe en `submitted` refusée, brouillon jamais refusé ; rejouable. Premier essai : un rôle manquant dans l'environnement de test avait empêché de créer le déclencheur (tout « accepté ») : le test a été refait et vérifié avec le déclencheur en place.

**V2.4.271 (technique).** Une preuve de temps supp. par OT, qui reste sur son OT (Phase 10, décision du 2026-11-17 ; remplace la « Phase 9b » comme étape suivante). Migration 0144 : `attach_overtime_evidence_to_last_job` (même nom, les 5 triggers de 0068 restent) **ne déplace plus** les preuves ni leurs notifications sur la dernière fiche : elle aligne seulement `overtime_evidence_captured` de chaque fiche sur ses propres preuves (un jour sans aucune preuve reste intact, comme avant) ; `my_overtime_proofs(date)` (l'employé ne peut pas lire la table : politique « manager read » seule) ; politique de stockage « overtime storage: owner read » (dossier `<son id>/…`, lecture seulement : **aucun droit de suppression** donné à l'employé, un objet retiré est ramassé par `find_orphaned_evidence_objects`) ; `save_own_overtime_proof(job, ancienne, nouvelle, chemin, minutes)` (ajoute ou remplace ; fiche à soi, `saved` / `updated` non verrouillée, chemin `<id>/<date de la fiche>/…`, fichier présent dans le bucket, idempotent par id de preuve, notification gestionnaire, drapeau de la fiche) et `remove_own_overtime_proof(id)` (même conditions, recalcule le drapeau, la notification part en cascade). **Appliquer 0144 avant le code.** Date de bascule `PER_JOB_PROOF_FROM = "2026-11-17"` (le jour de la décision ; messages d'explication : `form.evidence.perJob`, `proofs.rule`, `proofs.missingNotice`) (`overtime-proof-rules.js`, pur, partagé) : avant, règle d'avant (une preuve par journée) ; dès cette date `overtimeLineJobIds` désigne les fiches qui franchissent la ligne et toutes les suivantes (ordre des Départ, premier trajet non payé retiré de la 1re fiche, seuil 480 / 600) ; `overtimeEvidenceNeeded` demande la preuve à la fiche enregistrée si elle est dans cet ensemble et ne porte pas déjà la sienne (`hasOvertimeEvidence`) ; `dailyOvertimeEvidenceRequirement` (soumission depuis l'Historique) pareil ; `overtimeMarkerJobIds` (`timesheet-layout.js`, Historique et gestion) met l'horloge sur chaque fiche qui porte sa preuve (dès la bascule) ou sur la dernière fiche du jour (avant). `src/lib/overtime-proofs.js` (`fetchMyProofs`, `signedProofUrls`, `saveOwnProof` : lecture et compression du fichier, envoi dans `<id>/<date>/<uuid>.jpg`, RPC, lecture du formulaire en file `process_overtime_evidence`, objet retiré si la RPC échoue ; `removeOwnProof`), `OvertimeProofDialog.jsx` (voir / remplacer / retirer / ajouter, lecture seule si la fiche est soumise), `History.jsx` (horloge-bouton avec flèche pour une preuve jointe, horloge rouge « + » pour une fiche au-delà de la ligne sans preuve ; pas en « Vue en tant que » ni pour le personnel de bureau). Gestion : l'horloge par fiche (`ManagerDashboard`). Non fait : refus par la base d'une journée qui a moins de preuves que de fiches au-delà de la ligne (touche `validate_job_submission_contract`, avec la même date de reprise) ; `proofAnomalies` ne compare toujours pas un jour à plusieurs preuves (valeurs attendues = dernier OT) : à faire par fiche maintenant que chaque preuve a sa fiche. Tests : `overtime-proofs-required.test.js` (règle, bascule, horloge, `overtimeEvidenceNeeded`), `OvertimeProofDialog.test.jsx`, `overtime-evidence-rules.test.js` (verrous du SQL 0144) ; migration exécutée dans un Postgres jetable (ajout sur 2 fiches : chacune garde la sienne, remplacement, retrait, refus fiche soumise / dossier d'un autre / fichier absent / fiche d'un autre, idempotence, rejouable).

**V2.4.270 (technique).** Correctif de V2.4.269. Constat : la table `overtime_evidence` n'a **qu'une politique de lecture, « manager read »** (aucune pour le propriétaire de la ligne) ; `overtimeEvidenceNeeded` de V2.4.269 y comptait les preuves du jour : pour un employé la requête renvoyait toujours 0 ligne, donc `needed = required > 0` et la preuve était redemandée à chaque modification d'une fiche déjà au-dessus de la ligne (et pouvait être ajoutée en double). `overtimeEvidenceNeeded` retrouve la règle d'avant (une preuve par journée : `others.some(overtime_evidence_captured)` lu sur `jobs`, lisible par l'employé ; `editId && hasOvertimeEvidence` ne redemande pas) ; `overtimeProofsRequired` (pure, testée) est gardée pour la règle « une preuve par OT ». `form.evidence.progress` et l'état `evidenceProgress` retirés de `EmployeeForm`. La migration 0143 (contrainte retirée) reste : sans effet tant qu'une seule preuve est demandée. À savoir pour la suite : tout ce que l'employé doit lire de ses preuves (compte, image) passe par une fonction `security definer` ou une politique de lecture du propriétaire, à créer. Tests : `EmployeeForm.test.jsx` (pas de nouvelle demande quand une fiche du jour porte déjà la preuve).

**V2.4.269 (technique).** Une preuve de temps supp. par OT au-delà de 8 h (Phase 9a, décision du 2026-11-17). Constat : `overtime_evidence.job_id` était `unique` (`overtime_evidence_job_id_key`) et le trigger de 0068 (`attach_overtime_evidence_to_last_job`) range toutes les preuves du jour sur la dernière fiche : une 2e preuve du même jour était impossible. Migration 0143 : retire la contrainte, ajoute les index `(job_id)` et `(user_id, job_date)` ; aucune fonction recréée (0067 / 0068 / `reconcile_overtime_evidence` / `save_own_job_with_overtime_evidence` inchangées ; la règle de la base reste « au moins une preuve pour soumettre une journée au-dessus du seuil »). **Appliquer 0143 avant le code.** `overtime-evidence-check.js` : `overtimeProofsRequired(jobs, { minutesOf, thresholdMinutes, unpaidTripMinutes })` (fiches du jour triées par Départ puis id ; compte la fiche qui franchit la ligne et toutes les suivantes ; le premier trajet non payé est retiré de la 1re fiche) ; `overtimeEvidenceNeeded` compare ce nombre aux lignes `overtime_evidence` du jour (`needed = required > proofCount`, renvoie aussi `required` / `proofCount`) au lieu de « une fiche porte le drapeau » ; l'échec de lecture bloque toujours (fail closed). `EmployeeForm.saveWithReturn` : la demande revient à chaque enregistrement (annule la restriction « dernier OT » de V2.4.267, le verrou `saveFlowBusyRef` reste) ; `OvertimeEvidenceStep` affiche « Capture n sur total » (`form.evidence.progress`). Gestion : `ManagerDashboard` (`focusedEvidence`, carte Temps supp. : `evidenceMap` regroupe les preuves d'une fiche dans `paths`, `ensureEvidenceImage` signe toutes les images) et `JobCard` affichent toutes les images ; `TodoInbox` / `todo-inbox.js` lisaient déjà une liste par jour. `proofAnomalies` ne compare pas un jour à plusieurs preuves (les valeurs attendues sont celles du dernier OT : fausses alertes) ; comparaison par preuve à faire. **Non fait (Phase 9b) :** refus par la base d'une journée qui a moins de preuves que de fiches au-delà de la ligne (touche `validate_job_submission_contract`, avec date de reprise pour ne pas bloquer les journées déjà saisies) ; la preuve est attachée à la dernière fiche (0068), pas à l'OT qui l'a motivée. Tests : `overtime-proofs-required.test.js`, `overtime-evidence-rules.test.js` (0143), `EmployeeForm.test.jsx` (2e preuve demandée / pas redemandée) ; migration vérifiée dans un Postgres jetable (2 preuves sur une fiche, rejouable).

**V2.4.268 (technique).** Inventaire de fin de mois des sous-traitants (Phase 8). Migration 0142 : bucket privé `month-end-inventory` (JPEG / PNG / WebP, 10 Mo ; l'employé écrit seulement dans `<son id>/…`, les gestionnaires lisent / suppriment) ; tables `month_end_inventory_settings` (singleton, `retention_days` 60 par défaut, 7–365), `…_rounds` (`due_date` unique), `…_requests` (`round_id` × `user_id`, `submitted_at` / `waived_at` exclusifs), `…_files` (`storage_path` nullable + `purged_at`, `expires_at` posé par le serveur) ; RLS lecture gestionnaire seulement, aucun droit d'écriture direct : tout passe par des fonctions `security definer` — gestionnaire (`get_my_role() = 'manager'`) : `schedule_month_end_inventory(date, uuid[])` (date ≥ aujourd'hui, ≤ 50 personnes de rôle employee / foreman / subcontractor_1), `remove_month_end_inventory_request` (seulement sans photo), `waive_month_end_inventory_request`, `set_month_end_inventory_retention` (recalcule `expires_at` des photos gardées) ; employé : `my_month_end_inventory_due()`, `add_month_end_inventory_file` (chemin `<user>/<demande>/…`, 10 photos au plus, idempotent par chemin), `remove_own_month_end_inventory_file`, `submit_month_end_inventory` (5 photos au moins, idempotent) ; chaque action écrit une ligne `audit_log` (`month_end_inventory_*`). **Le blocage** est un trigger séparé `trg_month_end_inventory_gate` (`before insert or update of status` sur `jobs`) : refuse seulement la **transition vers `submitted`** (`month_end_inventory_required`, 23514) d'une fiche datée à partir du jour planifié pour une personne qui n'a ni envoyé ni été débloquée ; jamais un brouillon ; la saisie du propriétaire (`sparklog.owner_submit = 'on'`, 0137) passe ; `validate_job_submission_contract` n'est pas touchée. `cleanup_overtime_evidence/index.ts` retire les objets échus puis vide la ligne (`storage_path` nul, `purged_at`) — **fonction à redéployer**. Code : `src/lib/month-end-inventory.js` (limites 5 / 10, `parseRetentionDays`, `addPickedMonthEndFiles`, `uploadMonthEndFile` : compression 2400 px, objet retiré si l'enregistrement échoue, `requestState`, `fetchMonthEndOverview`, `monthEndZipNames` / `downloadMonthEndZip` via `zip-store.js`), budget `monthEndInventory` = 300 ; `employee-form/MonthEndInventoryStep.jsx` (étape `monthEnd` d'`EndOfShiftDialog`, après l'inventaire de fin de journée et avant « soumettre la journée », sans « × » ; `EmployeeForm.goToMonthEndOrDayDone` ; « Je ne l'ai pas encore » ferme et ouvre l'Historique), `MonthEndInventoryBanner.jsx` (en tête d'`History.jsx`, pas en « Vue en tant que »), `MonthEndInventory.jsx` (sous-page `inventory/month-end`, `MANAGER_SUBPAGES`, lien `MonthEndInventoryLink` dans la page Inventaire), image d'exemple neutre `public/month-end-form-example.png` (aucun nom, maquette) ; erreurs `month_end_inventory_*` dans `error-messages.js`. Tests : `month-end-inventory.test.js` (dont verrous sur le SQL, lu et non exécuté), `MonthEndInventory.test.jsx`. **Appliquer la migration 0142 avant de déployer le code, puis redéployer `cleanup_overtime_evidence`.** Non fait : lecture des chiffres des captures (OCR) ; le délai « bandeau puis blocage » est remplacé par un blocage dès le jour planifié (décision du 2026-11-16 : la fiche reste en brouillon).
**V2.4.267 (technique).** Preuve de temps supp. seulement au dernier OT. `EmployeeForm.saveWithReturn` : `needsEvidence` n'appelle `requiresOvertimeEvidence()` que si `requestedMode === "submit"` ou `endShiftRef.current` (réponse « Oui » à « Dernier OT de la journée ? », ou journée soumise depuis l'Historique, `?submit=1`) ; avant, tout enregistrement en brouillon d'une fiche faisant dépasser le seuil de la journée (déjà compté avec les fiches existantes + celle-ci) ouvrait l'étape `evidence`, même au milieu de la journée. La base n'est pas touchée : `validate_job_submission_contract` ne demande la preuve qu'à la transition vers `submitted`, jamais à un brouillon. Effet de bord corrigé : le contrôle réseau qui tenait `checking` à vrai laissait passer un double « Non » dans le même instant ; `saveWithReturn` est maintenant enveloppée d'un verrou synchrone (`saveFlowBusyRef`, corps dans `runSaveWithReturn`). Tests : `EmployeeForm.test.jsx` (un OT de 9 h 30 non dernier : ni étape de preuve ni `save_own_job_with_overtime_evidence`) ; « un seul enregistrement si « Non » est touché deux fois » repasse. Aucune migration.

**V2.4.266 (technique).** Snapshot d'hier retiré : `ManagerDashboard.jsx` (état `yesterdaySnapshotOpen`, bouton et fenêtre) ; `LiveCrew.jsx` perd les props `snapshot` / `targetDate` (toujours le jour courant) ; textes `live.snapshot.*` supprimés. Aucune migration.

**V2.4.265 (technique).** Fiche employé depuis le snapshot de la semaine. `WeekSnapshot.jsx` : le nom de l'employé est un bouton (`live.week.openCard`) qui met `ficheId` ; tant que `ficheId` est posé, le composant rend à la place du tableau un bouton « Retour au snapshot » (`live.week.backToSnapshot`) et `<EmployeesPanel tabbed onlyId={ficheId} />` (chargé à la demande par `lazyPanel`) ; « Retour » remet `ficheId` à nul et incrémente `reloadKey` (le chargement des fiches et des profils repart : un changement fait dans la carte, ex. une option de paie, se voit) ; la semaine choisie, le filtre et les états sont gardés (le composant reste monté, un seul dialogue de `ManagerDashboard`, pas de fenêtre dans la fenêtre). `EmployeesPanel.jsx` : nouvelle prop `onlyId` (une seule carte, déjà ouverte, sans `AddEmployeeCard`, recherche ni filtres, malgré le filtre d'état) ; les écritures sont celles de la carte (`savePayToggle`, `saveField`…). Aucune migration. Tests : `WeekSnapshot.test.jsx` (clic sur le nom, retour, semaine gardée), `EmployeesPanel.test.jsx` (`onlyId`).

**V2.4.264 (technique).** « Conditions de paie » plus compact : chaque colonne de `PAY_CONDITION_COLUMNS` a un `shortKey` (`payConditions.short.<clé>`, FR / EN, 26 caractères au plus : test dans `pay-conditions.test.js`) affiché à la verticale dans l'en-tête (`[writing-mode:vertical-rl] rotate-180`, `h-32`, colonne `w-12`) ; le titre est un bouton (`aria-label` « libellé complet — Voir l'explication ») qui ouvre une fenêtre : libellé complet, explication (`hintKey` de la fiche employé quand il existe, sinon `payConditions.desc.<clé>`), phrase sur la case, et pour une ligne de trajet défaut / choix / article de convention / seuil km (`columnDescription` de `PayConditionsManager.jsx`) ; le libellé complet reste aussi dans le `title` ; boutons « Tous / Aucun » empilés, listes de trajet à `w-[5.5rem]`. Le sens des cases ne change pas (« 1er dépl. non payé » = `first_trip_unpaid`, coché = non payé). Aucune migration, aucun changement de données.

**V2.4.263 (technique).** Onglet « Conditions de paie » (Gestion › Configuration, onglet `pay-conditions`, règle de `config-settings`, `PayConditionsManager.jsx`). Aucune migration, aucune nouvelle colonne : le tableau ne stocke rien. `src/lib/pay-conditions.js` : `PAY_CONDITION_GROUPS` / `PAY_CONDITION_COLUMNS` (règles de temps, primes de chef d'équipe, taux et remboursements dont `hourly_rate` du personnel de bureau, options de saisie, puis une colonne par ligne de `TRAVEL_RULE_SECTIONS`), `cellState(colonne, profil)` (réutilise `payRuleToggles`, `hasPayRules`, `reimbursements`, `isNonCcqRole`, `travelRuleEmployees` : « — » quand l'option ne s'applique pas, verrouillée selon le rôle, ex. sous-traitant), `parseConditionAmount` (même règle que `parsePayAmount`, taux km ≤ 9,99), `payConditionRows` (tri par numéro d'employé, comptes en pause cachés, recherche, groupe), `bulkTargets`. L'écran lit `profiles` (colonnes de `PAY_CONDITION_PROFILE_COLUMNS`), `employee_groups` + membres et `travel_pay_rules` par pages (`fetchAllRows`, plus de 1 000 lignes possibles). Une case ou un montant s'enregistre par `profiles.update(...).in("id", ...)` comme `savePayToggle` / `savePayAmount` de `EmployeesPanel` (mise à jour optimiste, retour en arrière si la base refuse) ; une ligne de trajet par `set_travel_pay_rule` pour un seul employé, avec la date d'effet de la semaine en cours et le `billed_to_britton` / seuil km déjà enregistrés (jamais écrasés) ; les changements « Tous / Aucun / Pour tous… » demandent une confirmation et ne touchent que les cellules affichées, applicables et non verrouillées (le travel en boucle, un employé à la fois, pour garder le « Britton » de chacun). Les anciens écrans (fiche employé, Trajets et frais, Règles de paie) ne changent pas. Le moteur de paie ne lit toujours pas `travel_pay_rules` (§6.1 D). Tests : `pay-conditions.test.js`, `PayConditionsManager.test.jsx`.

**V2.4.262 (technique).** Preuve de temps supp. vérifiable. Migration 0141 : `overtime_evidence.proof_ot` (3–8 chiffres), `proof_client_minutes`, `proof_return_minutes` (0–9999), `proof_read_at` ; trigger `overtime_evidence_guard_proof_fields` (avant insertion : remet les quatre colonnes à `null`, la politique « employee insert » laisse l'employé insérer sa ligne, donc seule la fonction Edge, par UPDATE avec la clé de service, peut les remplir). `supabase/functions/_shared/overtime_form.js` (`parseOvertimeForm` : OT après « OT », minutes après « chez le client », minutes après « retour à l'entrepôt … inscrire 0 » en sautant le 0 de la question et le numéro de la question suivante ; `null` = non trouvé, jamais 0 par défaut ; ré-exporté par `src/lib/overtime-form.js`). `process_overtime_evidence/index.ts` : lit les trois nombres, `ocr_status = processed` si le formulaire (ou l'ancien SMS) est reconnu, sinon `needs_review`, écrit `proof_read_at` (aussi sur échec) ; le texte brut n'est toujours pas gardé. **Migration 0141 appliquée et fonction `process_overtime_evidence` redéployée (v10) le 2026-11-16.** `src/lib/overtime-proof-check.js` : `expectedProof(jours, { firstTripUnpaid, tenHourDay })` (OT du dernier job ; client = minutes payées − retour − 480 / 600, plancher 0 ; retour = somme de `return_time_minutes`), `proofDifferences` (tolérance 15 min client, 5 min retour, OT comparé seulement s'il est numérique), `proofAnomalies(lignes, jobs, options)` (`proof_mismatch` / `proof_unread`, seulement fiches `submitted` et preuves lues par le nouveau lecteur : les anciens SMS ne sont jamais comparés), `proofDetailsText`. Branché dans `TodoInbox.jsx` et `ManagerDashboard.jsx` (`ANOMALY_COLUMNS` reçoit `return_time_minutes`) ; textes `manager.anomalies.proof_*`. Alerte seulement, aucun blocage. Définition de « minutes chez le client » à confirmer avec la propriétaire (hypothèse : minutes de temps supp. chez le client, retour exclu). Km du retour non comparés. Tests : `overtime-form.test.js`, `overtime-proof-check.test.js`.

**V2.4.261 (technique).** Preuve de temps supplémentaire = capture du formulaire de demande (au lieu du SMS) : `OvertimeEvidenceStep.jsx` affiche `public/overtime-form-example.webp` (remplace `overtime-evidence-example.webp`, supprimée) ; textes `form.evidence.title / description / choose / fileMissing / requiredApproval / requiredDuration / requiredCrop / exampleAlt / invalid` réécrits (FR / EN) ; libellés côté gestionnaire rendus neutres (« preuve » au lieu de « preuve SMS » : `manager.overtime.originalScreenshot`, `notifications.overtime*`, `history.overtimeIndicator`, `notifications.evidence*`, `manager.sections.overtimeDescription`, `audit.fileContext.overtime`) pour couvrir aussi les anciennes preuves. Aucun changement de logique : seuil de 8 h payées, une photo par jour, `save_own_job_with_overtime_evidence` et nettoyage à 30 jours inchangés ; la photo n'est pas lue ni validée (`ocr_text` reste vide, `form.evidence.invalid` n'est affiché nulle part). Aucune migration ni fonction Edge.

**V2.4.260 (technique).** `TodoInbox.jsx` : le titre de la carte « À regarder d'abord » (`todo.anomaliesTitle`, avec le nombre de jours) est un bouton `aria-expanded` qui replie la liste ; il utilise `useAnomaliesFolded` (`anomaly-seen.js`, clé `sparklog.anomaliesFolded`, même état que l'encadré de `ManagerDashboard`) et les textes `manager.anomalies.fold` / `unfold`. Test du hook : `anomaly-folded.test.js`. Aucune migration ni fonction Edge.

**V2.4.258 (technique).** Documentation seulement : `NOOB.md` réécrit en tête (« À faire maintenant » + « Fait récemment » condensé, plus de « appliquer la migration » déjà faite), en-tête de §6 mis à jour (date, pointeur vers `OFFICIEL.md`, migrations 0135–0140 appliquées), nouveau point ouvert §6.3 « Conformité ». Aucun code ni migration.

**V2.4.257 (technique).** Documentation seulement : `OFFICIEL.md` (racine) = plan directeur de conformité (convention collective résidentiel art. 18.01 2) b, Loi R-20 à valider, Loi 25) : exigences C1–C16 / L1–L9, inventaire des données (base Supabase `us-west-2`, 8 buckets, OCR.space, Google Apps Script, Resend / Brevo, Web Push), écarts E1–E14, architecture cible en deux côtés (côté 1 = ce dépôt allégé, pointage par `employee_number`, hébergé au Québec ; côté 2 = nouveau dépôt **privé** `sparklog-gestion`, noms / paie), modifications M1–M13 et H1–H6, phases P0–P6, matrice de traçabilité, décisions D1–D7. Aucun code ni migration. Les PR de conformité cochent ses cases et mettent à jour sa section 10.

**V2.4.256 (technique).** Documentation seulement : le point ouvert de §6.3 « Fermer le faux « Retournée par » » est noté ; aucun code ni migration.

**V2.4.255 (technique).** Retour d'une fiche de contremaître avec raison. Migration 0140 : `foreman_reports.returned_at / returned_by / returned_by_name / return_reason` (≤ 500 caractères) ; RPC `return_foreman_note_sheet(p_report_id, p_expected_updated_at, p_reason)` (`get_my_role() = 'manager'`, même transition et même contrôle d'état périmé que `return_job_for_correction` : `submitted` + verrouillée → `updated` + déverrouillée, audit `job_returned_for_correction` avec `foreman_note` et `reason`) qui écrit seule les colonnes `returned_*` (le droit de colonne du contremaître reste `body` / `audited_name`) ; `foreman_reports_guard_update` ne bouge `updated_at` que si le texte change (un retour ne remet pas la note « non lue »). `foreman-reports.js` : `returnReportedJob(client, report, reason)` (remplace l'appel direct à `return_job_for_correction`), `isNoteReturned(note, statutFiche)` (retournée tant que la fiche est `saved` / `updated`). `ForemanReportsPanel.jsx` : fenêtre de raison (facultative), bloc « Retournée par … le … / Raison » (atténué « Déjà retournée une fois » après la nouvelle soumission) ; `JobCard.jsx` : étiquette « Retournée » ; `ForemanNoteIcon.jsx` : bloc de retour dans le texte de la note (gestionnaires et contremaître, `History.jsx` lit les colonnes). Seul ce chemin enregistre la raison : un retour fait depuis la carte de revue (`ManagerDashboard`) ne la demande pas. **Appliquer la migration 0140 avant de déployer le code.** *Appliquée le 2026-11-13.*

**V2.4.254 (technique).** Le propriétaire soumet une fiche d'urgence pour l'employé. Migration 0137 : `create_job_for_employee(…, p_submit boolean default false)` (ancienne signature à 11 arguments supprimée) : avec `p_submit`, la fiche est insérée `submitted` (pas de déblocage de journée, pas de message à l'employé, `broadcast_id` nul), `employee_confirmed_at` reste nul, audit `job_created_submitted_by_owner`, un employé déjà en pause est accepté (pas pour un brouillon) ; nouvelle RPC `submit_manager_entry_for_employee(p_job_id)` (`is_privileged()`, fiche `manager_entry_at` non nulle, `saved` / `updated` non verrouillée, idempotente si déjà `submitted`, audit `job_submitted_by_owner`). `validate_job_submission_contract` (corps de 0135) saute **seulement** la preuve de temps supp. et le contrôle d'inventaire quand `current_setting('sparklog.owner_submit', true) = 'on'` ; ce réglage n'est posé (`set_config(..., true)`, remis à `off` juste après) que par ces deux fonctions `security definer` (le navigateur ne peut pas poser un réglage de base) ; intervalle, chevauchement et km restent contrôlés. `manager-entry.js` : `p_submit` (case `submit` du formulaire). `EmergencyTimesheet.jsx` : case « La soumettre pour l'employé » (liste d'employés avec ceux en pause), bouton « Soumettre pour l'employé » sur les brouillons à valider. Tests dans `manager-entry.test.js` (le SQL est lu, pas exécuté). Contournement de la preuve de temps supp. : décision d'affaires à confirmer (la règle de preuve reste exigée à l'employé). **Appliquer la migration 0137 avant de déployer le code** (le formulaire envoie `p_submit`). **Même version, ajouts :** (a) notes lues / non lues par gestionnaire, migration 0138 : `foreman_reports.updated_at` (posé par `foreman_reports_guard_update`), table `foreman_report_reads` (`report_id` × `manager_id`, RLS `manager_id = auth.uid()` et `get_my_role() = 'manager'`, `read_at` posé par le serveur, droits `select, insert` + `update (read_at)`) ; `foreman-reports.js` : `isNoteUnread` (non lue tant qu'aucune lecture, ou lecture antérieure à `updated_at`), `fetchNoteReads`, `markNoteRead` (upsert) ; `ForemanNoteIcon.jsx` (h-7, rouge `unread` / bleu sinon, ouvre le texte, `onOpen`) utilisé par `JobCard.jsx` (gestionnaire : `ManagerDashboard` lit notes + lectures, `noteReadStable` enregistre l'ouverture) et `History.jsx` (contremaître : toujours bleue) ; `ForemanReportsPanel.jsx` : pastille « Non lue » + « Marquer comme lue ». (b) Preuve de temps supp. : l'étape `evidence` d'`EndOfShiftDialog` n'a plus de « × » (`DialogContent hideClose`, nouvelle prop de `ui/dialog.jsx`), ni clic extérieur ni Échap ; `OvertimeEvidenceStep` a « Je ne l'ai pas encore » (`onSkip` = `skipEvidenceForNow` d'`EmployeeForm.jsx` : `saveJob("draft", …)` sans preuve, jamais soumise, étape `evidenceLater` d'`EndOfShiftDialog` avec « Faites-le aujourd'hui ») ; aucun changement de base : la base refuse toujours la soumission sans preuve. (c) `WeekSnapshot.jsx` : `proofMissing` par tuile (rôle ≠ admin, au moins une fiche `saved` / `updated`, aucune preuve `overtime_evidence_captured`, minutes de la journée au-dessus de `dailyRegularMinutesFor(profil)`) → `ring-2 ring-red-600` + légende ; approximation : minutes brutes (le premier trajet non payé n'est pas retiré). (d) Moteur **2.10.0** : `isMealEligible` renvoie faux dès que `dailyRegularMinutes > 480` (« 4 jours de 10 h » : aucun souper, décision du 2026-11-13) ; jumeau SQL : migration 0139, `reconcile_overtime_meal` (corps de 0135) jamais éligible pour `ten_hour_days` hors contremaître / sous-traitant, et retire les demandes de souper non révisées ; fiche des règles de paie et `docs/rules/compensation-rules.md` à jour ; tests `ten-hour-days.test.js`. `classify_week` / `push_approved_batch` importent le moteur mais n'utilisent pas le souper : leur redéploiement ne fait que changer la version affichée. (e) `WeekSnapshot.jsx` : `paidMinutes` retire le premier trajet non payé (`dayFirstTripUnpaidMinutes`, profil `first_trip_unpaid`) avant de comparer à `dailyRegularMinutesFor`. **Appliquer 0137, 0138 puis 0139 avant de déployer le code.** *Appliquées le 2026-11-13.*

**V2.4.253 (technique).** La note du contremaître suit la fiche. Migration 0136 : `foreman_reports.job_id` (FK `jobs` `on delete cascade`, index unique partiel = une note par fiche ; null pour les notes d'avant) ; politique d'insertion : si `job_id`, la fiche doit être celle de l'auteur ; politique `update` (l'auteur, `job_id` non nul, fiche `saved` / `updated`) avec droit de colonne `update (body, audited_name)` et trigger `foreman_reports_guard_update` (auteur, fiche, date, clé et heure figés) ; politique `delete` : `get_my_role() = 'manager'` ; droits `select, insert, delete`. `src/lib/foreman-reports.js` : `saveJobNote` (crée ou met à jour la note de la fiche ; 23505 = même note), `fetchJobNote`, `deleteForemanReport`, `returnReportedJob` (`return_job_for_correction`), `fetchForemanReports` joint `job:jobs(...)`, `foremanReportsCsv` (séparateur `;`, protégé contre les formules) ; `submitForemanReport` retiré. `ForemanNotesDialog.jsx` n'envoie plus rien : « Joindre à la fiche » garde `{ auditedName, body }` dans l'état `foremanNote` d'`EmployeeForm.jsx`, envoyé par `saveJobNote` après `save_own_job` réussi (un échec garde la note pour le prochain enregistrement, avertissement `foremanNotes.errors.attachFailed`, la fiche n'échoue jamais) ; en modification, la note existante est lue (`fetchJobNote`) et modifiable. `ForemanReportsPanel.jsx` : fiche liée (OT, date, heures, état), « Retourner la fiche » (fiche `submitted`), « Supprimer la note », « Exporter (CSV) ». `ManagerDashboard.jsx` lit les notes des fiches CONTREMAÎTRE à l'écran (`foreman_reports.in("job_id", …)`, un effet sur `jobs`) et `JobCard.jsx` (`foremanNote`) affiche une icône cliquable (`foremanNotes.cardIcon`) qui ouvre le texte ; pas dans les cartes de notification ni `TodoInbox`. Rattrapage dans la 0136 (avant le trigger de mise à jour) : chaque ancienne note est liée à l'unique fiche `CONTREMAÎTRE` du même auteur le même jour ; plusieurs notes pour une fiche sont fusionnées (la plus ancienne d'abord, ≤ 5000 caractères, les autres supprimées) ; une note sans fiche ce jour-là reste sans fiche (essai à blanc le 2026-11-13 : 7 notes → 5, 4 liées, 1 sans fiche). La note n'est pas dans l'export Google. Le brouillon local n'enregistre pas la note (perdue si l'écran est fermé avant l'enregistrement). **Appliquer la migration 0136 avant de déployer le code** (le panneau lit `job_id`). *Appliquée le 2026-11-13.*

**V2.4.252 (technique).** `WeekSnapshot.jsx` : `foremanDayTopUp(date, jobCount, hours, holidays)` (jour lundi–vendredi hors `company_holidays`, au moins une fiche comptée, moins de 8 h travaillées) pour un profil `role = "foreman"` → étiquette « min. 8 h » dans la case (`live.week.foremanMin`) et ligne « Payé … » du total (`foremanPaid` = 8 h pour chaque jour complété + heures des autres jours ; `live.week.foremanPaid`). Affichage seulement : la paie vient du moteur 2.8.0 (`minDayMinutes`), l'arrondi de 15 min (`day-rounding.js`) ne connaît toujours pas le minimum du contremaître (ligne « payé · arr. · cpt » inchangée). Tests dans `WeekSnapshot.test.jsx`. Aucune migration.

**V2.4.251 (technique).** `History.jsx` : `isOwner(job)` compare `job.user_id` à `effectiveUserId` (l'employé vu en « Vue en tant que »), plus à `user.id` du gestionnaire ; en `isViewMode`, les boutons Ouvrir / Supprimer / Soumettre / Soumettre la journée sont affichés `disabled`, et `submitJob` / `deleteJob` / `submitDay` sortent tout de suite. Test : `src/pages/History.test.jsx`. Reste : `Week.jsx`, `Profile.jsx` et `EmployeeForm.jsx` (champs déjà désactivés par `disableInputs`) n'ont pas été revus bouton par bouton.

**V2.4.250 (technique).** `RETURN_TIME_OPTIONS` (`job-contract.js`) commence par `0` (0 est déjà accepté par `isValidReturnMinutes` et la base : `return_time_minutes` 0, 5, 10, …) ; le bouton « 0 min » mène à l'étape des km comme les autres. `form.return.askDescription` raccourci (sans « entrepôt, maison ou ailleurs »). Aucune migration.

**V2.4.249 (technique).** Textes `form.return.askTitle` / `askDescription` (« Retour facturable ? ») et `form.return.kmBreakdown` (« retour » sans « à l'entrepôt ») ; la logique du retour (`EndOfShiftDialog`, `return_time_minutes`, `km_retour`) ne change pas. `EmployeeForm.jsx` : à l'enregistrement, Départ = Fin (même HH:mm) est refusé avec `form.errors.invalidInterval` avant tout appel `save_own_job` (avant : une fiche 6 h 30 → 6 h 30 était stockée en 24 h — `started_at` / `ended_at` à +24 h —, chevauchait les autres fiches du jour et bloquait « Soumettre la journée » ; V2.4.247 n'avait corrigé que le message du chevauchement). Test ajouté. Aucune migration. Note : en « Vue en tant que… » (lecture seule) la soumission échoue par conception (le RPC `save_own_job` tourne avec le compte du gestionnaire).

**V2.4.248 (technique).** `UnlockDayManager.jsx` : option `__all__` (« Tous les employés ») du sélecteur → un seul `upsert` de `job_entry_unlocks` pour tous les profils actifs (non en pause), puis une seule requête des fiches `submitted` du jour (`.in("user_id", …)`) et une seule confirmation pour les retourner (`returnJobs`, `return_job_for_correction` par fiche, comme pour un employé) ; bouton « Tout refermer » (`removeAllUnlocks` : un `delete().in("id", …)` de toutes les lignes affichées, après confirmation). Textes `timeRules.allEmployees / allUnlocked / reopenAllSubmittedConfirm / removeAll / allUnlocksRemoved`, `confirm.removeAllUnlocks` (+ `.plain`). Tests dans `UnlockDayManager.test.jsx`. Aucune migration (RLS de `job_entry_unlocks` inchangée).

**V2.4.247 (technique).** `findJobOverlap` / `interval` (`src/lib/job-overlap.js`) : une fiche dont Départ = Fin (0 minute) renvoie `null` au lieu d'être comptée comme 24 h (`end <= start` → `end < start`) ; avant, le message « chevauche » masquait « Heures invalides » (`job-contract.js` compte aussi 0 comme 1440 min, refusé > 16 h). Test ajouté. Aucun changement de base.

**V2.4.246 (technique).** Règle « 4 jours de 10 h » (moteur 2.9.0). Migration 0135 : colonne `profiles.ten_hour_days` (booléen, défaut faux ; écrite par les gestionnaires via la politique de profil, l'employé reste hors de la liste blanche) ; `validate_job_submission_contract` (seuil de la preuve de temps supp. : 480 → 600 min) et `reconcile_overtime_meal` (souper : 615 → 735 min) recréées, corps de 0125, seuls les deux seuils changent ; sans effet pour `foreman` / `subcontractor_1`. Moteur : `DAILY_REGULAR_MINUTES` (480), `TEN_HOUR_DAY_MINUTES` (600), `dailyRegularMinutesFor(profile)`, option `dailyRegularMinutes` de `calculatePayrollEntries` (journée régulière et plafond de la semaine pour le retour), renvoyée par `overtimeOptionsFromProfile` ; `isMealEligible({ dailyRegularMinutes })`. Écrans : la colonne est lue partout où l'on lit `overtime_first_hour_double` (Talons, DAS, Paie de la semaine, Calcul, Rapports, Coûts, RE, Export CCQ, `classify_week`) et `Week.jsx` / `History.jsx` / `EmployeeForm.jsx` (preuve de temps supp.), `meal-claim-request.js` / `mealDecision` (souper), `ManagerDashboard` + `TodoInbox` + `detectJobAnomalies({ tenHourUsers })` (« temps supp. sans preuve » après 10 h). Case dans `pay-options.js` (verrouillée à faux pour sous-traitant et contremaître), fiche des règles de paie et `docs/rules/compensation-rules.md` (TEN_HOUR_DAYS) à jour. `push_approved_batch` et la feuille Google ne changent pas (la feuille ne calcule pas le temps supp.). Ouvert : 5e journée de la semaine (l'export CCQ ramène déjà en temps supp. les heures régulières au-delà de 40 h / semaine ; les autres écrans non) et férié en semaine (retire encore 8 h du plafond de la semaine). Règle non signée par un spécialiste (ADR 0001). Migration 0135 appliquée à la base le 2026-11-11 (fichier ajouté à `main` avant le code ; vérifié : colonne, seuils 600 / 735 min, déclencheur présent) ; **à faire :** redéployer `classify_week`. *Fait (v20) ; le moteur 2.10.0 (V2.4.254) ne change aucun calcul serveur : le redéployer ne change que la version affichée.*

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

- [ ] **Conformité — `OFFICIEL.md`** (convention collective, Loi R-20 à valider, Loi 25) : P0 (avis juridique / AECQ, responsable de la protection des renseignements, hébergeur au Québec et ses certificats) ;
  P1 (consentement exprès annexe W-1 + refus / retrait, avis à l'employé pour la feuille d'urgence soumise — M2, politique de confidentialité affichée, test « aucune géolocalisation », CSP en application,
  destruction automatique des preuves en photo, registre des incidents, ÉFVP) ; P2 (nouveau projet Supabase au Québec + bascule, sortir OCR.space et Google) ; P3 (séparation côté 1 / côté 2, nouveau dépôt privé) ;
  P4 (certifications, ententes) ; P5 (documents) ; P6 (audit). Chaque PR de conformité coche ses cases dans `OFFICIEL.md` et met à jour sa section 10.

- [ ] **Fermer le faux « Retournée par » des notes de contremaître** (constaté le 2026-11-13, faible risque) : la politique d'insertion de
  `foreman_reports` (0136) laisse un contremaître écrire n'importe quelle colonne de **sa propre** nouvelle note, donc `returned_at`,
  `returned_by`, `returned_by_name` et `return_reason` (0140) par une requête faite à la main (le droit `update` est limité à `body` /
  `audited_name`, et seule `return_foreman_note_sheet` fait un vrai retour). Effet : une fausse étiquette « Retournée par … » sur sa note ;
  aucun effet sur les fiches, les heures, la paie ni l'audit. **Solution prête :** migration qui ajoute un trigger `before insert` sur
  `foreman_reports` mettant ces quatre colonnes à `null` (comme `foreman_reports_guard` fixe déjà l'heure et nettoie le texte), ou, de façon
  équivalente, `revoke insert` global puis `grant insert (user_id, job_id, submission_key, report_date, audited_name, body)` ; test dans
  `foreman-reports.test.js` (le SQL contient le `null` des quatre colonnes) ; mentionner la migration dans README / NOOB / CLAUDE.

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
- [ ] **`OCR_SPACE_API_KEY`** dans les secrets Edge : le service répond 429 (constaté le 2026-11-18, V2.4.277) → clé personnelle à saisir (sinon clé « helloworld » partagée) ; vérifier aussi le forfait Vercel (Hobby =
  usage commercial interdit).
- [ ] P-5 (optionnel) : agrégation des coûts côté serveur — voir §2.

---

## Notes on scope
- **Documents de paie réels** (relevés trimestriels, talons) : le relevé « Masse salariale RBQ » contient le NAS de
  chaque employé. Ne jamais en copier une valeur personnelle dans le dépôt (public) ; seuls des totaux anonymes.
- No clock-in/out/break buttons exist; the employee flow is manual Départ/Arrivée/Fin entry, so the
  repetitive Save/Submit paths were audited in place of clock-button races.
- Re-check line numbers before editing; the tree moves under active development.
