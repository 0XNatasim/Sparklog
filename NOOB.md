# NOOB.md — Ce qu'il reste à faire, en clair

> Version simple de la liste détaillée dans `CLAUDE.md` §6. Mise à jour : 2026-10-12 (V2.4.100).
> Coche les cases au fur et à mesure.

## Où on en est

- ✅ **L'app fonctionne.** Les employés entrent leurs heures, les gestionnaires approuvent et exportent.
- ✅ **Les heures sont bien classées** : 8 h par jour en régulier, la 1re heure sup. de la semaine à 1,5×,
  le reste à 2×, le souper de 30 $, les options par employé. C'est en production et testé.
- ⚠️ **Les montants en dollars de la paie** (avantages CCQ, impôts, cotisations) sont **des estimations**.
  Ils sont affichés « à réviser » tant que les étapes 1 à 5 ci-dessous ne sont pas faites.

Qui fait quoi : 👤 **toi** · 🧾 **ton comptable / ta firme de paie** · 💻 **Claude** (du code, sur demande)

---

## Étape 1 — Deux décisions rapides 👤

- [ ] **Temps de retour à l'entrepôt.** Aujourd'hui l'app le compte dans la journée : il peut donc créer du
  temps supplémentaire, sauf pour les employés qui ont l'option « retour sans avantages ». Est-ce la bonne
  règle, ou le retour doit-il **toujours** être payé au taux simple ?
- [ ] **Prélèvement CCQ.** L'app retient **0,75 %** sur la paie de l'employé. Un ancien document parlait de
  1,5 %, ce qui est probablement la part de l'employé plus celle de l'employeur. Confirme le bon chiffre et
  sur quel salaire il se calcule (avec ou sans la prime de chef d'équipe).

➡️ Quand tu as tranché, dis-le à Claude : il met le code et la documentation à jour.

## Étape 2 — Rassembler les documents officiels 👤 🧾

Pour chaque règle, il faut la **source** : nom du document, article, date d'entrée en vigueur.

- [ ] **Convention collective du secteur institutionnel-commercial (ICI) 2025-2029.** Elle sert de source
  pour : les 8 h par jour, le temps sup. à 1,5× puis 2× (et le fait que le 1,5× compte **par semaine**),
  le souper de 30 $ après 10 h 15, la prime de chef d'équipe, le temps de retour et le kilométrage.
  *Où :* l'ACQ ou la CCQ.
- [ ] **Taux de la cotisation patronale CCQ aux « avantages sociaux »** (électricien, ICI 2026-2027).
  L'app utilise 8,875 $/h, un chiffre déduit d'un talon de paie et non tiré d'une table officielle.
  *Où :* la CCQ ou ta firme de paie.
- [ ] **Règle du prélèvement CCQ** (voir l'étape 1). *Où :* le guide du rapport mensuel de la CCQ.
- [ ] **Normes du travail (CNT) 2026** : le taux et le maximum. *Où :* le guide de l'employeur de Revenu
  Québec (TP-1015.G).
- [ ] **Masse salariale annuelle de Messier.** Elle sert à savoir si la cotisation FDRCMO (1 %)
  s'applique, ce qui n'est probablement pas le cas. *Où :* ton comptable.
- [ ] **Avis de cotisation CNESST de Messier** (votre taux). Sans lui, ce calcul reste « à réviser ».
  *Où :* ton dossier CNESST en ligne.

## Étape 3 — Infos de chaque employé 👤

- [ ] **Formulaires TD1 (fédéral) et TP-1015.3 (Québec)** remplis et signés par chaque employé. Ils
  donnent les crédits d'impôt personnels. L'app ne les a pas encore et prend donc les montants de base.
- [ ] **Syndicat et local** de chaque employé (par ex. FIPOE, local 568…).
- [ ] **Niveau** (compagnon ou apprenti, et quelle période) et **taux horaire**, vérifiés sur la carte ou
  le certificat CCQ. La liste de contrôle à remplir est à la fin du `README.md`.

## Étape 4 — Valider avec de vrais talons de paie 👤 🧾

- [ ] Fournir **3 à 5 vrais talons** de paie récents :
  - un apprenti ;
  - une semaine avec du temps sup. ;
  - une semaine avec un souper ou du stationnement ;
  - une semaine avec la prime de chef d'équipe.
- [ ] Refaire chaque paie dans l'app et comparer **au cent près** avec les calculateurs officiels gratuits :
  **WebRAS** (Revenu Québec) et **PDOC** (Agence du revenu du Canada).

Aujourd'hui, un seul talon a été vérifié (un compagnon).

## Étape 5 — Faire approuver 🧾

- [ ] Un **spécialiste de la paie ou de la CCQ, nommé** (comptable ou firme de paie), relit les règles et
  les résultats et donne son accord par écrit.
- [ ] Ensuite seulement, Claude fait passer le moteur de paie de « brouillon » à « validé ». Les
  montants ne sont plus marqués « à réviser ».

## Étape 6 — Améliorations techniques, sans document 💻

Claude peut les faire quand tu veux. Ça ne bloque pas la paie.

- [ ] **Export des NAS** : le faire côté serveur avec une trace de chaque consultation. Aujourd'hui, le
  propriétaire peut les lire en bloc depuis le navigateur sans trace.
- [ ] **Envoi de la preuve de temps sup.** : envoyer la photo et la fiche en un seul bloc, pour éviter
  qu'une coupure réseau laisse une photo sans fiche.
- [ ] **Annulation d'un export** : garder le taux horaire d'origine. Aujourd'hui, l'annulation reprend le
  taux actuel de l'employé.
- [ ] **Tableau des coûts** et **approbation en lot** : calculs plus rapides côté serveur.
- [ ] **Filtres du tableau de bord** : quand on change vite de filtre, une ancienne réponse ne doit plus
  pouvoir écraser la nouvelle.
- [ ] **Erreurs réseau pendant l'enregistrement** : reconnexion et nouvel essai automatiques.
- [ ] **Changement d'heure de l'automne** : permettre au gestionnaire de choisir quelle « 2 h du matin »
  a été travaillée. Aujourd'hui, l'heure répétée est refusée.
- [ ] **Ménage du code** : découper les deux plus gros écrans (la fiche employé et la liste des employés)
  et corriger environ 60 avertissements du vérificateur de code. Il faudra d'abord ajouter des tests
  d'écran.

## Comment demander à Claude

Une phrase suffit, par exemple :
- « J'ai la convention collective, voici l'article sur le temps sup. »
- « Le retour à l'entrepôt doit toujours être au taux simple, applique-le. »
- « Fais l'étape 6, le point sur l'export des NAS. »

Claude crée une PR. Toi, tu vérifies l'aperçu Vercel, puis tu fusionnes.

---

## Petit lexique

| Terme | Ça veut dire |
|---|---|
| **CCQ** | Commission de la construction du Québec : salaires, avantages sociaux, rapport mensuel |
| **ICI** | Secteur institutionnel-commercial (celui de Messier) |
| **DAS** | Déductions à la source : impôts, RRQ, assurance-emploi, RQAP retenus sur la paie |
| **TD1 / TP-1015.3** | Formulaires d'impôt de l'employé (fédéral / Québec) |
| **WebRAS / PDOC** | Calculateurs officiels gratuits des retenues (Québec / fédéral) |
| **CNESST, CNT, FDRCMO** | Cotisations payées par l'employeur (santé-sécurité, normes du travail, formation) |
| **PR** | Une proposition de changement sur GitHub. On la vérifie, puis on la fusionne (« merge ») |
| **Aperçu Vercel** | Une copie de l'app avec les changements, pour tester avant la mise en ligne |
