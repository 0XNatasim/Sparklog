# NOOB.md — Ce qu'il reste à faire, en clair

> Version simple de la liste détaillée dans `CLAUDE.md` §6. Mise à jour : 2026-10-25 (V2.4.181).
> `README.md`, `NOOB.md` et `CLAUDE.md` sont mis à jour **ensemble à chaque version** (un test le vérifie).
> Seulement ce qui reste à faire : ce qui est terminé est retiré (voir l'historique Git).

## Où on en est

- 🔴 **À faire en premier : la paie de la semaine 43** (11 au 17 octobre), la **première payée par Sparklog**. Au
  2026-10-23, presque toutes les fiches de la semaine sont **soumises mais pas approuvées**, et rien n'est encore
  comptabilisé. Dans l'ordre : **À traiter** (approuver) › **Paie › Paie de la semaine** (semaine 43, « Calculer et
  comptabiliser ») › imprimer les talons. Puis la semaine 44 de la même façon.
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
  *Comment l'estimer :* le cumul brut de Dynacom jusqu'au 10 octobre (déjà dans l'app, demander le total à Claude)
  + la moyenne par semaine × les semaines qui restent jusqu'au 31 décembre (sans les vacances de la construction),
  plus les nouveaux employés. L'année **civile** compte, même si l'année financière de Messier commence le
  1er novembre. Le comptable confirme le vrai total en décembre (case A des relevés 1).
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
  donnent les crédits d'impôt personnels et servent à calculer l'**impôt retenu sur chaque paie**. *Où l'inscrire :*
  **Configuration › Paramètres › Paie — TD1 / TP-1015.3 des employés**. Inscris seulement les montants, jamais le NAS
  ni une copie du formulaire. Tant qu'un employé n'a rien, l'app prend le montant personnel de base (bon pour la
  plupart). **Au 2026-10-23 : aucun saisi (0 sur 36).** Le plus simple : demander à Dynacom les montants qu'ils
  utilisaient, et n'inscrire que ceux qui diffèrent du montant de base.
- [ ] **NAS** : un seul est saisi et son **chiffre de contrôle est invalide** (Claude peut dire sur quelle fiche) (un chiffre mal
  tapé ou deux inversés : le 9e chiffre est calculé à partir des 8 autres). Le revérifier sur la carte et le
  ressaisir (Employés › fiche › NAS, propriétaire seulement). Les autres sont à saisir pour le rapport mensuel CCQ.
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

- [x] **Changement d'heure de l'automne** (V2.4.177, **dimanche 1er novembre 2026**) : la nuit où on recule l'heure, de
  1 h à 1 h 59 arrive deux fois. Si un employé a commencé ou fini sa journée dans cette heure-là, l'app ne peut pas
  savoir laquelle des deux : elle lui dit d'envoyer ses heures au gestionnaire. **Quoi faire :** Karine (ou toi) ouvre
  Gestion › Admin › **Feuille de temps d'urgence**, entre la fiche, puis répond à la question « 1re fois (avant de
  reculer) » ou « 2e fois (après avoir reculé) » en demandant à l'employé. L'employé la confirme ensuite comme d'habitude.
  Très rare : aucune fiche de nuit ni de fin de semaine jusqu'ici. **À savoir :** la paie compte l'heure affichée sur la
  montre, pas le temps réel ; cette nuit-là, quelqu'un qui travaille pendant l'heure répétée serait payé 1 h de moins.
  On corrigera seulement si ça arrive et avec l'accord du comptable.
- [ ] **CNESST sur le salaire admissible (trou du calcul)** : l'app calcule la CNESST (3,17 %) sur tout le
  salaire, alors que le vrai relevé ne la calcule que sur un « salaire admissible ». Le coût CNESST est donc
  **trop élevé** dans DAS, Calcul et Coûts. À corriger dès que la règle de l'excédent est connue (étape 1).
