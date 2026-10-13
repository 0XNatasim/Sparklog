# NOOB.md — Ce qu'il reste à faire, en clair

> Version simple de la liste détaillée dans `CLAUDE.md` §6. Mise à jour : 2026-10-13 (V2.4.108).
> Seulement ce qui reste à faire : ce qui est terminé est retiré (voir l'historique Git).

## Où on en est

- ✅ L'app fonctionne et les heures sont bien classées. Toutes tes décisions de paie sont dans l'app.
- ⚠️ **Les montants en dollars de la paie** (avantages CCQ, impôts, cotisations) sont **des estimations**.
  Ils restent « à réviser » tant que les étapes 1 à 4 ci-dessous ne sont pas faites.

📋 Toutes les règles de paie en vigueur, avec leurs options et leurs sources :
**Gestion › Avancé › Règles de paie**.

Qui fait quoi : 👤 **toi** · 🧾 **ton comptable / ta firme de paie** · 💻 **Claude** (du code, sur demande)

---

## Étape 1 — Infos de l'employeur 👤

À inscrire dans **Configuration › Paramètres › Paie — employeur**.

- [ ] **Masse salariale annuelle de Messier.** La cotisation FDRCMO (1 %) ne s'applique qu'au-delà de 2 M$.
  *Où la trouver :* ton comptable.
- [ ] **Avis de cotisation CNESST de Messier** : le taux par 100 $ de masse salariale. Sans lui, ce calcul
  reste « à réviser ». *Où le trouver :* ton dossier CNESST en ligne.

## Étape 2 — Infos de chaque employé 👤

- [ ] **Formulaires TD1 (fédéral) et TP-1015.3 (Québec)** remplis et signés par chaque employé. Ils
  donnent les crédits d'impôt personnels. *Où l'inscrire :* **Configuration › Paramètres › Paie — TD1 /
  TP-1015.3 des employés**. Inscris seulement les montants, jamais le NAS ni une copie du formulaire.
  Tant qu'un employé n'a rien, l'app prend le montant personnel de base.
- [ ] **Cumul de l'année avant Sparklog** (salaire, RRQ, AE, RQAP, impôts déjà retenus). Sans lui, l'app
  croit que l'année commence à zéro et ne sait pas quand arrêter les retenues à leur maximum annuel
  (RRQ à 74 600 $ puis 85 000 $ de salaire, AE à 68 900 $, RQAP à 103 000 $). *Où l'inscrire :*
  **Paie › Calcul**, en tapant les montants ou en important le dernier talon PDF de l'employé.
  Ensuite, **comptabiliser chaque semaine** pour que le cumul suive.
- [ ] **Syndicat et local** de chaque employé (par ex. FIPOE, local 568…).
- [ ] **Niveau** (compagnon ou apprenti, et quelle période) et **taux horaire**, vérifiés sur la carte ou
  le certificat CCQ. La liste de contrôle à remplir est à la fin du `README.md`.

## Étape 3 — Valider avec de vrais talons de paie 👤 🧾

- [ ] Fournir **3 à 5 vrais talons** de paie récents :
  - un apprenti ;
  - une semaine avec du temps sup. ;
  - une semaine avec un souper ou du stationnement ;
  - une semaine avec la prime de chef d'équipe.
- [ ] Refaire chaque paie dans l'app et comparer **au cent près** avec les calculateurs officiels gratuits :
  **WebRAS** (Revenu Québec) et **PDOC** (Agence du revenu du Canada).

Aujourd'hui, un seul talon a été vérifié (un compagnon).

## Étape 4 — Faire approuver 🧾

- [ ] Un **spécialiste de la paie ou de la CCQ, nommé** (comptable ou firme de paie), relit les règles et
  les résultats et donne son accord par écrit.
- [ ] Ensuite seulement, Claude fait passer le moteur de paie de « brouillon » à « validé ». Les
  montants ne sont plus marqués « à réviser ».

## Étape 5 — Améliorations techniques, sans document 💻

Claude peut les faire quand tu veux. Ça ne bloque pas la paie.

- [ ] **Tableau des coûts** et **approbation en lot** : calculs plus rapides côté serveur.
- [ ] **Changement d'heure de l'automne** : permettre au gestionnaire de choisir quelle « 2 h du matin »
  a été travaillée. Aujourd'hui, l'heure répétée est refusée.
- [ ] **Ménage du code** : découper les deux plus gros écrans (la fiche employé et la liste des employés)
  et corriger environ 60 avertissements du vérificateur de code. Il faudra d'abord ajouter des tests
  d'écran.

## À surveiller 👤

- [ ] **Assurance MÉDIC** : 0,68 $/h jusqu'au **24 avril 2027** (décision du CASIC). Avant cette date,
  vérifier le nouveau taux (la convention prévoit 1,06 $) et le dire à Claude.

## Comment demander à Claude

Une phrase suffit, par exemple :
- « Voici 3 talons de paie, compare-les avec l'app. »
- « Ajoute une prime de soir de 2 $/h pour tel employé. »
- « Fais l'étape 5, le point sur le changement d'heure de l'automne. »

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
