# Procédure de restauration (V2.4.227)

Objectif : savoir **à l'avance** remettre Sparklog en marche après une perte de données, et le **prouver** par un essai
sur un projet jetable. Un essai complet prend environ 1 heure ; à refaire **une fois par trimestre** et avant la
première paie de janvier.

## 0. Ce qu'on protège, et où ça vit

| Donnée | Où | Sauvegardée par |
|---|---|---|
| Fiches, paie, journal, profils, barèmes | Base Postgres (Supabase) | Sauvegarde Supabase (voir étape 1) |
| NAS des employés | **Coffre Vault** (Supabase), chiffré ; la base ne garde que l'identifiant | La sauvegarde de la base ne contient que du chiffré : sans la clé du coffre, les NAS sont illisibles. **Restaurer dans le même projet (ou via la restauration Supabase) conserve la clé.** |
| Photos (temps supplémentaire, stationnement, accidents, inventaire) | Stockage Supabase (buckets privés) | **Pas incluses dans la sauvegarde de la base** : à exporter (Justificatifs › Télécharger) avant leur suppression automatique |
| Secrets des fonctions Edge (`APPS_SCRIPT_URL`, `APPS_SCRIPT_TOKEN`, VAPID…) | Supabase › Edge Functions › Secrets | Aucune : **les garder dans le gestionnaire de mots de passe de la propriétaire** |
| Variables du site (`VITE_*`) | Vercel › Settings › Environment Variables | Aucune : mêmes précautions |
| Google Sheet | Google Drive | Historique des versions de Google |

## 1. Vérifier ce qui est réellement sauvegardé (à faire d'abord)

1. Supabase › Project Settings › **Billing** : le forfait gratuit **n'a pas** de sauvegarde automatique téléchargeable ;
   le forfait Pro garde 7 jours de sauvegardes quotidiennes. Si le forfait est gratuit, passer à Pro **ou** faire l'étape 2 chaque semaine.
2. Supabase › Database › **Backups** : noter la date de la dernière sauvegarde (elle doit dater de moins de 24 h).
3. Pour la reprise à un instant précis (PITR), il faut l'option payante « Point in Time Recovery » ; sinon on reprend à la dernière sauvegarde du jour.

## 2. Copie de secours manuelle (si pas de Pro, ou en plus)

Avec la CLI Supabase sur un ordinateur (jamais dans le dépôt, jamais envoyée par courriel) :

```bash
supabase db dump --linked -f sparklog-schema.sql
supabase db dump --linked --data-only -f sparklog-data.sql
```

Ranger les deux fichiers dans un dossier **chiffré** (ils contiennent des données de paie). Le coffre Vault n'est pas
exporté par ces commandes : après une restauration dans un **autre** projet, les NAS devront être ressaisis (propriétaire seulement).

## 3. L'essai de restauration (sur un projet jetable, jamais sur la production)

1. Créer un projet Supabase vide « sparklog-essai » (forfait gratuit suffisant).
2. **Si Pro** : Supabase › Database › Backups › *Restore to a new project*, choisir la sauvegarde la plus récente.
   **Sinon** : appliquer le dossier `supabase/migrations/` dans l'ordre (SQL editor ou `supabase db push`), puis charger `sparklog-data.sql`.
3. Ouvrir le fichier **`supabase/tests/restore-check.sql`** dans le SQL editor du projet d'essai et l'exécuter.
   - Toutes les lignes doivent avoir `ok = true`.
   - `key_row_counts` doit être égal (à la journée près) à celui de la production : exécuter le même fichier sur la production et comparer.
   - `nas_secrets_still_in_vault` est `false` après une restauration dans un autre projet : normal (voir l'étape 2) ; les NAS se ressaisissent.
4. Se connecter à l'app pointée sur le projet d'essai (variables `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` de l'essai, en local avec `npm run dev`) avec un compte gestionnaire : ouvrir **À traiter**, **Paie de la semaine** et un talon de la semaine 43 ; les chiffres doivent être ceux de la production.
5. Supprimer le projet d'essai. Noter la date et le résultat dans le Journal de la propriétaire.

## 4. Restauration réelle (incident)

1. **Ne rien supprimer.** Mettre l'app en pause (message aux employés par Annonces) pour que personne ne saisisse pendant la reprise.
2. Supabase › Database › Backups › choisir la sauvegarde (ou l'instant PITR) **juste avant** l'incident ; restaurer.
3. Relancer `supabase/tests/restore-check.sql` : tout doit être `ok`.
4. Refaire les secrets des fonctions Edge s'ils manquent (étape 0), puis redéployer les fonctions : `supabase functions deploy <nom>` pour chacune de la liste du README.
5. Recréer les entrées du coffre lues par les tâches planifiées si elles manquent (`sparklog_project_url`, `sparklog_anon_key`, `cron_secret`, voir la migration 0094).
6. Regarder **Gestion › Santé du système › Vérifications automatiques** : tout doit être vert après la première exécution quotidienne.
7. Les fiches saisies **après** la sauvegarde sont perdues : demander aux employés de les ressaisir (leurs brouillons restent sur leur téléphone 30 jours).

## 5. Ce que le test automatique vérifie

`src/lib/restore-procedure.test.js` garde la procédure honnête : les tables, tâches planifiées et buckets que `restore-check.sql`
attend existent bien dans les migrations, le fichier ne contient aucune écriture, et ce document reste relié au contrôle.