- [x] **Ménage du code** (V2.4.178) : rien ne change à l'écran. La fiche de temps et la liste des employés sont
  découpées en petits fichiers, après avoir écrit des tests d'écran qui passent sur l'ancienne et la nouvelle
  version. Les 64 avertissements du vérificateur de code sont corrigés (il n'en reste aucun, et il en refuse
  maintenant un nouveau). Deux petits défauts trouvés au passage : dans DAS, changer la méthode (Messier /
  Référence) ne recalculait pas les montants ; la carte État du service relançait sans fin un chargement raté.

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
- [x] **Notes** (V2.4.169, sous « Aujourd'hui ») : chaque note est **Privée** (toi seul la vois, cadenas gris) ou
  **Partagée** avec les gestionnaires (bord bleu, « Partagée par … » : tous la voient, peuvent la modifier ou la marquer
  faite ; seul l'auteur la supprime). Un rappel partagé apparaît chez tous les gestionnaires. Coche « Me le rappeler » pour choisir une date (et une heure, 8 h par défaut) : à ce moment-là, un
  compteur rouge apparaît sur **Notes** dans le menu, et la carte passe en rouge en haut de la liste. « Fait » la range
  dans « Faites », « Plus tard » la repousse (1 heure, demain 8 h, une semaine). Le rappel s'affiche dans l'app
  seulement : pas de notification sur le téléphone. V3 seulement (la V2 ne change plus).

À faire, dans cet ordre :

- [x] **Fiche employé unique** (V2.4.180, Équipe › Employés) : une case de recherche (nom, courriel, téléphone,
  numéro d'employé ou CCQ, sans se soucier des accents) et un bouton « Chefs d'équipe ». Chaque fiche ouverte a des
  onglets : **Identité**, **CCQ**, **Paie et options** (ce qui était dans Règles de temps : premier trajet, retour,
  1re heure sup., km, cellulaire, entreposage, primes de chef d'équipe, plus stationnement et inventaire), **Impôts
  (TD1)** (TD1, TP-1015.3, paie fixe, exclusions AE / RRQ : gestionnaires et propriétaire seulement), **Congés** et
  **Accès** (rôle, actif / en pause, accès à la Gestion, double authentification, notifications, « Voir comme »,
  supprimer). En V3, Configuration n'a plus l'onglet Règles de temps, et Paramètres n'a plus les formulaires TD1 : tout
  est dans la fiche. Rien ne change dans la V2.
- [ ] **DAS de Téléchargements (V2 seulement)** : il calcule avec la méthode « Référence » alors que Paie › DAS
  utilise « Messier ». Réglé en V3 (pas de DAS dans l'export) ; disparaîtra avec la V2.
- [x] **Débloquer** (V2.4.179) : des mots clairs en V3. L'onglet s'appelle **« Rouvrir une journée »** (bouton
  « Rouvrir la journée », liste « Journées rouvertes », « Refermer ») et le bouton des cartes de Feuilles de temps dit
  **« Retourner pour correction »** (l'employé la corrige et la soumet de nouveau). La V2 garde ses anciens mots.
- [x] **Reçus et preuves** (V2.4.179, onglet Justificatifs de À traiter) : par défaut, seulement ce qui reste à
  traiter (souper ou stationnement en attente, preuve de temps sup. d'une job pas encore approuvée), avec le nombre.
  Décocher « À traiter seulement » montre tout. Choix d'un employé et d'une journée. Un lien de la cloche ouvre
  toujours sa job.
- [x] **Coûts** et **Semaine / mois** (V2.4.181, V2 et V3) : ils additionnent maintenant, semaine par semaine, les mêmes
  chiffres que les talons et le sommaire imprimé (heures, salaire, 13 %, charges de l'employeur calculées par la paie :
  RRQ, AE, RQAP, FSS, CNT, CNESST, FDRCMO et avantages sociaux CCQ, avec le TD1 et le cumul de chacun). Avant, une
  formule à part (un taux par heure pour chaque charge) donnait d'autres montants. Bureau, propriétaire et
  sous-traitants : leurs heures à leur taux, sans charges, comme avant. Les fiches retournées pour correction comptent
  aussi ; les brouillons jamais. Les montants restent une estimation tant que les règles de paie ne sont pas validées.
- [x] **Rapport CCQ** (V2.4.179, Rapports › Export CCQ) : s'ouvre sur le mois qui vient de finir (le mois CCQ finit
  le dernier samedi : le 25 octobre, c'est septembre ; dès le 1er novembre, octobre) et affiche ses semaines.
- [ ] **Petits plus** : recherche dans les listes (Employés, Messages), « tout marquer comme lu » sur la cloche,
  « jours sans saisie » visible dans Temps plutôt que dans Avancé, une seule cloche en V3, un compteur sur
  « À traiter » (demande une petite requête de plus : à décider).
- [ ] **Fin** : quand tout est converti et testé, faire de la V3 la version par défaut, puis retirer la V2.

## Étape 7 — Temps de trajet, km et frais : une option par employé 👤 💻

Décision du 2026-10-18 : **chaque ligne ci-dessous devient une option dans la fiche de l'employé** (⚙️), y compris
« Chargé à Britton ». Rien n'est codé pour l'instant. La colonne **Défaut** = ce que l'app fait aujourd'hui, et donc
ce que l'option vaudra au départ pour tout le monde (rien ne change tant que tu ne modifies pas une fiche).

- **Payé CCQ** : heures avec les avantages (13 %, avantages sociaux), comptées dans le 8 h / 40 h.
- **Payé non-CCQ** : taux de base, sans avantages, jamais du temps sup.
- **Chargé à Britton** : refacturé au client (oui / non), séparément de ce qui est payé à l'employé.
- **Existe ?** : ✅ l'option ou le calcul existe déjà · ½ en partie · ❌ à créer.

### Temps

| Trajet | Payé CCQ | Payé non-CCQ | Pas payé | Chargé à Britton | Défaut (aujourd'hui) | Existe ? | Convention ICI |
|---|---|---|---|---|---|---|---|
| Maison → entrepôt (début de journée) | ⚙️ | ⚙️ | ⚙️ | ⚙️ | Pas payé (pas entré) | ❌ | 23.04 1) : pas payé ; payé non-CCQ si tu exiges la présence avant la journée (23.04 2) a)) |
| Maison → 1er client | ⚙️ | ⚙️ | ⚙️ | ⚙️ | Payé CCQ | ½ (« 1er trajet non payé » ; manque non-CCQ) | 23.04 1) : pas payé |
| Entrepôt → client | ⚙️ | ⚙️ | ⚙️ | ⚙️ | Payé CCQ (dans Départ → Fin) | ❌ (règle fixe) | 23.01 2) : à la charge de l'employeur |
| Client → client | ⚙️ | ⚙️ | ⚙️ | ⚙️ | Payé CCQ | ❌ (règle fixe) | 23.01 2) |
| Arrêt chez un fournisseur | ✅ | | | ⚙️ | Payé CCQ : inclus dans le temps de la job (capture Field Service, sinon OT manuel) | ✅ (pas d'option) | 23.01 2) |
| Retour client → entrepôt | ⚙️ | ⚙️ | ⚙️ | ⚙️ | CCQ jusqu'à 40 h / semaine (32 h avec un férié), non-CCQ au-delà, jamais du temps sup. | ½ (« retour avec avantages ») | 23.04 2) a), 23.15 : non-CCQ |
| Retour client → maison | ⚙️ | ⚙️ | ⚙️ | ⚙️ | Pas payé (pas entré). Option : payé à partir de 65 km ; le choix CCQ / non-CCQ n'apparaît que si la case est cochée | ❌ | 23.04 1) : pas payé |
| Entrepôt → maison (fin de journée) | ⚙️ | ⚙️ | ⚙️ | ⚙️ | Pas payé (pas entré) | ❌ | 23.04 1) : pas payé |
| Temps à l'entrepôt sans trajet (charger, matériel, inventaire) | ✅ | | | ⚙️ | Payé CCQ : inclus dans le temps de la job (capture Field Service, sinon OT manuel) | ✅ (pas d'option) | Du travail |
| Attente sur place (client absent, accès refusé) | ✅ | | | ⚙️ | Payé CCQ : inclus dans le temps de la job (capture Field Service, sinon OT manuel) | ✅ (pas d'option) | Du travail |
| Samedi / dimanche / férié | ⚙️ | ⚙️ | ⚙️ | ⚙️ | Travail tout en temps sup. ; retour non-CCQ — garder coché pour tous les employés CCQ | ❌ (règle fixe) | 21.01, 21.02 b) : temps sup. obligatoire |

### Kilomètres (jamais du CCQ : indemnité à part sur le talon)

| Trajet | Remboursé | Pas remboursé | Chargé à Britton | Défaut (aujourd'hui) | Existe ? | Convention ICI |
|---|---|---|---|---|---|---|
| km maison → entrepôt | ⚙️ | ⚙️ | ⚙️ | Pas remboursé (pas entré) | ❌ | Trajet domicile : rien |
| km maison → 1er client | ⚙️ | ⚙️ | ⚙️ | Remboursé (même avec « 1er trajet non payé ») | ❌ | 23.05 : 0,49 $/km si l'auto sert à ta demande |
| km entrepôt → client | ⚙️ | ⚙️ | ⚙️ | Remboursé (km du bon de travail × taux km) | ❌ (toujours payé) | 23.05 : 0,49 $/km |
| km client → client | ⚙️ | ⚙️ | ⚙️ | Remboursé | ❌ (toujours payé) | 23.05 |
| km chez un fournisseur | ✅ (inclus dans les km de la job) | | ⚙️ | Remboursé (comme client → client) | ✅ (pas d'option) | 23.05 |
| km client → entrepôt | ⚙️ | ⚙️ | ⚙️ | Remboursé (« km du retour ») | ❌ (toujours payé) | 23.05 |
| km client → maison | ⚙️ | ⚙️ | ⚙️ | Pas remboursé (pas entré) | ❌ | Trajet domicile : rien |
| km entrepôt → maison | ⚙️ | ⚙️ | ⚙️ | Pas remboursé (pas entré) | ❌ | Trajet domicile : rien |

### Montants à part (payés séparément du salaire, 23.11)

| Élément | Payé CCQ | Payé non-CCQ / remboursé | Pas payé | Chargé à Britton | Défaut (aujourd'hui) | Existe ? | Convention ICI |
|---|---|---|---|---|---|---|---|
| Domicile à plus de 65 km du chantier | ⚙️ dans le 40 h de la semaine | ⚙️ au-delà du 40 h | ⚙️ | ⚙️ | Pas payé | ❌ | 23.09 1) : 50,01 $ / jour (plus de 90 km : 56,58 $), depuis le 2026-04-26 |
| Traversier (et péage ?) | — | ⚙️ | ⚙️ | ⚙️ | Pas payé | ❌ | 23.09 1) a) : traversier remboursé |
| Stationnement | — | ⚙️ jusqu'à 20 $ / jour, avec reçus | ⚙️ | ⚙️ | Remboursé (case « reçus de stationnement ») | ½ (manque Britton) | 23.02 |
| Souper | — | ⚙️ 30 $ dès 10 h 15 de travail | ⚙️ | ⚙️ | Payé à tous, toujours actif — garder coché pour tous les employés CCQ | ½ (pour tous, pas d'option) | 20.07 3) c) |

### Décisions (2026-10-18) 👤
- [x] **Km et temps pas entrés aujourd'hui** (maison → entrepôt, client → maison, entrepôt → maison) : **un champ de
  plus dans la fiche de temps**.
- [x] **Retour client → maison** : payé **à partir de 65 km** ; dans la fiche employé, le choix CCQ / non-CCQ n'apparaît
  que si la case « retour maison payé » est cochée.
- [x] **Domicile à plus de 65 km** : de 2 à 6 chantiers par jour, donc c'est du **temps de trajet** : payé CCQ tant
  qu'il entre dans le 40 h de la semaine, non-CCQ au-delà (même principe que le retour à l'entrepôt).
- [x] **Taux km** : un seul taux par employé pour tous les trajets. **Taux facturé à Britton : inconnu pour l'instant.**
- [x] **Fournisseur, attente, temps à l'entrepôt** : pas d'option ; inclus dans le temps de la job (capture Field
  Service, sinon OT manuel), payé CCQ.
- [x] **Samedi / dimanche / férié et souper** : options gardées, mais cochées pour tous les employés CCQ (la convention
  les impose).
- [ ] **Taux et rapport « Chargé à Britton »** : à préciser quand le taux client sera connu.

### À coder ensuite 💻 (sur demande)
1. [x] **Fait (V2.4.155)** : **Gestion V3 › Admin › Trajets et frais** — toute la grille au même endroit. Chaque ligne a
   « Pour tous » (applique le choix aux employés actifs CCQ) et « Choisir… » (demande lesquels), avec « Chargé à
   Britton ? » (oui / non / pas décidé), le seuil en km du retour maison et une date « en vigueur à partir du ». « Voir
   par employé » montre le réglage de chacun ; chaque changement va au Journal. **👤 À faire : la propriétaire
   remplit chaque ligne.** La paie ne lit pas encore ces réglages : chaque ligne garde son défaut d'ici là.
2. Un champ de plus dans la fiche de temps pour les trajets maison ↔ entrepôt et client → maison (temps et km).
3. Le moteur de paie et le talon qui lisent ces options ; tests de chaque ligne.
4. Un rapport « Chargé à Britton » par semaine.

## À surveiller 👤

- [ ] **Apps Script (export Google Sheet)** : coller le nouveau code
  (`supabase/functions/push_approved_batch/apps-script-doPost.js`) dans la feuille › **Extensions › Apps Script**, à
  la place de tout le `doPost`, Enregistrer, puis **Déployer › Gérer les déploiements › crayon › Nouvelle version ›
  Déployer**. Garder le **même** déploiement (sinon l'adresse change et l'envoi ne marche plus).
- [ ] **Courriels d'inscription (SMTP)** : si « Confirm email » a été désactivé pour une arrivée en groupe, le
  réactiver. Un **SMTP** est un service d'envoi de courriels (Brevo, Resend, SendGrid, Google Workspace…) : le brancher
  dans Supabase › Authentication › Emails enlève la limite de quelques courriels par heure du service intégré.

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

## Limites de l'app (capacité) 📏

Mesuré le **16 octobre 2026**, avec **29 employés actifs** : ils font **environ 410 jobs par semaine**, soit
3 jobs par jour par employé. À **60 employés**, compte environ **850 jobs par semaine**, **170 par jour** et
**44 000 par année**.

**En bref :** à 60 employés, la base de données, le stockage des images et les comptes ont **beaucoup de
marge**. Les vraies limites sont :

- la liste « À traiter » (600 jobs, plus vieilles d'abord) ;
- la Google Sheet (un fichier par année) ;
- la clé de lecture automatique (OCR) ;
- les deux tâches automatiques (ménage des images, taux CCQ) : réglées le 16 octobre (V2.4.140).

### Base de données et serveur (Supabase, forfait **Pro**, serveur « Small »)

| Quoi | Inclus / limite | Aujourd'hui | À 60 employés |
|---|---|---|---|
| Taille de la base | 8 Go inclus (puis 0,125 $ US/Go) ; recommandé jusqu'à 50 Go sur ce serveur | **21 Mo** | ≈ +100 Mo par année : **aucun souci** |
| Images (preuves, inventaire, stationnement, cartes CCQ) | 100 Go inclus | **26 Mo** (195 fichiers) | ≈ 3,5 Go par année si rien n'est effacé, ≈ 0,5 Go si le ménage automatique roule : **aucun souci** |
| Taille d'une image | 10 Mo max à l'envoi | l'app la réduit à ≈ 80–100 Ko | — |
| Données téléchargées (sortantes) | 250 Go par mois | faible | **aucun souci** |
| Comptes qui se connectent | 100 000 par mois | 37 profils | **aucun souci** |
| Fonctions serveur (OCR, export, notifications) | 2 millions d'appels par mois | quelques milliers | **aucun souci** |
| Connexions en direct (temps réel) | 500 en même temps | < 40 | **aucun souci** |
| Connexions à la base | 90 directes / 400 par le pool | — | **aucun souci** |
| Lecture/écriture du disque | rafales limitées sur un petit serveur | un ralentissement est déjà arrivé, corrigé depuis | **à surveiller** : Gestion › Avancé › État du service |
| Sauvegardes | 1 par jour, gardées **7 jours** (pas de retour à la minute près) | — | une erreur remarquée après 7 jours ne peut plus être annulée par une sauvegarde |

Le forfait Pro coûte environ 25 $ US par mois, plus le serveur Small (environ 15 $ US) moins un crédit de
10 $ US. Au-delà des quotas, Supabase facture l'excédent ; rien n'en approche.

### Écrans de l'app (combien de lignes chaque écran charge)

| Écran | Limite | À 60 employés |
|---|---|---|
| **À traiter** (jobs soumises) | **600 jobs**, les **plus vieilles d'abord** (V2.4.140) ; au-delà, l'écran le dit | 60 employés soumettent ≈ 170 jobs par jour : **3 jours et demi** d'attente tiennent. Au-delà, les plus récentes apparaissent dès que les vieilles sont approuvées. |
| Vérification des anomalies (À traiter) | 800 jobs déjà approuvées comparées | correct |
| Feuilles de temps | 50 par page + « Charger plus » ; tout si on choisit un employé ou une journée | correct |
| Justificatifs (preuves, soupers, stationnement) | 100 derniers de chaque sorte | correct pour 2–3 jours ; plus vieux = choisir un employé |
| Inventaire (une journée) | 500 employés, 600 captures, 3 000 lignes lues | correct (≈ 180 captures et ≈ 1 400 lignes par jour) |
| Historique de l'employé | 100 jobs par page | correct |
| Rapports, Talons, DAS, Coûts, export CCQ | aucune limite : toutes les pages sont lues, 1 000 lignes à la fois | correct, mais **plus lent** sur de longues périodes (DAS sur 14 mois ≈ 50 000 jobs : quelques secondes de plus) |
| Feuille d'urgence | 200 employés | correct |

### Google Sheet (export des jobs approuvées)

| Quoi | Limite | À 60 employés |
|---|---|---|
| Cellules par fichier | **10 millions**, cellules vides comprises | « Data » ≈ 660 000 cellules par année, plus les onglets « SemXX » |
| Onglets par fichier | **200** | un onglet « SemXX » par semaine, jamais effacé : ≈ **52 par année**, donc le plafond arrive en ≈ **3 ans et demi** |
| Durée d'un script (compte Gmail) | 6 minutes par exécution | « Stats » relit toute la feuille ; plus elle grossit, plus c'est long |
| Temps total des déclencheurs | ≈ **90 minutes par jour** (compte Gmail) | « Stats » se refait aux 15 minutes s'il y a du nouveau ; avec 40 000+ lignes, ça peut manquer de temps |
| Appels externes | ≈ 20 000 par jour | correct |

👉 **Conseil :** commencer **un nouveau fichier Google Sheet chaque année**, ou archiver « Data » en janvier. La
paie, les talons et les rapports ne dépendent **pas** de la Google Sheet : ils lisent la base de Sparklog.

### Lecture automatique des captures (OCR.space)

| Quoi | Limite (clé gratuite) | À 60 employés |
|---|---|---|
| Lectures par mois | 25 000 | ≈ 4 000 à 5 000 (inventaire 2–3 par jour par employé, plus les preuves de temps sup.) : correct |
| Lectures par jour | ≈ 500 par adresse internet | ≈ 180–250 par jour : correct, mais la même adresse peut être partagée avec d'autres |
| Taille d'une image | 1 Mo | l'app envoie ≈ 80–100 Ko : correct |

- Si aucune clé n'est enregistrée, l'app utilise la clé de démonstration publique « helloworld », **très
  limitée**. **À vérifier** dans Supabase › Edge Functions › Secrets : `OCR_SPACE_API_KEY` doit exister.
- Si la limite est atteinte, rien ne se perd : la photo est gardée, la liste reste « à vérifier » et un
  gestionnaire peut relancer la lecture. Une clé payante (300 000 lectures par mois) règle le problème.

### Site web (Vercel)

| Quoi | Limite | À 60 employés |
|---|---|---|
| Bande passante | 100 Go par mois (forfait gratuit « Hobby ») | l'app fait ≈ 2 Mo par appareil, une fois : correct |
| Usage commercial | **interdit** sur le forfait gratuit « Hobby » | **à vérifier** : si le compte Vercel est en Hobby, passer à **Pro** (≈ 20 $ US par mois) pour une entreprise |

### Autres points

- **Courriels envoyés par l'app** (mot de passe oublié, invitations) : le service de courriel inclus de Supabase
  est **très limité** (quelques courriels par heure). La création d'employé et la réinitialisation par un
  gestionnaire n'envoient pas de courriel, donc pas de problème. Pour que « mot de passe oublié » marche
  pour tout le monde, il faudrait configurer un service de courriel (SMTP).
- **Inscriptions en groupe** (ex. 25 nouveaux le même jour) : chaque inscription envoie un courriel de confirmation, et
  au-delà de la limite l'inscription échoue (« réessayez plus tard »). C'est ce qui est arrivé le 23 septembre (14 sur 15
  sans courriel). Avant une arrivée en groupe : Supabase › Authentication › Sign In / Providers › Email, désactiver
  « Confirm email » le temps des inscriptions (les comptes restent **inactifs** jusqu'à ce qu'un gestionnaire les active
  dans Employés, où un compteur rouge les signale), puis le réactiver.
- **Nouvel(le) employé(e)** (V2.4.168) : dans la fiche de la personne (Employés), « Embauche / départ » › « Nouvel(le)
  employé(e) », puis la date de son premier jour de travail. Jusqu'à cette date, elle n'apparaît pas dans Équipe en direct,
  la vue semaine ni « Pas soumis hier », et la liste Employés la montre « En attente » (ni active, ni inactive). On peut
  activer son compte avant, pour qu'elle remplisse son profil ; sinon elle revient dans le compteur rouge à son premier jour.
- **Téléphones** : les brouillons hors ligne restent sur l'appareil 30 jours. L'app installée prend ≈ 2 Mo.
- **Notifications sur le téléphone** (V2.4.172) : après chaque message, Communications dit ce qui s'est passé :
  « envoyée à N téléphone(s) », « aucun destinataire n'a activé les notifications » ou « pas partie : ta session est fermée » (se déconnecter, se reconnecter, puis
  « Renvoyer »). **Déconnexion** = cet appareil seulement : se déconnecter sur le téléphone ne ferme plus la Gestion
  ouverte sur l'ordinateur (c'est ce qui avait bloqué le test du 22 octobre). Changer son mot de passe déconnecte
  encore partout.
