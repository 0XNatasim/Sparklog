# NOOB.md — Ce qu'il reste à faire, en clair

> Version simple de la liste détaillée dans `CLAUDE.md` §6. Mise à jour : 2026-10-14 (V2.4.128).
> Seulement ce qui reste à faire : ce qui est terminé est retiré (voir l'historique Git).

## Où on en est

- ✅ L'app fonctionne et les heures sont bien classées. Toutes tes décisions de paie sont dans l'app.
- ⚠️ **Les montants en dollars de la paie** (avantages CCQ, impôts, cotisations) sont **des estimations**.
  Ils restent « à réviser » tant que les étapes 1 à 4 ci-dessous ne sont pas faites.

📋 Toutes les règles de paie en vigueur, avec leurs options et leurs sources :
**Gestion › Avancé › Règles de paie**.

Qui fait quoi : 👤 **toi** · 🧾 **ton comptable / ta firme de paie** · 💻 **Claude** (du code, sur demande)

À savoir : la paie se compte toujours sur l'**année civile** (janvier à décembre), même si l'année financière de
Messier commence le 1er novembre. Messier a démarré en **avril 2026** : pour 2026, tout part de la première paie
d'avril.

---

## Étape 1 — Infos de l'employeur 👤

À inscrire dans **Configuration › Paramètres › Paie — employeur**.

- [ ] **Masse salariale 2026 de Messier.** La cotisation FDRCMO (1 %) ne s'applique qu'au-delà de 2 M$.
  Comme Messier a démarré en avril, 2026 ne compte qu'avril à décembre. D'après le relevé du 3e trimestre
  (« Masse salariale RBQ », dans ton Drive), on serait **proche du seuil, probablement un peu en dessous**.
  *À faire :* demander au comptable comment se compte une première année incomplète, puis inscrire le montant.
- [ ] **CNESST : quel salaire est cotisé.** Le relevé du 3e trimestre montre que la CNESST (3,17 $ par 100 $)
  ne porte que sur un « salaire admissible » ; le reste (« excédent ») n'est pas cotisé. L'app, elle, cotise
  sur tout le salaire, donc le coût CNESST affiché est trop élevé. Il manque la règle exacte qui fixe cet
  excédent. *Où la trouver :* ton comptable, ou donner à Claude quelques talons d'une même semaine (voir étape 5).

## Étape 2 — Infos de chaque employé 👤

- [ ] **Formulaires TD1 (fédéral) et TP-1015.3 (Québec)** remplis et signés par chaque employé. Ils
  donnent les crédits d'impôt personnels. *Où l'inscrire :* **Configuration › Paramètres › Paie — TD1 /
  TP-1015.3 des employés**. Inscris seulement les montants, jamais le NAS ni une copie du formulaire.
  Tant qu'un employé n'a rien, l'app prend le montant personnel de base.
- [ ] **Cumul de l'année avant Sparklog** (salaire, RRQ, AE, RQAP, impôts déjà retenus). Sans lui, l'app
  croit que l'année commence à zéro et ne sait pas quand arrêter les retenues à leur maximum annuel
  (RRQ à 74 600 $ puis 85 000 $ de salaire, AE à 68 900 $, RQAP à 103 000 $).
  **Décidé :** importer le **talon de la semaine 42** (4 au 10 octobre) de chaque employé. Il a une colonne
  « Cumulatif » avec tout le cumul de l'année. *Où :* **Gestion › Paie › Talons › « Importer d'anciens
  talons »** → choisir l'employé → le PDF → vérifier l'aperçu → enregistrer. Faire aussi le tien (ton
  historique s'arrête au 3 octobre).
  Ensuite, Sparklog prend le relais à la **semaine 43** dans **Paie de la semaine** : **comptabiliser chaque
  semaine** pour que le cumul suive. Si l'ancien système paie aussi la semaine 43, importer aussi ces talons-là
  et commencer à la semaine 44.
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
- Déjà dans ton Drive : tes talons des semaines 34 à 42 et le relevé du 3e trimestre de tous les employés
  (impôts, RRQ, AE, RQAP, FSS, CNESST, CCQ…), utiles pour comparer.

Aujourd'hui, un seul talon a été vérifié (un compagnon).

## Étape 4 — Faire approuver 🧾

- [ ] Un **spécialiste de la paie ou de la CCQ, nommé** (comptable ou firme de paie), relit les règles et
  les résultats et donne son accord par écrit.
- [ ] Ensuite seulement, Claude fait passer le moteur de paie de « brouillon » à « validé ». Les
  montants ne sont plus marqués « à réviser ».

## Étape 5 — Améliorations techniques, sans document 💻

Claude peut les faire quand tu veux. Ça ne bloque pas la paie.

- [ ] **Changement d'heure de l'automne** : permettre au gestionnaire de choisir quelle « 2 h du matin »
  a été travaillée. Aujourd'hui, l'heure répétée est refusée.
- [ ] **CNESST sur le salaire admissible (trou du calcul)** : l'app calcule la CNESST (3,17 %) sur tout le
  salaire, alors que le vrai relevé ne la calcule que sur un « salaire admissible ». Le coût CNESST est donc
  **trop élevé** dans DAS, Calcul et Coûts. À corriger dès que la règle de l'excédent est connue (étape 1).
- [ ] **Import des talons en lot** (au besoin) : déposer tous les PDF de la semaine d'un coup, l'app reconnaît
  l'employé par le nom inscrit sur le talon (au lieu de 30 imports un par un).
- [ ] **Ménage du code** : découper les deux plus gros écrans (la fiche employé et la liste des employés)
  et corriger environ 60 avertissements du vérificateur de code. Il faudra d'abord ajouter des tests
  d'écran.

## Étape 6 — Gestion V3 : ce qu'il reste à convertir 💻

La V3 (bouton **V2 | V3** en haut à droite de la Gestion) a déjà **À traiter**, **Paie de la semaine** et le
nouveau menu. Les autres pages s'ouvrent encore dans leur version actuelle. À faire, dans cet ordre :

- [ ] **Fiche employé unique** : une liste avec recherche, et une fiche à onglets (Identité, CCQ, Paie et options,
  Impôts TD1, Congés, Accès). Elle remplace Employés + Règles de temps + la partie TD1 de Paramètres.
- [ ] **DAS de Téléchargements** : il calcule avec la méthode « Référence » alors que Paie › DAS utilise « Messier »
  (deux totaux différents pour le même mois). Les aligner.
- [ ] **Débloquer** : un seul endroit et des mots clairs — « rouvrir une journée » ou « retourner une job pour
  correction » (aujourd'hui : 3 boutons qui se ressemblent).
- [ ] **Reçus et preuves** : n'afficher par défaut que ce qui reste à traiter ; recherche par employé et par date.
- [ ] **Coûts** et **Semaine / mois** : utiliser le même calcul que la paie (aujourd'hui, une formule à part).
- [ ] **Rapport CCQ** : proposer par défaut le mois qui vient de finir.
- [ ] **Petits plus** : recherche dans les listes (Employés, Messages), « tout marquer comme lu » sur la cloche,
  « jours sans saisie » visible dans Temps plutôt que dans Avancé.
- [ ] **Fin** : quand tout est converti et testé, faire de la V3 la version par défaut, puis retirer la V2.

## À surveiller 👤

- [ ] **Remplissage automatique (capture Field Service)** : si un employé reste bloqué (« Enregistrement
  bloqué »), il touche **(Détails) › Voir le texte lu sur la capture › Copier le texte** et te l'envoie ;
  donne ce texte à Claude pour corriger la lecture. Bonne pratique : capture de l'onglet **Bilan** avec
  « Heure de début » visible en haut et les deux distances (miles et km) en bas.
- [ ] **Cotisation annuelle AECQ 2027** : 245 $ (avant : 240 $), plus taxes. Ajoutée automatiquement au rapport
  mensuel CCQ d'**octobre 2026**. Rien à faire dans l'app.
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
