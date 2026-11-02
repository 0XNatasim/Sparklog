# NOOB.md — Ce qu'il reste à faire, en clair

> Version simple de la liste détaillée dans `CLAUDE.md` §6. Mise à jour : 2026-11-02 (V2.4.227).
> `README.md`, `NOOB.md` et `CLAUDE.md` sont mis à jour **ensemble à chaque version** (un test le vérifie).
> Seulement ce qui reste à faire : ce qui est terminé est retiré (voir l'historique Git). Ce que fait l'app : `README.md`.

## Où on en est

- ✅ **V2.4.227** : gros ménage et filet de sécurité, **rien ne change pour la paie**.
  - **Deux gestionnaires, une même fiche** : si une fiche a été modifiée depuis que le gestionnaire l'a ouverte (par l'employé ou par
    l'autre gestionnaire), l'approbation est **refusée** et l'app demande de la relire. Avant, seul le double envoi était bloqué.
  - **Santé du système** : dans **Gestion › Santé**, une nouvelle section « Vérifications automatiques » dit si une tâche
    automatique a échoué ou s'est arrêtée, si des photos sont gardées trop longtemps, si une fiche approuvée n'est jamais partie vers
    le Google Sheet, ou si les taux CCQ ne se mettent plus à jour. Rouge = un geste à faire (la ligne le dit).
  - **Français d'abord, anglais à la demande** : l'app s'ouvre plus vite ; l'anglais ne se télécharge que si quelqu'un le choisit.
  - **Ménage** : deux fonctions serveur jamais utilisées, quatre fichiers d'écran morts et trois paquets inutilisés sont retirés du code.
  - **Procédures** : restauration (`docs/ops/restore-procedure.md`), contrôle de fin d'année, nouveau Google Sheet par année,
    vérification de la clé de lecture des captures, tests automatiques de bout en bout (`npm run e2e`). Détails aux étapes 7 et 8.
  - **À faire de ta part** : appliquer la migration 0132 (Supabase › SQL ou `supabase db push`) pour que la section « Vérifications
    automatiques » s'affiche, et **redéployer** `push_approved_batch` (la protection « fiche modifiée » vit dans cette fonction).
- ✅ **V2.4.225** : dans **Équipe › Employés**, la fiche d'un employé **te guide** : chaque champ obligatoire encore vide a un **contour
  rouge** et la mention « à remplir », l'onglet qui le contient affiche un **nombre rouge**, et le bandeau rouge en haut liste les champs :
  **un clic dessus ouvre le bon onglet**. Une fiche complète n'a plus rien de rouge. Rien d'autre à faire que de remplir les champs.
- ✅ **V2.4.224** : nouvel onglet **Gestion › Configuration › Barèmes annuels**. C'est ici que **tu** entres, chaque janvier, les
  chiffres officiels de l'année : RRQ, assurance-emploi, RQAP, paliers d'impôt (fédéral et Québec), FSS, Normes du travail et
  FDRCMO. L'écran part de l'année précédente, **te montre tous les changements avant d'enregistrer** et refuse un barème qui ne
  tient pas debout (un maximum qui ne correspond pas à son taux, des paliers dans le désordre). Si tu n'as rien saisi pour
  l'année en cours, le talon utilise le barème précédent et **l'écrit dans ses avertissements**. Une **pastille** sur
  Configuration apparaît 4 semaines avant le 1er janvier. **À faire avant le 1er janvier 2027** : saisir le barème 2027 avec les
  documents officiels (TP-1015.F, T4127, avis de la CCQ) ; à valider avec ta comptable.
- ✅ **V2.4.223** : **rappel avant un changement de taux**. Quand un taux dont on connaît la date change dans les 4 semaines
  (la taxe MÉDIC le 1er janvier 2027, la prime MÉDIC le 25 avril 2027, ou un changement que tu as ajouté), une **pastille** apparaît
  sur **Configuration** dans le menu, et l'onglet **Taux** dit quel taux, quelle nouvelle valeur et quelle date. Trois étapes :
  4 semaines, 2 semaines, dernière semaine ; la pastille disparaît le jour du changement. **À faire** : quand elle apparaît,
  vérifier que la valeur annoncée est la bonne.
- ✅ **V2.4.222** : nouvel onglet **Gestion › Configuration › Taux**. Quand un taux de paie change (prime MÉDIC et sa taxe,
  prélèvement CCQ, caisse d'éducation, cotisation retraite, avantages sociaux patronaux), **tu l'ajoutes toi-même** avec la date
  où il commence : plus besoin de passer par le code. Les semaines avant cette date gardent l'ancienne valeur. **Toi seule**
  peux modifier (avec le code à deux étapes) ; les gestionnaires voient seulement. Les salaires par niveau n'y sont pas : ils
  suivent déjà les taux de la CCQ tout seuls. Tant que tu n'ajoutes rien, rien ne change. **À faire** : quand la CCQ annonce un
  nouveau taux, l'ajouter ici avec sa date et la source en note.
- ✅ **V2.4.221** : la **taxe sur la prime d'assurance MÉDIC** (retenue sur la paie) passe de **9 % à 9,975 %** au **1er janvier 2027**,
  comme la CCQ l'a annoncé le 28 octobre. L'application change de taux toute seule : 9 % jusqu'à la paie du 26 décembre 2026,
  9,975 % à partir de la semaine du 3 janvier 2027. Rien à faire de ton côté. Rien à confirmer pour la
  semaine du jour de l'An : c'est le congé de la construction, sans heures travaillées.
- ✅ **V2.4.220** : plus de **pastille sur « Registre d'accidents » dans le menu de gauche**. Un accident pas terminé garde sa
  pastille orange **« Ouvert »** à l'intérieur de la page (et le filtre « Ouverts (n) ») tant que tu n'as pas cliqué « Fermer le dossier ».
- ✅ **V2.4.219** : une **alerte rouge pour les gestionnaires** dans « À traiter » et dans « Justificatifs » : « N justificatif(s) pas
  encore téléchargé(s) ont 21 jours ou plus », avec le détail (temps supp / stationnement) et le nombre de jours avant que le plus
  pressé soit supprimé. Elle compte aussi ceux qui seront supprimés dans 3 jours ou moins, même si le délai de conservation est
  plus court. Elle disparaît dès que tout est téléchargé.
- ✅ **V2.4.218** : **Télécharger les justificatifs** se choisit maintenant **une semaine à la fois** (la plus récente est déjà
  choisie). Le fichier s'appelle **« justificatifs Sem43 »** (numéro de la semaine) et contient **deux dossiers** :
  « Stationnement » et « Temps supp ». Ce qui est déjà téléchargé n'est pas redonné si tu refais la même semaine. Si une semaine
  a plus de 100 photos, il y a plusieurs fichiers (« - partie 2 », etc.).
- ✅ **V2.4.217** : deux documents Hilo sont rangés dans `docs/reference/` pour les retrouver facilement : le texte de la
  **formation Hilo et Field** (installateurs, 20 août 2024) avec son **PDF complet** (109 pages) à côté, et le PDF
  **« Explications des Défis Hilo »** (7 pages : ce qu'est un défi, ce que fait chaque appareil, les 3 niveaux, quoi dire au
  client). Rien ne change dans l'application.
- ✅ **V2.4.216** : **noms officiels des appareils** de l'inventaire. Fini les noms déformés (« E- Contrôleur… », « Module d'expansion
  pour pla », points devant le nom) : chacun des 17 appareils connus s'affiche toujours avec son nom de ta liste, partout
  (listes, comparaison, minimums, alertes, écran de l'employé), y compris pour les anciens jours (migration 0128). Un appareil
  inconnu garde le nom lu. Si un nom de ta liste change un jour, il se change dans `equipment_names.js`.
- ✅ **V2.4.215** : étape **Inventaire** de l'employé. (1) Quand **aucune ligne n'a pu être lue** (« Photos seulement »), l'employé
  reçoit maintenant le message de reprendre ses captures ou d'en ajouter une (puis « Continuer quand même »). Avant, seul « il
  manque des lignes » était demandé. (2) L'application **note ce que l'employé a vu** en quittant l'étape (lecture, lignes
  manquantes, s'il a passé outre) pour pouvoir répondre « a-t-il eu le message ? ».
- ✅ **V2.4.214** : dans le **Sommaire imprimable**, le détail d'un **sous-traitant** sépare maintenant le **retour du
  régulier** (avant, le retour était ajouté au régulier et la colonne Retour restait vide). Le total ne change pas.
  Les employés CCQ sont inchangés.
- ✅ **V2.4.213** : pour les **sous-traitants**, la colonne « Retour (sans av. soc.) » devient simplement **« Retour »** : le
  nombre d'heures de retour. C'est le cas dans le rapport (Sommaire, fiche de chaque sous-traitant) et dans la vue semaine ;
  le tableau « Sous-traitants » a aussi une colonne Retour, donc Régulier + 1,5× + 2× + Retour = Total.
- ✅ **V2.4.212** : dans « À traiter », **« Pas soumis »** regarde d'abord la veille ; si tout le monde a soumis, il regarde
  l'avant-veille, et ainsi de suite **jusqu'au lundi de la semaine courante**. Il montre le jour le plus récent où il manque
  encore quelqu'un (la date est dans le titre) et le rappel vise ce jour-là. Le lundi, comme avant : seulement le vendredi.
- ✅ **V2.4.211** : stock minimum, **une seule notification par entrepôt**. Le chiffre sur « Inventaire » (et sur le bouton
  « Minimums par entrepôt ») compte les entrepôts qui ont au moins un appareil sous le minimum, plus les avis de stock négatif.
  La carte rouge liste chaque entrepôt avec ses appareils bas **en rouge** (en stock · minimum).
- ✅ **V2.4.210** : dans « Télécharger les justificatifs », on choisit une **plage de semaines** (« De la semaine » / « À la
  semaine », dimanche → samedi) au lieu de dates. Pas de soupers : il n'y a pas de photo pour ça.
- ✅ **V2.4.209** : les **photos de reçus de stationnement** sont gardées **le même nombre de jours que les captures de temps
  supplémentaire** (le réglage de Configuration › Paramètres, 30 jours). Seules les photos sont retirées : le montant et
  l'approbation restent. Dans **Justificatifs**, un bouton **« Télécharger les justificatifs »** : on choisit la période et
  ce qu'on veut (temps supplémentaire, stationnement), et on reçoit un fichier ZIP (nom : jour, employé, OT). L'application
  retient ce qui est déjà téléchargé : en retélécharger plus tard ne redonne que les nouveaux (case « Inclure ceux déjà
  téléchargés » pour tout reprendre). Les photos restent dans l'application jusqu'à la fin des 30 jours. Le nettoyage automatique
  supprime les reçus de plus de 30 jours : télécharge ce que tu veux garder avant.
- ✅ **V2.4.208** : les OT prédéfinis sont dans **la même case que l'OT** : une petite flèche à droite de la case ouvre la
  liste ; on choisit, ça s'écrit dedans, ou on tape un numéro comme avant. Aussi, le script du **Google Sheet** applique
  maintenant la règle des 65 km (premier trajet payé). Le bouton **« Inventaire du crew »** est retiré de la page Inventaire. **À faire : coller le nouveau `doPost` dans Google Apps Script
  (fichier `apps-script-doPost.js`) et le redéployer en « Nouvelle version ».**
- ✅ **V2.4.207** : **premier trajet non payé, mais payé dès 65 km**. Pour un employé qui a l'option « premier trajet non payé »,
  le premier trajet de la journée est maintenant **payé si la première fiche de la journée fait 65 km ou plus** (65 compte). En
  dessous de 65 km, il reste non payé. Depuis le 11 octobre. Le moteur de paie, le souper et l'exigence de la capture
  d'écran de temps supplémentaire suivent la même règle. La règle n'a pas encore été signée par
  un spécialiste de la paie.
- ✅ **V2.4.206** : des **OT prédéfinis**. Sous le champ OT de la fiche de temps, un menu « Ou choisir un OT prédéfini… » :
  PAUSE SÉCURITÉ, FORMATION HILO EMBAUCHE, FORMATION BRITTON, FORMATION HQ, OK KARINE. On choisit, le nom s'écrit tout seul
  dans le champ OT ; pour un vrai numéro d'OT, on le tape comme avant. La liste se gère dans **Configuration › OT
  prédéfinis** (ajouter, renommer, monter / descendre, masquer, retirer).
- ✅ **V2.4.205** : dans « Cette semaine » / « Semaine passée », un **filtre de semaine** en haut (menu déroulant et flèches ◀ ▶) :
  on choisit parmi les 13 dernières semaines (« Semaine 44 · 18 oct → 24 oct »). Les deux boutons ouvrent la même fenêtre,
  sur la semaine courante ou la semaine passée ; le filtre permet d'aller plus loin. Le titre devient « Snapshot de la semaine ».
- ✅ **V2.4.204** : « Cette semaine » et « Semaine passée » sont plus **compactes**. Le **samedi et le dimanche** n'apparaissent
  que si quelqu'un a une fiche ces jours-là. Dans chaque carré, les heures et les km sont sur **une seule ligne**. À droite,
  le total et les km sont ensemble, avec une seule petite ligne : « payé 16h15 · arr. +1 · cpt +1 » (arr. = arrondi de la
  semaine, cpt = compteur, en minutes ; une note sous le tableau l'explique).
- ✅ **V2.4.203** : le **chiffre** à côté d'« Inventaire » dans le menu est expliqué. Il additionne les avis de stock négatif
  et les appareils **sous leur minimum** (le survol de la pastille le dit). En haut de la page Inventaire, une ligne rouge
  donne le détail : « 8 appareils sous le stock minimum — Entrepôt Rimouski (8) », avec un lien. La page Minimums par
  entrepôt liste chaque appareil sous son minimum, avec son stock, tout en haut.
- ✅ **V2.4.202** : le bouton **« Entrepôt »** de la page Inventaire est retiré. Les **Minimums par entrepôt** le remplacent :
  le total de chaque appareil par entrepôt, à côté de son minimum, est dans Inventaire › Minimums par entrepôt. Le bouton
  « Équipe » (total de toute l'équipe) reste.
- ✅ **V2.4.201** : l'**arrondi** est visible. Dans « Cette semaine » et « Semaine passée », sous le total de chaque
  employé : « payé 39h45 » (arrondi au 15 minutes), puis « arrondi −7 min · compteur −7 min ». Le * veut dire qu'un
  brouillon n'est pas compté. Les carrés restent à la minute (le temps saisi). Dans **Paie de la semaine**, une colonne
  « Arrondi » donne l'écart de la semaine et le compteur à la fin de la semaine, à côté des heures déjà arrondies.
- ✅ **V2.4.200** : dans le **Registre d'accidents**, chaque dossier accepte des **fichiers** : photos, PDF, Word, Excel,
  texte (10 Mo chacun, 20 au plus). Bouton « Ajouter des fichiers » dans le dossier ; pour un nouveau dossier, les fichiers
  choisis partent quand on enregistre. On clique un fichier pour l'ouvrir, la corbeille le retire (avec confirmation).
  Seuls les gestionnaires les voient ; le Journal note chaque ajout et chaque retrait.
- ✅ **V2.4.199** : dans Inventaire, le bouton **« Minimums par entrepôt »** ouvre sa propre page : la liste des
  entrepôts, avec **Oui / Non** (« Compter cet entrepôt ? »). Non = on n'ira pas plus loin avec cet entrepôt. Oui = la
  liste des appareils avec le **minimum** (ratio par employé × employés du groupe) et, à côté, le **total des
  inventaires** des employés de l'entrepôt ; en rouge, ce qui est sous le minimum. Seuls les entrepôts à « Oui » donnent
  l'alerte. Les 74 minimums du tableau de Karine sont déjà saisis. Alma, Charlevoix et Rimouski sont à « Oui ».
- ✅ **V2.4.198** : **stock minimum par entrepôt**. Dans Inventaire, bouton « Minimums » : choisissez l'entrepôt (un groupe),
  un appareil et un **ratio par employé** (ex. 0,5 thermostat par employé). Le minimum = ratio × nombre d'employés du
  groupe. Si le stock des derniers inventaires passe sous le minimum, l'appareil s'affiche en rouge en haut de la page
  Inventaire et la pastille d'Inventaire s'allume. Vérifier que chaque entrepôt est bien un groupe avec ses employés (Équipe › Groupes).
- ✅ **V2.4.197** : nouveau **Registre d'accidents** (menu Équipe, gestionnaires seulement). « Nouveau dossier » : date,
  la personne, la gravité, ce qui s'est passé, les soins, les jours perdus, le numéro CNESST, les mesures correctives.
  Un dossier se ferme (ou se rouvre), il ne s'efface jamais. Le menu affiche le nombre de dossiers ouverts. Les employés
  ne le voient pas.
- ✅ **V2.4.196** : les carrés « Cette semaine » / « Semaine passée » montrent les km du jour sous les heures. La feuille
  manuelle du gestionnaire demande les km (**0 est accepté, vide non**). Le Sommaire (et son impression) sépare le temps
  régulier et le temps supplémentaire des sous-traitants en colonnes différentes.

- 🔴 **À faire en premier : la paie des semaines 43 et 44.** La semaine 43 (11 au 17 octobre) est la **première payée
  par Sparklog**. Au 2026-11-01, pour les semaines 43 et 44 ensemble (11 au 24 octobre) : 745 fiches soumises mais pas approuvées
  et 44 approuvées ; rien n'est encore comptabilisé. Dans l'ordre, une semaine à la
  fois : **À traiter** (approuver) › **Paie › Paie de la semaine** (« Calculer et comptabiliser ») › imprimer les talons.
  La semaine 44 attend que la 43 soit comptabilisée (le cumul de l'année suit d'une semaine à l'autre).
- ✅ L'app fonctionne et les heures sont bien classées. Toutes tes décisions de paie sont dans l'app.
- ⚠️ **Les montants en dollars de la paie** (avantages CCQ, impôts, cotisations) sont **des estimations**.
  Ils restent « à réviser » tant que les étapes 1 à 4 ci-dessous ne sont pas faites.

📋 Toutes les règles de paie en vigueur, avec leurs options et leurs sources :
**Gestion › Configuration › Règles de paie**.

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
  ✅ Une estimation est inscrite dans **Paramètres › Paie** depuis le 27 octobre (elle sert aussi au taux du FSS :
  environ 2 % à 2 M$, 1,65 % sous 1 M$). Reste : la remplacer par le vrai total quand le comptable le confirme. Demander au comptable seulement si Messier est **associé à d'autres entreprises** au
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
  **Pour finir ce point, il faut (rien d'autre) :**
  1. le **relevé CNESST** (ou l'état de compte du trimestre) d'**une période complète** ; il montre « salaire admissible » et « excédent »
     pour la même période que les talons ;
  2. les **talons des mêmes semaines** (ceux de la semaine 43 à 45 conviennent) pour 3 employés : un à salaire modeste, un à salaire élevé, un
     chef d'équipe ;
  3. la réponse du **comptable** à une question : *« le plafond de 103 000 $ s'applique-t-il par année, ou la CNESST le répartit-elle par
     paie ? »* (et si la paie de la propriétaire est cotisable) ;
  4. ensuite Claude compare : si le plafond par paie (1 980,77 $/semaine) redonne au cent près le « salaire admissible » du relevé,
     la règle est confirmée et le code se corrige en une demi-journée (calcul + fiche des règles + test de parité).

## Étape 2 — Infos de chaque employé 👤

- [ ] **Formulaires TD1 (fédéral) et TP-1015.3 (Québec)** remplis et signés par chaque employé. Ils
  donnent les crédits d'impôt personnels et servent à calculer l'**impôt retenu sur chaque paie**. *Où l'inscrire :*
  **Équipe › Employés › fiche de l'employé › onglet Impôts**. Inscris seulement les montants, jamais le NAS
  ni une copie du formulaire. Tant qu'un employé n'a rien, l'app prend le montant personnel de base (bon pour la
  plupart). **Au 2026-10-27 : aucun saisi.** Le plus simple : demander à Dynacom les montants qu'ils
  utilisaient, et n'inscrire que ceux qui diffèrent du montant de base.
- [ ] **NAS** : un seul est saisi et son **chiffre de contrôle est invalide** (Claude peut dire sur quelle fiche) (un chiffre mal
  tapé ou deux inversés : le 9e chiffre est calculé à partir des 8 autres). Le revérifier sur la carte et le
  ressaisir (Employés › fiche › NAS, propriétaire seulement). Les autres sont à saisir pour le rapport mensuel CCQ.
- [ ] **Dates d'embauche** (et de réembauche) de chaque employé, à faire vérifier par la propriétaire (Équipe ›
  Employés › fiche › Identité). Elles servent au **relevé d'emploi** : quelqu'un qui revient après une mise à pied ou un
  départ a sa date de retour dans « Date de réembauche », et le relevé part de cette date.
- [ ] **Syndicat et local** de chaque employé (par ex. FIPOE, local 568…).
- [ ] **Niveau** (compagnon ou apprenti, et quelle période) et **taux horaire**, vérifiés sur la carte ou
  le certificat CCQ. La liste de contrôle à remplir est à la fin du `README.md`.

À savoir sur le cumul de l'année (fait le 2026-10-16, à partir du « Cumulatif des employés » de Dynacom jusqu'à la
semaine 42) :
- Karine : paie fixe 40 h × 51 $ par semaine depuis le 4 octobre, **exclue de l'AE** (si tu veux son coût
  d'avril à septembre dans les rapports, change « Paie fixe depuis le » pour le 2026-04-05).
- **Exclu du RRQ** (case de la fiche de l'employé › onglet Impôts) : cochée pour l'employé à qui Dynacom ne
  retient aucun RRQ. À cocher aussi pour tout autre employé qui a cessé de cotiser (garder la preuve au dossier).
- Si Dynacom met à jour les cumuls (par exemple le RRQ d'avant avril, comme pour un employé cette semaine),
  me redonner le nouveau « Cumulatif des employés » : je remplace les lignes du 10 octobre.
- Heures cumulées : pour 4 chefs d'équipe, Dynacom compte aussi les lignes de prime comme des heures. Ça ne
  touche que la ligne « Heures » des talons et le relevé d'emploi, pas les montants. Pour les corriger, importer
  leur talon de la semaine 42 (l'import corrige les heures).
- **Comptabiliser chaque semaine** dans Paie de la semaine, sinon le cumul ne suit pas.

## Étape 3 — Valider avec de vrais talons de paie 👤 🧾

> 📅 **À faire cette semaine** (décision du 2026-11-02).

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

- 📌 **Toujours gardé, à faire à la fin** (décision du 2026-11-02) : tant que ceci n'est pas fait, la paie reste « brouillon / à réviser ».
- [ ] Un **spécialiste de la paie ou de la CCQ, nommé** (comptable ou firme de paie), relit les règles et
  les résultats et donne son accord par écrit.
- [ ] Ensuite seulement, Claude fait passer le moteur de paie de « brouillon » à « validé ». Les
  montants ne sont plus marqués « à réviser ».

## Étape 5 — Améliorations techniques 💻

Claude peut les faire quand tu veux. Ça ne bloque pas la paie.

- [ ] **CNESST sur le salaire admissible (trou du calcul)** : l'app calcule la CNESST (3,17 %) sur tout le
  salaire, alors que le vrai relevé ne la calcule que sur un « salaire admissible ». Le coût CNESST est donc
  **trop élevé** dans DAS, Calcul et Coûts. À corriger dès que la règle de l'excédent est connue (étape 1).
- 📝 **Heures payées la nuit d'un changement d'heure** : **ne s'applique pas** chez nous (décision du 2026-11-02 : on ne travaille pas
  pendant le changement d'heure). Note gardée : la paie compte l'heure affichée ; quelqu'un qui travaillerait pendant l'heure répétée
  de l'automne serait payé 1 h de moins (1 h de trop au printemps). Si ça arrivait un jour, en parler au comptable avant de toucher au moteur.
- ✅ **Fait en V2.4.227** : approbation refusée si la fiche a changé ; une seule langue téléchargée au départ ; ménage de 2 fonctions
  serveur et de 4 fichiers/paquets morts ; surveillance des échecs silencieux.
- 📝 **Gardés volontairement** (vérifiés le 2026-11-02) :
  - la colonne `return_overtime_no_benefits` (53 fiches, toutes à « oui ») : **aucune fonction, vue ni règle ne la lit**, mais elle
    contient une donnée de l'ancien réglage ; on ne la supprime pas sans ton accord (suppression impossible à défaire) ;
  - les fonctions `classify_week` (moteur de paie côté serveur, cité par la fiche des règles) et `reset_employee_password`
    (réinitialiser un mot de passe : aucun bouton ne l'appelle encore, mais la capacité existe).
- [ ] **À supprimer chez Supabase par toi** (Edge Functions › supprimer) : `send_sms`, `quick-handler` (vieille copie de la lecture des
  preuves) et `purge_reset_evidence_20260928`. Elles n'ont plus de code dans le dépôt ; Claude ne peut pas les supprimer d'ici.
  Aussi : `send_announcement` et `push_approved_to_sheet` (retirées du code en V2.4.227, encore en ligne chez Supabase).
- [ ] **Notification sur le téléphone** quand Karine répond à une note partagée ou quand un rappel arrive (aujourd'hui : dans
  l'app seulement). Voir « Plus tard ».

## Étape 6 — Temps de trajet, km et frais : une option par employé 👤 💻

Décision du 2026-10-18 : **chaque ligne ci-dessous devient une option dans la fiche de l'employé** (⚙️), y compris
« Chargé à Britton ». La grille se remplit dans Admin › Trajets et frais, mais la paie ne la lit pas encore. La colonne **Défaut** = ce que l'app fait aujourd'hui, et donc
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

### Décisions prises (2026-10-18 et 2026-10-26)
- Retour client → maison : payé **à partir de 65 km** ; le choix CCQ / non-CCQ n'apparaît que si la case est cochée.
- Domicile à plus de 65 km : c'est du **temps de trajet**, payé CCQ dans le 40 h de la semaine, non-CCQ au-delà.
- Taux km : **un seul taux par employé** pour tous les trajets.
- Fournisseur, attente, temps à l'entrepôt : pas d'option, inclus dans le temps de la job (payé CCQ).
- Samedi / dimanche / férié et souper : options gardées, cochées pour tous les employés CCQ (la convention les impose).
- Pas de champ de plus dans la fiche de temps pour les trajets maison ↔ entrepôt et client → maison (2026-10-26).

### Reste à faire
- [ ] 👤 **Finir de remplir chaque ligne** (commencé : 145 réglages au 27 octobre) dans **Gestion › Admin › Trajets et frais** (« Pour tous » ou « Choisir… », « Chargé à
  Britton ? », date « en vigueur à partir du »). Tant que la paie ne lit pas ces réglages, chaque ligne garde son défaut.
- [ ] 👤 **Taux facturé à Britton** : inconnu pour l'instant.
- [ ] 💻 Le moteur de paie et le talon qui lisent ces options ; tests de chaque ligne.
- [ ] 💻 Un rapport « Chargé à Britton » par semaine.

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
  La taxe provinciale s'ajoute aux deux parts (9 % jusqu'au 31 décembre 2026, 9,975 % ensuite : déjà dans l'app). L'app passe **toute seule** à 1,06 $ dès la semaine du
  25 avril 2027 ; si le gel est prolongé, le dire à Claude. À cette date, toute la grille de salaires CCQ change
  aussi : fournir la nouvelle grille ACQ. Une **pastille** sur Configuration t'avertit 4 semaines, 2 semaines et 1 semaine avant
  (donc dès le 28 mars 2027) ; le nouveau montant se change dans **Configuration › Taux** sans passer par Claude.
- [ ] **Barèmes 2027 (RRQ, assurance-emploi, RQAP, impôts, FSS, CNT, FDRCMO)** : à saisir dans **Configuration › Barèmes annuels**
  avant le 1er janvier 2027, avec les documents officiels et ta comptable. Une pastille apparaît dès le 4 décembre ; sans
  barème, les talons de 2027 utilisent celui de 2026 et l'écrivent dans leurs avertissements.

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
| Lecture/écriture du disque | rafales limitées sur un petit serveur | un ralentissement est déjà arrivé, corrigé depuis | **à surveiller** : Gestion › Admin › État du service |
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

👉 **Décision (2026-11-02) : un fichier Google Sheet par année**, un onglet par semaine. Marche à suivre à l'étape 7. La
paie, les talons et les rapports ne dépendent **pas** de la Google Sheet : ils lisent la base de Sparklog.

### Lecture automatique des captures (OCR.space)

| Quoi | Limite (clé gratuite) | À 60 employés |
|---|---|---|
| Lectures par mois | 25 000 | ≈ 4 000 à 5 000 (inventaire 2–3 par jour par employé, plus les preuves de temps sup.) : correct |
| Lectures par jour | ≈ 500 par adresse internet | ≈ 180–250 par jour : correct, mais la même adresse peut être partagée avec d'autres |
| Taille d'une image | 1 Mo | l'app envoie ≈ 80–100 Ko : correct |

- Si aucune clé n'est enregistrée, l'app utilise la clé de démonstration publique « helloworld », **très
  limitée**. **Il y a deux endroits où la clé doit exister** : voir la marche à suivre à l'étape 8 (« Vérifier la clé OCR.space »).
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
- **Téléphones** : les brouillons hors ligne restent sur l'appareil 30 jours. L'app installée prend ≈ 2 Mo.
- **Notifications sur le téléphone** : chaque personne doit toucher « Autoriser » une fois sur son téléphone (une carte
  bleue le lui demande à l'ouverture de l'app ; sur iPhone, ajouter d'abord SparkLog à l'écran d'accueil). Au 2026-10-27 :
  **18 comptes** les ont, sur 47 actifs. Pour voir qui ne les a pas : **Employés**, pastille « Sans notifications », puis le
  rappeler à l'équipe. Sur un ordinateur, passer par Profil › Notifications.
- **« Le téléphone n'a pas laissé l'app lire cette image »** (V2.4.170) : l'image choisie n'est pas lisible (souvent une
  photo seulement dans le nuage de Google Photos, ou une capture pas encore enregistrée). L'app réessaie seule 3 fois ;
  sinon, refaire la capture, attendre quelques secondes et la choisir dans Galerie ou Fichiers. Chaque cas est noté au
  **Journal** (filtre « Image illisible ») avec la taille, l'âge du fichier et le téléphone, pour savoir la vraie cause.

### Avant de passer à 60 employés 👤

- [ ] **Google Sheet** : prévoir un nouveau fichier en janvier 2027.
- [ ] **Vérifier** la clé OCR et le forfait Vercel (voir plus haut).

## Étape 7 — Fin d'année et janvier 2027 👤

À faire **dans cet ordre**. Un contrôle prêt à l'emploi existe : `docs/ops/year-end-control.sql` (lecture seule, ne renvoie que des
nombres). Supabase › SQL editor › coller le fichier › Run. Refais-le début décembre, puis avant la première paie de janvier.

**Résultat du contrôle du 2026-11-02** (nombres seulement) : 47 employés actifs ; **46 sans NAS** ; **3 sans date d'embauche** ;
**47 sans montants TD1 / TP-1015.3** ; **aucun barème 2027** ; **1 183 fiches soumises depuis la semaine 43 pas encore approuvées** ;
dernière ligne du cumul au 10 octobre (aucune semaine comptabilisée par Sparklog). Tout est à zéro à la fin quand c'est prêt.

- [ ] **1. Approuver puis comptabiliser** les semaines 43 et suivantes, **une semaine à la fois** (À traiter › approuver, puis Paie de la
  semaine › Comptabiliser). Sans ça, le cumul de l'année (RRQ, AE, impôt) ne suit pas et les relevés de fin d'année seront faux.
- [ ] **2. NAS** de chaque employé actif (propriétaire seulement, Employés › fiche › NAS). Sans NAS : pas de Relevé 1, pas de relevé
  d'emploi, pas de rapport mensuel CCQ. Un NAS refusé = chiffre de contrôle invalide : revérifier sur la carte.
- [ ] **3. Dates d'embauche** manquantes (Employés › fiche). Elles servent aux cases 10 et 11 du relevé d'emploi.
- [ ] **4. TD1 et TP-1015.3** : montants dans Employés › fiche › Impôts. Les formulaires de **2027** sortent en décembre : faire signer les
  nouveaux à tout le monde en janvier (un employé qui n'en remet pas garde le montant de base).
- [ ] **5. Remplacer l'estimation de la masse salariale** par le vrai total (case A des relevés 1) quand le comptable le confirme
  (Configuration › Paramètres › Paie).
- [ ] **6. Barèmes 2027** (ci-dessous).
- [ ] **7. Nouveau Google Sheet 2027** (ci-dessous).
- [ ] **8. Vacances de la construction** : aucune heure travaillée du 27 déc. 2026 au 2 janv. 2027 ; rien à saisir.
- [ ] **9. Le comptable** fait les relevés (Relevé 1, T4, sommaire) : lui donner le cumul de l'app **après** l'étape 1.

### Barèmes 2027 (dans l'app : Configuration › Barèmes annuels)

L'écran part de 2026, te montre tous les changements et refuse un barème incohérent. Il te faut **huit séries de chiffres**. Aucun taux
2027 n'était encore publié le 2 novembre 2026 : ils sortent surtout **en novembre et décembre**. À chaque fois, vérifier avec ta comptable.

| Série | Où trouver le chiffre officiel | Quand |
|---|---|---|
| RRQ (taux, maximum des gains, 2e cotisation) | Revenu Québec › Employeur › [Cotisations au RRQ](https://www.revenuquebec.ca/fr/entreprises/retenues-a-la-source-et-cotisations-de-lemployeur/calcul-des-retenues-et-des-cotisations/cotisations-au-rrq/cotisations-au-rrq-ce-que-vous-devez-savoir/) ; la page « Employeur : principaux changements 2027 » apparaît en décembre | nov.–déc. |
| RQAP (taux employé et employeur, maximum) | Revenu Québec › [Table des cotisations au RQAP (TP-1015.TA)](https://www.revenuquebec.ca/fr/services-en-ligne/formulaires-et-publications/details-courant/tp-1015-ta/) | nov.–déc. |
| Assurance-emploi (taux, maximum assurable) | Canada.ca › « Taux de cotisation à l'assurance-emploi » ; confirmer dans la **T4127** de janvier (ARC) | nov.–déc. |
| Impôt fédéral (paliers, constantes K) | ARC › **T4127 « Guide des formules de calcul des retenues »**, édition de **janvier 2027** | déc. (à jour fin déc.) |
| Impôt du Québec (paliers) | Revenu Québec › **TP-1015.F** (édition 2027-01) et le guide **TP-1015.G** | déc. |
| FSS (taux selon la masse salariale) | Revenu Québec › [Seuil de la masse salariale totale et taux de cotisation au FSS](https://www.revenuquebec.ca/fr/entreprises/retenues-a-la-source-et-cotisations-de-lemployeur/calcul-des-retenues-et-des-cotisations/cotisation-de-lemployeur-fss/seuil-de-la-masse-salariale-totale-et-taux-de-cotisation-au-fss/) | déc. |
| Normes du travail (CNT, plafond) | Revenu Québec › Employeur › principaux changements 2027 (CNT : 0,06 % jusqu'au plafond) | déc. |
| FDRCMO (seuil 2 M$, 1 %) | Guide **RLZ-1.S.G** (Sommaire 1) de Revenu Québec | déc. |

Marche à suivre : Configuration › **Barèmes annuels** › choisir 2027 › l'écran propose le barème 2026 › corriger chaque série › lire la liste
des changements › Enregistrer. Une pastille rouge te rappelle dès 28 jours avant le 1er janvier, et tant que 2027 manque. Les outils pour
**comparer au cent près** : WebRAS (Revenu Québec) et PDOC (ARC). Tant qu'un barème n'est pas saisi, le talon utilise celui de 2026 et l'écrit.

### Taxe MÉDIC et grille ACQ (changent en 2027)

- **Taxe sur la prime MÉDIC : 9 % → 9,975 % le 1er janvier 2027.** Déjà dans l'app (rien à faire). Source : page CCQ
  [Salaire et taux](https://www.ccq.org/avantages-sociaux/salaire-taux), qui précise que la cotisation patronale et la retenue
  salariale ne changent pas, seulement la taxe appliquée dessus.
- **Prime MÉDIC et cotisation patronale : à confirmer avant le 25 avril 2027** (0,68 $ / 2,93 $ aujourd'hui, 1,06 $ / 3,31 $ prévus dans la
  convention). Où : [Salaire et taux](https://www.ccq.org/avantages-sociaux/salaire-taux), [MÉDIC Construction › Assurance de base](https://www.ccq.org/fr-CA/avantages-sociaux/medic-construction/assurance-de-base)
  et la [section 26 de la convention (résidentiel)](https://www.ccq.org/fr-CA/loi-r20/conventions-collectives/conventions-collectives/residentiel/section-26) ;
  l'**avis d'assurabilité** de chaque employé (janvier et juillet) donne les montants réels. En cas de doute : téléphoner à la CCQ,
  service aux employeurs. L'app te prévient 4, 2 et 1 semaine avant ; le changement se fait dans **Configuration › Taux**.
- **Nouvelle grille ACQ (salaires et avantages par niveau)** : l'ACQ (Association de la construction du Québec) publie la grille ICI à
  chaque changement (la dernière dans l'app : `docs/reference/acq-grilles-taux-ici-2026-04-26.pdf`). La nouvelle grille d'avril 2027 est
  attendue **en mars–avril 2027** : la demander à l'ACQ ou la chercher dans l'extranet de l'ACQ, puis la donner à Claude pour mise à jour
  de la grille (les salaires par niveau suivent déjà les taux de la CCQ tout seuls).

### Nouveau Google Sheet de l'année (un fichier par année, un onglet par semaine)

1. Début janvier, ouvrir le Sheet de 2026 › menu **Sparklog › Préparer le Sheet de l'année suivante** (script
   `supabase/functions/push_approved_batch/apps-script-rotate-year.js` : à coller une fois dans Extensions › Apps Script, comme le `doPost`).
   Il fait une **copie** nommée « … 2027 » avec seulement les en-têtes ; le Sheet de 2026 n'est **jamais** touché.
2. Dans la copie › Extensions › Apps Script › Paramètres du projet › Propriétés du script : créer **`TOKEN`** (la même valeur que le secret
   Supabase `APPS_SCRIPT_TOKEN`).
3. Déployer › **Nouveau déploiement** › Application Web (exécuter en tant que moi, accès : tout le monde) › copier l'adresse `/exec`.
4. Supabase › Edge Functions › Secrets › remplacer **`APPS_SCRIPT_URL`** par cette adresse.
5. Approuver **une** fiche de test et vérifier qu'elle apparaît dans le Sheet 2027 (onglet Data). Les onglets « SemXX » se recréent avec Stats.
- ⚠️ Entre 3 et 5, les approbations iraient encore vers l'ancien Sheet : le faire un dimanche ou en dehors des heures d'approbation.
- Ce script n'a pas pu être essayé sur Google d'ici (pas d'accès à ton Drive) : essaie-le d'abord sur une **copie** du Sheet.

## Étape 8 — Outils de sécurité et procédures 💻

### Restauration (si la base est perdue ou abîmée)
Procédure complète : **`docs/ops/restore-procedure.md`**. Contrôle automatique : **`supabase/tests/restore-check.sql`** (lecture seule ; toutes
les lignes doivent dire `ok = true` ; essayé le 2026-11-02 sur la vraie base : tout `ok`).
- [ ] **Vérifier ton forfait Supabase** (Billing) : seul le forfait **Pro** garde des sauvegardes quotidiennes. Sinon, faire la copie manuelle
  de l'étape 2 de la procédure chaque semaine.
- [ ] **Faire un essai de restauration** sur un projet jetable (≈ 1 h), puis **chaque trimestre** et avant la première paie de janvier.
- [ ] Garder dans ton gestionnaire de mots de passe : les secrets Supabase (`APPS_SCRIPT_URL`, `APPS_SCRIPT_TOKEN`, clés d'envoi des
  notifications) et les variables Vercel (`VITE_*`). **Aucune sauvegarde ne les contient.**
- Les **photos** ne sont pas dans la sauvegarde de la base : les télécharger (Justificatifs) avant leur suppression automatique.

### Surveillance (Gestion › Santé › Vérifications automatiques)
Rouge = geste à faire (la ligne le dit). Elle n'envoie **pas** de message sur le téléphone : l'ouvrir une fois par semaine.
Si tu veux un message automatique (SMS ou courriel) en cas de rouge, c'est possible : dis-le à Claude.

### Vérifier la clé OCR.space (lecture des captures)
Il y a **deux** clés à contrôler, parce que la lecture se fait à deux endroits :
1. **Supabase › Edge Functions › Secrets** : le nom `OCR_SPACE_API_KEY` doit être dans la liste (utilisée pour l'inventaire et les preuves de
   temps sup.). Si le nom manque : l'ajouter avec ta clé.
2. **Vercel › Settings › Environment Variables** : `VITE_OCR_SPACE_API_KEY` (utilisée par le remplissage automatique de la fiche de
   temps). Si elle manque, ajouter la clé puis **redéployer** le site. Cette clé est visible dans le code du site : c'est normal pour
   OCR.space, mais n'y mets jamais une clé qui paie à l'usage sans limite.
3. **Test** : sur ton compte, prendre une capture de la fiche de temps et vérifier qu'elle se lit. Une clé absente donne, en période
   chargée, des lectures « à vérifier » en série ou l'erreur « limit reached » dans le texte d'erreur.
4. **Vercel** : Settings › Billing : le forfait **Hobby interdit l'usage commercial** ; passer à **Pro** (≈ 20 $/mois) si ce n'est pas déjà fait.
La clé gratuite permet 25 000 lectures par mois (≈ 4 000–5 000 chez nous).

### Tests automatiques de bout en bout (Playwright)
`npm run e2e` ouvre le site construit dans un vrai navigateur (téléphone et ordinateur) et vérifie : l'ouverture en français, la
redirection d'un visiteur non connecté, l'anglais téléchargé seulement quand on le choisit, un mauvais mot de passe. Les 8 tests passent
(2026-11-02). Avec un compte **de test** (jamais un vrai employé) : `E2E_EMAIL=… E2E_PASSWORD=… npm run e2e` ajoute la connexion.
Ils **n'enregistrent ni n'approuvent** rien. Prochaine étape possible : parcours employé complet sur une base de test (à décider).

## Plus tard (notes gardées, on y reviendra) 📝

Idées proposées le 2026-11-02, **pas demandées pour l'instant** :
- **Détection d'anomalies** pour le gestionnaire : fiches en double, journées de plus de 12 h, km incohérents, employé sans fiche un jour
  ouvrable.
- **Talon consultable par l'employé** (lecture seule) une fois la paie validée.
- **Notifications téléphone pour les notes** (réponse et rappel dû) : `send_push` existe déjà.
- **Journal d'audit consultable** avec filtres (qui a changé quoi) : les données existent, l'écran de lecture est limité.
- **Rapport « Chargé à Britton »** par semaine (dépend de la paie qui lira les options de trajets, étape 6).
- **Mode hors-ligne** : soumission mise en file d'attente avec reprise automatique, pour les chantiers sans réseau (les brouillons
  sont déjà gardés 30 jours sur le téléphone).

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