- **Notifications activées par défaut** (V2.4.173) : tout le monde les reçoit, sans aller dans Profil. Un téléphone
  oblige quand même chaque personne à toucher **« Autoriser »** une fois : aucune app ne peut le faire à sa place. Donc,
  à l'ouverture de l'app, une carte bleue en haut dit « Activer les notifications sur le téléphone » : la personne touche
  « Activer », puis « Autoriser ». « Plus tard » la cache 3 jours, puis elle revient. Si le téléphone a déjà dit oui,
  l'app s'abonne toute seule. Sur iPhone, il faut d'abord ajouter SparkLog à l'écran d'accueil (la carte l'explique).
  **Seulement sur téléphone ou tablette** (V2.4.174) : sur un ordinateur, la carte n'apparaît plus. Le 23 octobre, Karine
  (ordinateur, Microsoft Edge) touchait « Activer » et la carte restait : Edge cache sa question dans une petite cloche
  barrée à droite de l'adresse, donc rien n'était permis. Pour les recevoir sur l'ordinateur quand même : Profil ›
  Notifications sur le téléphone, puis, si Edge ne pose pas la question, cadenas à gauche de l'adresse › Autorisations
  pour ce site › Notifications › Autoriser. Pour les recevoir sur son téléphone, ouvrir SparkLog sur le téléphone.
  Seule une personne qui les **désactive** dans Profil ne les a plus (sur ce téléphone). Au 2026-10-23 : 2 comptes
  actifs sur 36 les avaient. **Pour voir qui les a** : Employés, cloche verte à côté du nom (activées) ou cloche barrée
  (pas encore), et la pastille « Sans notifications » pour ne voir que ceux qui manquent — à rappeler à l'équipe.
