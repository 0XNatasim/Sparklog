# NOOB.md — Ce qu'il reste à faire, en clair

> Version simple de la liste détaillée dans `CLAUDE.md` §6. Mise à jour : 2026-10-13 (V2.4.101).
> Coche les cases au fur et à mesure.

## Où on en est

- ✅ **L'app fonctionne.** Les employés entrent leurs heures, les gestionnaires approuvent et exportent.
- ✅ **Les heures sont bien classées** : 8 h par jour en régulier, la 1re heure sup. de la semaine à 1,5×,
  le reste à 2×, le souper de 30 $, les options par employé. C'est en production et testé.
- ⚠️ **Les montants en dollars de la paie** (avantages CCQ, impôts, cotisations) sont **des estimations**.
  Ils sont affichés « à réviser » tant que les étapes 1 à 5 ci-dessous ne sont pas faites.

Qui fait quoi : 👤 **toi** · 🧾 **ton comptable / ta firme de paie** · 💻 **Claude** (du code, sur demande)

---

## Étape 1 — Tes décisions 👤

La convention collective a été lue le 13 octobre. Elle tranche certains points, mais quelques choix restent
à faire. Pour chacun, l'article de la convention est indiqué.

- [x] **Temps de retour à l'entrepôt.** Réglé le 13 octobre. Le retour n'est jamais du temps sup.
  Par défaut, il est payé au taux simple, sans avantages sociaux. Si la case « Temps de retour avec
  avantages sociaux jusqu'à 8h » est cochée dans **Règles de temps**, il garde ses avantages tant que la
  journée ne dépasse pas 8 h. Au départ, la case n'est cochée pour personne : à toi de la cocher pour
  les employés concernés.
- [ ] **Prime de chef d'équipe en temps sup.** Selon la convention (art. 22.01), la prime de chef d'équipe
  est **aussi majorée** en heures sup. (1,5× ou 2×). L'app la paie seulement sur les heures normales.
  Regarde un talon de chef d'équipe avec du temps sup. : la prime y est-elle majorée ?
- [ ] **Repas.** Selon la convention (art. 20.07), le repas de 30 $ est dû pour les heures sup. après une
  journée de **10 h**, et un 2e repas après 4 autres heures. L'app exige 10 h 15 et ne donne qu'un repas.
  Quelle règle appliques-tu ?
- [ ] **Assurance MÉDIC.** La convention fait passer la retenue de 0,68 $ à **0,86 $/h** le 26 avril 2026.
  L'app retient 0,68 $, à cause d'un maintien annoncé par la CCQ. Regarde un talon récent : quel montant
  y est retenu ?
- [ ] **Dîner.** La convention prévoit ½ h ou 1 h de dîner non payée. Les employés l'enlèvent-ils déjà de
  leurs heures dans l'app ?
- [ ] **Prélèvement CCQ.** C'est réglé : 0,75 % pour l'employé + 0,75 % pour l'employeur, soit 1,5 % au
  total. Une question reste : la prime de chef d'équipe entre-t-elle dans le calcul ? Ton comptable
  peut répondre.

➡️ Quand tu as tranché, dis-le à Claude : il met le code et la documentation à jour.

## Étape 2 — Documents officiels 👤 🧾

Les documents publics sont reçus et rangés dans `docs/reference/` : convention collective, grille de
l'ACQ, guide TP-1015.G et tableau CCQ. Le détail, article par article, est dans
`docs/rules/compensation-rules.md`.

- [x] **Convention collective ICI 2025-2029.** Elle confirme : 8 h par jour, la 1re heure sup. de la
  semaine à 1,5× puis 2×, le repas de 30 $, le chef d'équipe à 8 %, le 13 %, les salaires et la retraite.
- [x] **Cotisation patronale aux avantages sociaux** : 8,875 $/h pour le compagnon, 7,955 $/h pour les
  apprentis. Le taux des apprentis est corrigé dans l'app (V2.4.101).
- [x] **Normes du travail (CNT) 2026** : 0,06 %, jusqu'à 103 000 $ par employé. C'est ce que l'app utilise.
- [ ] **Masse salariale annuelle de Messier.** La cotisation FDRCMO (1 %) ne s'applique qu'au-delà de 2 M$.
  *Où :* ton comptable.
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
