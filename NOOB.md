# NOOB.md — Ce qu'il reste à faire, en clair

> Version simple de la liste détaillée dans `CLAUDE.md` §6. Mise à jour : 2026-10-16 (V2.4.138).
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
  **Réponse du guide du Sommaire 1 (RLZ-1.S.G, dans ton Drive) :** pas de règle spéciale pour une première année
  incomplète. On prend le **vrai total d'avril à décembre**, sans le ramener sur 12 mois. Ce total est celui de la
  **case A des relevés 1** (salaire brut imposable, avec le 13 % et les avantages imposables), pas juste heures × taux.
  Sous 2 M$ en 2026 : aucune cotisation FDRCMO pour 2026 (inscrire « 0 » à la ligne 75). Si 2027 dépasse 2 M$, les
  dépenses de formation de 2026 peuvent être reportées sur 2027 (ligne 79.1).
  *À faire :* inscrire ce total prévu dans **Paramètres › Paie** (il sert aussi au taux du FSS : environ 2 % à 2 M$,
  1,65 % sous 1 M$). Demander au comptable seulement si Messier est **associé à d'autres entreprises** au
  31 décembre : leurs masses s'additionnent alors pour le taux du FSS (pas pour le FDRCMO).
  Bonne nouvelle lue dans la loi (D-8.3, art. 12, dans ton Drive) : les cotisations que Messier verse déjà au
  **fonds de formation de la CCQ** (0,20 $ par heure) **comptent comme dépenses de formation**. Même au-dessus de
  2 M$, on ne paie que la différence entre 1 % de la masse et ces dépenses (Sommaire 1, lignes 71 à 75).
- [ ] **CNESST : quel salaire est cotisé.** Le relevé du 3e trimestre montre que la CNESST (3,17 $ par 100 $)
  ne porte que sur un « salaire admissible » ; le reste (« excédent ») n'est pas cotisé. L'app, elle, cotise
  sur tout le salaire, donc le coût CNESST affiché est trop élevé. Il manque la règle exacte qui fixe cet
  excédent. Indice : la grille ACQ dit que le maximum assurable CNESST est de **103 000 $ par année** par
  employé (peut-être appliqué par paie : 1 980,77 $ par semaine, à vérifier). *Où la trouver :* ton comptable, ou donner à Claude quelques talons d'une même semaine (voir étape 5).
  Demander aussi au comptable si la **paie de Karine** (propriétaire, plus de 40 % des actions) est cotisable à la
  CNESST : aujourd'hui l'app la cotise comme les autres.

## Étape 2 — Infos de chaque employé 👤

- [ ] **Formulaires TD1 (fédéral) et TP-1015.3 (Québec)** remplis et signés par chaque employé. Ils
  donnent les crédits d'impôt personnels. *Où l'inscrire :* **Configuration › Paramètres › Paie — TD1 /
  TP-1015.3 des employés**. Inscris seulement les montants, jamais le NAS ni une copie du formulaire.
  Tant qu'un employé n'a rien, l'app prend le montant personnel de base.