- **Dates dans la fiche de l'employé** (V2.4.176) : dans Employés, sous le téléphone et le courriel, une ligne avec la
  **date de naissance**, le **NAS** (sortis de l'ancienne section « Métadonnées », renommée **« Données CCQ »**), la **date
  d'embauche** et le **dernier jour travaillé**. La date d'embauche est la même que le « premier jour » d'un(e) nouvel(le)
  employé(e) : une date à venir le met « En attente ». Le dernier jour travaillé se remplit lors d'une mise à pied ou d'un
  départ ; il ne peut pas être avant la date d'embauche. Chaque changement est au Journal, et le Relevé d'emploi utilise ces
  deux dates quand elles sont remplies.
- **Groupes d'employés** (V2.4.175) : Gestion › Équipe › onglet **Groupes** (à côté d'Employés et Absences). « Nouveau
  groupe » → un nom (ex. « Entrepôt Laval ») et une note facultative, puis cocher ses employés. Une personne peut être
  dans plusieurs groupes. On peut renommer ou supprimer un groupe (les employés restent dans l'app). Ça sert à deux
  choses : **Communications** → nouveau choix « Groupes » (cocher un ou plusieurs groupes : chaque personne active reçoit
  le message une seule fois) et **Inventaire › Entrepôt** → le total d'un groupe, en plus du total par région. Seuls les
  gestionnaires voient les groupes ; les employés ne savent pas dans quel groupe ils sont.
- **Message à « Tous les employés » et nouveaux en attente** (V2.4.175) : qui reçoit quoi — un compte **inactif** (en
  pause, mis à pied, ne travaille plus) ou une nouvelle inscription pas encore activée ne reçoit **rien**. Un(e)
  nouvel(le) employé(e) **en attente** dont le compte est déjà activé : l'app **demande** avant l'envoi « Leur envoyer ce
  message aussi ? » avec leurs noms et leur date de début — « Oui, les inclure », « Non, sans eux » (les autres le
  reçoivent) ou « Annuler » (rien ne part). Pas de question s'il n'y a personne en attente, ni quand on coche les gens un
  par un. Même question avec un groupe.
- **« Le téléphone n'a pas laissé l'app lire cette image »** (V2.4.170) : l'image choisie n'est pas lisible (souvent une
  photo seulement dans le nuage de Google Photos, ou une capture pas encore enregistrée). L'app réessaie seule 3 fois ;
  sinon, refaire la capture, attendre quelques secondes et la choisir dans Galerie ou Fichiers. Chaque cas est noté au
  **Journal** (filtre « Image illisible ») avec la taille, l'âge du fichier et le téléphone, pour savoir la vraie cause.

### À corriger avant de passer à 60 employés 💻

- [x] **À traiter** : 600 jobs, **plus vieilles d'abord** (V2.4.140).
- [x] **Ménage automatique des images** (`cleanup_overtime_evidence`) : lancé **chaque nuit à 4 h 17**
  (3 h 17 en hiver), tâche « cleanup-evidence-daily » (V2.4.140, migration 0094). Il efface les preuves et
  captures d'inventaire de plus de 30 jours (les premières vers le 27 octobre) et les images qu'aucune fiche
  n'utilise (envoi raté ou photo remplacée, plus vieilles que 2 heures).
- [x] **Synchronisation quotidienne des taux CCQ** (« ccq-daily-sync », 5 h chaque matin, 4 h en hiver) : réparée
  (V2.4.140). Testée le 16 octobre : réponse 200, les 5 grilles électricien récupérées. Les tâches utilisent
  un secret gardé dans le coffre de Supabase (Vault), jamais dans le code.
- [ ] **Google Sheet** : prévoir un nouveau fichier en janvier 2027.
- [ ] **Vérifier** la clé OCR et le forfait Vercel (voir plus haut).

## Comment demander à Claude

Une phrase suffit, par exemple :
- « Voici 3 talons de paie, compare-les avec l'app. »
- « Ajoute une prime de soir de 2 $/h pour tel employé. »
- « Fais l'étape 5, le point sur la CNESST. »

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
