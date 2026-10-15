# NOOB.md — Ce qu'il reste à faire, en clair

> Version simple de la liste détaillée dans `CLAUDE.md` §6. Mise à jour : 2026-10-15 (V2.4.130).
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
  Bonne nouvelle lue dans la loi (D-8.3, art. 12, dans ton Drive) : les cotisations que Messier verse déjà au
  **fonds de formation de la CCQ** (0,20 $ par heure) **comptent comme dépenses de formation**. Même au-dessus de
  2 M$, on ne paie que la différence entre 1 % de la masse et ces dépenses (Sommaire 1, lignes 71 à 75).
- [ ] **CNESST : quel salaire est cotisé.** Le relevé du 3e trimestre montre que la CNESST (3,17 $ par 100 $)
  ne porte que sur un « salaire admissible » ; le reste (« excédent ») n'est pas cotisé. L'app, elle, cotise
  sur tout le salaire, donc le coût CNESST affiché est trop élevé. Il manque la règle exacte qui fixe cet
  excédent. Indice : la grille ACQ dit que le maximum assurable CNESST est de **103 000 $ par année** par
  employé (peut-être appliqué par paie : 1 980,77 $ par semaine, à vérifier). *Où la trouver :* ton comptable, ou donner à Claude quelques talons d'une même semaine (voir étape 5).

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
  talons » › « Plusieurs talons d'un coup »** → choisir tous les PDF → vérifier l'employé reconnu sur chaque
  ligne → « Enregistrer les N talons prêts ». Inclure le tien (ton historique s'arrête au 3 octobre).
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
- [ ] **Ménage du code** : découper les deux plus gros écrans (la fiche employé et la liste des employés)
  et corriger environ 60 avertissements du vérificateur de code. Il faudra d'abord ajouter des tests
  d'écran.

## Étape 6 — Gestion V3 : ce qu'il reste à convertir 💻

La V3 (bouton **V2 | V3** en haut à droite de la Gestion) suit la routine réelle : les **feuilles de temps aux 1 ou
2 jours**, la **paie le lundi**, le **coût employeur** d'un coup d'œil. Pendant les tests, la paie, les DAS et la CCQ
restent faits dans **Dynacom** : Sparklog sert aux feuilles de temps et donne les heures à entrer dans Dynacom.
Objectif : opérationnel pour **~50 employés** d'ici la fin octobre.

Fait (V2.4.131–132) :
- [x] **5 entrées au lieu de ~25**, chacune une page à onglets :
  - **Feuilles de temps** : À approuver · Toutes les fiches · En direct · Reçus et preuves (historique) · Rouvrir une journée
  - **Paie et coûts** : Semaine · Mois · Talons · Calcul d'un employé · Relevé d'emploi
  - **Équipe** : Employés · Options de paie par employé · Absences · Inventaire
  - **Messages**
  - **Réglages** : Paramètres · Formulaires · Références · Taux CCQ · Règles de paie · Journal · Santé · Urgence
- [x] **Une seule place pour chaque chiffre.** Heures, brut, coût employeur et DAS viennent tous du calcul de la paie,
  dans **Paie et coûts › Semaine** et **› Mois** (le mois = la somme des semaines, calculées pareil). Les anciennes
  pages qui refaisaient ces chiffres avec leur propre formule (**Coûts**, **Semaine / mois**, **Téléchargements**,
  **DAS**) ne sont plus dans la V3 : leurs liens ouvrent Semaine ou Mois. Le **rapport mensuel CCQ** et les **DAS par
  date de paie** sont dans l'onglet Mois, qui s'ouvre sur le mois qui vient de finir. La V2 garde tout, inchangé.
- [x] **Coûts même sans comptabiliser** : tant que la paie se fait dans Dynacom, les semaines ne sont pas
  comptabilisées dans Sparklog ; le coût, les heures et les DAS comptent quand même tout le travail approuvé.
- [x] **À traiter pour 50 employés** : recherche par nom (sans accents), journées les plus **anciennes d'abord**,
  jusqu'à 400 jobs soumises d'un coup (avant : 200, les plus récentes). Une journée coupée par cette limite n'est
  jamais approuvée à moitié. « Tout approuver » ne touche que ce que la recherche affiche.
- [x] **Heures pour Dynacom** : bouton **« Heures pour le logiciel de paie (CSV) »** dans Semaine et Mois (heures
  régulières / 1,5× / 2× / retour, km, souper, stationnement, brut, coût employeur par employé).
- [x] **Mots clairs** : « Rouvrir la journée » (laisser un employé saisir un jour fermé) et « Retourner pour
  correction » (renvoyer une job soumise) remplacent Débloquer / Déverrouiller partout.

À faire, dans cet ordre (le plus utile pour les 2 prochaines semaines d'abord) :
- [ ] **Faire de la V3 la version par défaut** pour les gestionnaires, une fois testée quelques jours sur les vraies
  feuilles de temps (la V2 reste accessible par le bouton).
- [ ] **Petits plus du quotidien** : « tout marquer comme lu » sur la cloche, « jours sans saisie » (plusieurs jours,
  pas seulement la veille) dans À traiter plutôt que dans Avancé, recherche dans Employés et Messages.
- [ ] **Fiche employé unique** : une liste avec recherche, et une fiche à onglets (Identité, CCQ, Paie et options,
  Impôts TD1, Congés, Accès). Elle remplace Employés + Règles de temps + la partie TD1 de Paramètres.
- [ ] **Reçus et preuves** : l'historique seulement (ce qui reste à traiter est déjà dans À traiter) ; recherche
  par employé et par date.
- [ ] **Fusionner « À approuver » et « Toutes les fiches »** en un seul écran (filtre « à approuver » par défaut),
  avec la **fiche employé unique** ci-dessus, il resterait alors 3 onglets dans Feuilles de temps et Équipe.
- Quand Sparklog remplacera Dynacom :
  - [x] ~~DAS de Téléchargements en « Référence »~~ : en V3, les DAS du mois sont dans Paie et coûts › Mois et
    suivent la méthode choisie en haut de la page (Messier par défaut).
  - [x] **Rapport CCQ** : s'ouvre sur le mois qui vient de finir.
- [ ] **Fin** : quand tout est converti et testé, retirer la V2.

## À surveiller 👤

- [ ] **Remplissage automatique (capture Field Service)** : si un employé reste bloqué (« Enregistrement
  bloqué »), il touche **(Détails) › Voir le texte lu sur la capture › Copier le texte** et te l'envoie ;
  donne ce texte à Claude pour corriger la lecture. Bonne pratique : capture de l'onglet **Bilan** avec
  « Heure de début » visible en haut et les deux distances (miles et km) en bas.
- [ ] **Cotisation annuelle AECQ 2027** : 245 $ (avant : 240 $), plus taxes. Ajoutée automatiquement au rapport
  mensuel CCQ d'**octobre 2026**. Rien à faire dans l'app.
- [ ] **Assurance MÉDIC** : part salariale **0,68 $/h** et part patronale **2,93 $/h**, maintenues jusqu'au
  **24 avril 2027** (décision du CASIC). À partir du **25 avril 2027**, la convention prévoit **1,06 $** (salariale)
  et **3,31 $** (patronale). Confirmer auprès de la CCQ avant cette date que le gel n'est pas prolongé.
  La taxe provinciale de 9 % s'ajoute aux deux parts. L'app passe **toute seule** à 1,06 $ dès la semaine du
  25 avril 2027 ; si le gel est prolongé, le dire à Claude. À cette date, toute la grille de salaires CCQ change
  aussi : fournir la nouvelle grille ACQ.

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