- [x] **Cumul de l'année avant Sparklog** — ✅ **fait pour tous** (2026-10-16), à partir du « Cumulatif des
  employés » de Dynacom (29 mars → semaine 42) : une ligne par employé au 10 octobre dans le registre de paie,
  avec salaire, RRQ, AE, RQAP, impôts, CCQ, etc. 35 employés, totaux identiques au PDF au centime près. Les
  5 anciens employés qui n'avaient pas de compte ont maintenant un profil **inactif** (sans connexion possible)
  pour garder leurs cumuls. Sparklog prend le relais à la **semaine 43** dans **Paie de la semaine** :
  **comptabiliser chaque semaine** pour que le cumul suive.
  - Karine : paie fixe 40 h × 51 $ par semaine depuis le 4 octobre, **exclue de l'AE** (si tu veux son coût
    d'avril à septembre dans les rapports, change « Paie fixe depuis le » pour le 2026-04-05).
  - **Exclu du RRQ** (nouvelle case, Configuration › Paramètres › Paie) : cochée pour l'employé à qui Dynacom ne
    retient aucun RRQ. À cocher aussi pour tout autre employé qui a cessé de cotiser (garder la preuve au dossier).
  - Si Dynacom met à jour les cumuls (par exemple le RRQ d'avant avril, comme pour un employé cette semaine),
    me redonner le nouveau « Cumulatif des employés » : je remplace les lignes du 10 octobre.
  - Heures cumulées : pour 4 chefs d'équipe, Dynacom compte aussi les lignes de prime comme des heures. Ça ne
    touche que la ligne « Heures » des talons et le relevé d'emploi, pas les montants. Pour les corriger, importer
    leur talon de la semaine 42 (l'import corrige les heures).
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

La V3 (bouton **V2 | V3** en haut à droite de la Gestion) a déjà **À traiter**, **Paie de la semaine** et le
nouveau menu. **La V2 ne change pas** : tant que la V3 n'est pas la version par défaut, chaque changement de menu
se fait seulement dans la V3 (un test fige le menu, les chemins et les pages de la V2).

Fait (V2.4.132 à V2.4.135) — menu V3 simplifié, de 26 à 13 entrées :
- [x] **Pages à onglets** : À traiter (À approuver · Justificatifs), Feuilles de temps (Feuilles de temps ·
  Débloquer une journée), Historique paie (Talons · DAS · Relevé d'emploi · Calcul détaillé), Employés (Employés ·
  Absences), Rapports (Coûts · Semaine · Mois · Par employé · Export CCQ), Configuration (Paramètres · Règles de
  temps · Taux CCQ · Règles de paie · Formulaires · Références). Chaque onglet garde les droits de la page d'avant
  (un admin de bureau voit seulement les onglets permis).
- [x] Seuls **Aujourd'hui** et **Paie** sont ouverts au départ ; sélecteur Messier/Référence compact avec un « i ».
- [x] Passer de V2 à V3 (et l'inverse) garde la page ; les liens de la cloche marchent dans les deux versions.
- [x] **Rapports › Export CCQ** remplace Téléchargements en V3 : plus de DAS en double (la DAS est seulement dans
  Historique paie › DAS, avec la méthode choisie en haut de la page).
- [x] **Menu de gauche repliable** (V2 et V3, ordinateur) : petit bouton en haut à gauche de l'en-tête.
- [x] **Feuilles de temps (V3)** : le nom de l'employé est en premier sur chaque carte (avec n° d'OT et date
  dessous), et le bouton **« ★ Entrées à la main »** n'affiche que les fiches entrées sans la capture Field Service.

À faire, dans cet ordre :

- [ ] **Fiche employé unique** : une liste avec recherche, et une fiche à onglets (Identité, CCQ, Paie et options,
  Impôts TD1, Congés, Accès). Elle remplace Employés + Règles de temps + la partie TD1 de Paramètres.
- [ ] **DAS de Téléchargements (V2 seulement)** : il calcule avec la méthode « Référence » alors que Paie › DAS
  utilise « Messier ». Réglé en V3 (pas de DAS dans l'export) ; disparaîtra avec la V2.
- [ ] **Débloquer** : des mots clairs — « rouvrir une journée » ou « retourner une job pour correction ». En V3, le
  déblocage d'un jour précis est déjà un seul onglet (Feuilles de temps › Débloquer une journée), mais le bouton
  « Déverrouiller » des cartes garde son ancien nom.
- [ ] **Reçus et preuves** (onglet Justificatifs de À traiter en V3) : n'afficher par défaut que ce qui reste à
  traiter ; recherche par employé et par date.
- [ ] **Coûts** et **Semaine / mois** : utiliser le même calcul que la paie (aujourd'hui, une formule à part).
- [ ] **Rapport CCQ** : proposer par défaut le mois qui vient de finir.
- [ ] **Petits plus** : recherche dans les listes (Employés, Messages), « tout marquer comme lu » sur la cloche,
  « jours sans saisie » visible dans Temps plutôt que dans Avancé, une seule cloche en V3, un compteur sur
  « À traiter » (demande une petite requête de plus : à décider).
- [ ] **Fin** : quand tout est converti et testé, faire de la V3 la version par défaut, puis retirer la V2.

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
