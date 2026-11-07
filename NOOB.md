# NOOB.md — Ce qu'il reste à faire, en clair

> Version simple de la liste détaillée dans `CLAUDE.md` §6. Mise à jour : 2026-11-07 (V2.4.239).
> `README.md`, `NOOB.md` et `CLAUDE.md` sont mis à jour **ensemble à chaque version** (un test le vérifie).
> Seulement ce qui reste à faire : ce qui est terminé est retiré (voir l'historique Git). Ce que fait l'app : `README.md`.

## Où on en est

- ✅ **V2.4.239** : quand tu prépares le **rapport mensuel CCQ d'octobre** (Gestion › Rapport CCQ, mois = octobre), un encadré te rappelle d'**ajouter la cotisation annuelle de base à l'AECQ** au paiement (240 $ avant taxes en 2026, 245 $ en 2027). La CCQ la facture à part : site de la CCQ › État de compte › Factures manuelles. Sparklog ne la paie pas et ne l'ajoute pas au fichier : c'est un rappel. Fermer et rouvrir l'application pour recevoir la mise à jour.
- ✅ **V2.4.238** : le rappel d'un congé (une semaine avant) s'affiche maintenant en **bandeau sur toutes les pages**, comme celui de la mise à jour, avec un bouton **OK**. Quand l'employé clique OK, le bandeau ne revient plus pour ce congé. L'OK est gardé dans le navigateur de l'appareil : sur un autre appareil, le bandeau s'affichera encore une fois. La carte « Calendrier CCQ » reste dans le Profil. Fermer et rouvrir l'application pour recevoir la mise à jour.
- ✅ **V2.4.237** : dans l'onglet **Profil**, les employés voient maintenant une carte **« Calendrier CCQ »** avec les prochains congés fériés et les vacances de la construction (les dates viennent de la liste déjà en place, rien à saisir). Une semaine avant un congé, un **bandeau** apparaît en haut du Profil (« commence dans 7 jours »). Pas de notification sur le téléphone pour l'instant : seulement ce bandeau quand l'employé ouvre son Profil. Fermer et rouvrir l'application pour recevoir la mise à jour.
- ✅ **V2.4.236** : tu peux maintenant entrer une date d'embauche **passée** (ex. le 2 novembre) dans la fiche de l'employé, au choix « Nouvel(le) employé(e) ». Avant, seules les dates d'aujourd'hui ou à venir étaient acceptées. Une date passée s'enregistre dans « Date d'embauche ». Fermer et rouvrir l'application pour recevoir la mise à jour.
- ✅ **V2.4.235** : le message rouge « ordre de travail Field Service incomplet » ne revient plus d'un ancien brouillon : il n'apparaît que juste après une capture lue pendant la session en cours. Une fiche saisie à la main n'est jamais bloquée, même si l'OT est tapé (ex. « FORMATION HILO »). Fermer et rouvrir l'application pour recevoir la mise à jour.
- ✅ **V2.4.234** : la case **KM** de la fiche est maintenant **vide** (plus de « 0 » gris qui faisait croire qu'elle était remplie). Elle reste **obligatoire** : taper 0 s'il n'y a pas de km.
- ✅ **V2.4.233** : une fiche **avec un OT de la liste (formation, etc.)** ne peut plus être bloquée par le message rouge « ordre de travail Field Service incomplet ». Ce message restait collé dans le brouillon après un ancien essai de capture. Il faut seulement taper **0** dans KM si la case est vide (le 0 gris est un exemple, pas une valeur).
- ✅ **V2.4.232** : dans **Équipe › Employés**, quand tu choisis **« Nouvel(le) employé(e) »**, le **premier jour de travail peut maintenant être aujourd'hui**
  (avant, il fallait demain ou plus tard). Si c'est aujourd'hui, la personne est tout de suite dans Équipe en direct et la vue semaine ; la date est gardée
  comme date d'embauche. Rien d'autre à faire.
- ✅ **V2.4.231** : dans la feuille de temps, l'encadré rouge **« À vérifier avant d'approuver »** peut maintenant être **replié** d'un clic sur son titre
  (il reste replié la prochaine fois). Chaque alerte a un bouton **« J'ai vu »** qui la fait disparaître : pratique pour les formations où deux employés sont
  sur le même OT. Si une autre job utilise plus tard ce même OT, l'alerte revient toute seule. Un lien **« Réafficher les alertes vues »** les ramène. C'est
  retenu **dans ce navigateur seulement** (sur un autre appareil il faut recliquer) ; ça ne change rien aux jobs ni à l'approbation. Même chose dans « À traiter ».
- ✅ **V2.4.230** : à l'inscription et au changement de mot de passe, le message d'erreur dit maintenant **la vraie raison** (il manque une minuscule, une
  majuscule, un chiffre ou un symbole ; trop court ; ou mot de passe connu dans une fuite). La règle est écrite sous le champ, et l'ancien message
  **disparaît dès qu'on modifie un champ**. Rien à faire de ta part.
- ✅ **V2.4.229** : la **politique de confidentialité** est préparée : `docs/governance/politique-confidentialite.md`. Elle dit en mots
  simples ce que l'app garde sur les employés, pourquoi, qui y a accès, où c'est hébergé (États-Unis, donc à signaler), combien de
  temps, comment protéger, comment demander à voir ou corriger ses renseignements (réponse en 30 jours), et quoi faire en cas
  d'incident. **À faire :** remplir les passages entre crochets (surtout **la personne responsable**, **les durées de conservation**
  à confirmer avec la comptable et **les fournisseurs**), faire relire par un conseiller, puis publier sur le site de l'entreprise.
- ✅ **V2.4.228** : le point « coller le `doPost` dans Google » est retiré (fait le 2 novembre). Nouvelle section **« Loi 25 »** plus bas :
  ce que la loi demande, ce que l'app fait déjà, et la liste de ce qui reste à faire pour être en règle (personne responsable,
  politique de confidentialité, registre d'incidents, hébergement hors Québec, durées de conservation).
- ✅ **V2.4.227** : une **lettre de consentement** pour utiliser Sparklog comme punch est dans `docs/governance/consentement-sparklog-punch.md`.
  **À faire :** remplir les passages entre crochets, vérifier les renvois à l'AECQ et à l'Annexe N contre le texte officiel, puis la faire signer
  à chaque employé.
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
  maintenant la règle des 65 km (premier trajet payé). Le bouton **« Inventaire du crew »** est retiré de la page Inventaire. (Le script Google a été mis à jour et redéployé le 2 novembre 2026.)
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

## Étape 5 — Améliorations techniques 💻

Claude peut les faire quand tu veux. Ça ne bloque pas la paie.

- [ ] **CNESST sur le salaire admissible (trou du calcul)** : l'app calcule la CNESST (3,17 %) sur tout le
  salaire, alors que le vrai relevé ne la calcule que sur un « salaire admissible ». Le coût CNESST est donc
  **trop élevé** dans DAS, Calcul et Coûts. À corriger dès que la règle de l'excédent est connue (étape 1).
- [ ] **Heures payées la nuit d'un changement d'heure** : la paie compte l'heure affichée. Quelqu'un qui travaille
  pendant l'heure répétée de l'automne est payé 1 h de moins (au printemps, 1 h de trop). À corriger seulement si ça
  arrive, avec l'accord du comptable.
- [ ] **Optimisations proposées** (le 2026-10-27, rien ne change pour la paie ; dis lequel tu veux) :
  - **Ménage des fonctions serveur** : 3 fonctions encore en ligne chez Supabase ne sont plus dans le code (`send_sms`,
    une vieille copie de la lecture des preuves, une purge ponctuelle de septembre) et 4 du code ne sont plus appelées
    par l'app (`push_approved_to_sheet`, `send_announcement`, `classify_week`, `reset_employee_password` : à vérifier).
    Moins de portes ouvertes sur le serveur.
  - **Ménage de l'écran** : le code de l'ancienne V2 qui reste caché derrière des options (fiche employé, feuilles de
    temps, déblocage, paramètres, rapport CCQ), 2 vieux écrans jamais affichés (annonces, soupers) et 2 paquets
    inutilisés. App plus légère, moins de risques d'erreur.
  - **Notification sur le téléphone** quand Karine répond à une note partagée ou quand un rappel arrive (aujourd'hui :
    dans l'app seulement).
  - **Deux gestionnaires approuvent la même fiche en même temps** : prévenir le second que la fiche a changé depuis
    qu'il l'a ouverte.
  - **Une seule langue téléchargée** (français ou anglais) : app un peu plus rapide à ouvrir.
  - **Colonne inutile** dans la base (`return_overtime_no_benefits`, remplacée en octobre) : la retirer.

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

- [ ] **Courriels d'inscription (SMTP)** : si « Confirm email » a été désactivé pour une arrivée en groupe, le
  réactiver. Un **SMTP** est un service d'envoi de courriels (Brevo, Resend, SendGrid, Google Workspace…) : le brancher
  dans Supabase › Authentication › Emails enlève la limite de quelques courriels par heure du service intégré.

- [ ] **Remplissage automatique (capture Field Service)** : si un employé reste bloqué (« Enregistrement
  bloqué »), il touche **(Détails) › Voir le texte lu sur la capture › Copier le texte** et te l'envoie ;
  donne ce texte à Claude pour corriger la lecture. Bonne pratique : capture de l'onglet **Bilan** avec
  « Heure de début » visible en haut et les deux distances (miles et km) en bas.
- [ ] **Cotisation annuelle AECQ** : 240 $ en 2026, 245 $ en 2027 (avant taxes), facturée par la CCQ à part avec le rapport
  d'octobre (site de la CCQ › État de compte › Factures manuelles). **Celle de 2026 n'est pas payée** (oubli avec le
  changement du site de la CCQ) : à payer. Sparklog ne l'ajoute pas automatiquement : il affiche un rappel dans le rapport
  CCQ d'octobre (V2.4.239).
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

## Loi 25 — protection des renseignements personnels 🔒 👤 🧾 💻

> Résumé en mots simples, pour savoir quoi faire. **Ce n'est pas un avis juridique** : à valider avec un avocat ou un conseiller
> en protection des renseignements personnels. Sources officielles : Commission d'accès à l'information (cai.gouv.qc.ca) et
> quebec.ca (rechercher « Loi 25 »). La loi a été mise en application par étapes de septembre 2022 à septembre 2024 : **tout
> est maintenant en vigueur**.

### C'est quoi, et est-ce que ça nous concerne ?
La **Loi 25** (ancien projet de loi 64, adopté en 2021) change les règles de la protection des **renseignements personnels** (tout
ce qui permet d'identifier une personne) dans les entreprises du Québec. Elle vise **toutes les entreprises, même petites**, donc
Messier Connexion. Ici, les personnes concernées sont surtout **les employés** (et leurs proches si on en garde).

Ce que Sparklog et Messier gardent : nom, courriel, téléphone, date de naissance, **NAS** (très sensible), carte CCQ et sa photo,
formulaires d'impôt (TD1, TP-1015.3), salaire, heures, trajets, **registre d'accidents** (santé : sensible), photos de preuves
(temps supplémentaire, stationnement), notes des gestionnaires.

### Ce que la loi demande (les 10 points)
1. **Une personne responsable** de la protection des renseignements. Par défaut, c'est la personne qui dirige l'entreprise ; elle
   peut désigner quelqu'un **par écrit**. Son **titre et ses coordonnées doivent être publiés** (site de l'entreprise).
2. **Une politique de confidentialité** publiée en **langage simple** : quels renseignements, pourquoi, qui y a accès, combien
   de temps on les garde, comment demander à les voir ou à les corriger, à qui écrire.
3. **Ne prendre que le nécessaire** et **dire pourquoi** à la personne (un avis à l'embauche suffit pour ce qui est nécessaire à
   l'emploi). Pour le reste (ex. : une photo utilisée autrement), un **consentement clair, libre et éclairé**.
4. **Incidents de confidentialité** (courriel envoyé à la mauvaise personne, téléphone perdu avec l'app ouverte, compte piraté,
   talon vu par quelqu'un qui n'y a pas droit) : **tenir un registre** de tous les incidents, et, s'il y a un **risque sérieux de
   préjudice**, **aviser la Commission (CAI) et les personnes touchées « avec diligence »**.
5. **Évaluation des facteurs relatifs à la vie privée (ÉFVP)** : une analyse écrite **avant** d'acheter ou de changer un système
   informatique qui contient des renseignements personnels, et **avant d'envoyer des renseignements hors du Québec** (on doit
   vérifier qu'ils seront bien protégés et avoir une **entente écrite**).
6. **Garder seulement le temps nécessaire**, puis **détruire ou anonymiser** (sauf si une autre loi oblige à garder : paie,
   relevés d'emploi, CNESST, CCQ…).
7. **Les droits des personnes** : voir leurs renseignements, les faire corriger, savoir à qui ils sont communiqués, et, depuis
   septembre 2024, **les obtenir dans un format utilisable (portabilité)**. **Réponse dans les 30 jours.**
8. **Décision prise uniquement par un traitement automatisé** : la personne doit en être informée. Nos calculs de paie sont
   revus par un humain, donc probablement non visés (à confirmer).
9. **Sécurité proportionnelle à la sensibilité** des renseignements (le NAS et la santé demandent plus).
10. **Sanctions** (d'après l'aperçu que tu as trouvé) : sanctions administratives jusqu'à **10 M$ ou 2 % du chiffre d'affaires
    mondial**, amendes pénales jusqu'à **25 M$ ou 4 %**, et un employé peut poursuivre en dommages.

### Ce que l'app fait déjà pour toi ✅
- **NAS chiffré** dans un coffre, visible seulement par la propriétaire, chaque consultation notée au Journal.
- **Authentification à deux étapes** obligatoire pour les gestionnaires et la propriétaire.
- **Chaque employé ne voit que sa propre fiche** ; les gestionnaires voient seulement ce que leur rôle permet.
- **Les photos de preuves sont supprimées automatiquement après 30 jours.**
- **Un Journal** des actions sensibles (changements de rôle, de taux, accès au NAS…).
- Les comptes en pause ne peuvent plus rien écrire.

### Ce qu'il reste à faire pour être en règle
- [ ] 👤 **Nommer par écrit la personne responsable** et **publier son titre et son courriel** (page du site de l'entreprise).
- [ ] 👤 **Publier la politique de confidentialité** : **le brouillon est prêt** dans `docs/governance/politique-confidentialite.md`
  (écrit à partir de ce que fait vraiment l'app). Remplir les passages entre crochets (nom de l'entreprise, personne
  responsable, durées de conservation avec la comptable, ententes avec les fournisseurs), la faire relire par un conseiller,
  puis la publier sur le site de l'entreprise.
- [ ] 👤 **Avis aux employés à l'embauche** : quels renseignements on garde, pourquoi, qui y a accès, combien de temps, à qui
  écrire. **La lettre de consentement est déjà préparée** :
  `docs/governance/consentement-sparklog-punch.md` (à remplir, à valider, à faire signer). Un accusé de réception signé (ou une case à cocher dans l'app, que Claude peut ajouter).
- [ ] 👤 **Registre des incidents** : un simple tableau (date, ce qui s'est passé, qui est touché, risque de préjudice sérieux ?,
  mesures prises, CAI avisée oui/non). Claude peut en faire un petit écran dans l'app, comme le Registre d'accidents.
- [ ] 👤 🧾 **ÉFVP : les renseignements sortent du Québec.** La base de données de Sparklog est hébergée **aux États-Unis**
  (Supabase, région « us-west-2 »). Les autres services qui touchent des renseignements : Vercel (le site), Google (Sheets et
  Apps Script), OCR.space (lecture des captures d'écran), le service de courriels. Il faut **une analyse écrite et des ententes
  avec ces fournisseurs**. Option à discuter avec Claude : déplacer la base dans une région canadienne (Montréal).
- [ ] 👤 🧾 **Durées de conservation** : demander à la comptable combien de temps garder les talons, relevés d'emploi, dossiers
  CNESST et CCQ, puis **détruire** le reste (ex. : fiches d'un ancien employé). Claude peut préparer une purge.
- [ ] 👤 **Procédure de demande d'accès / correction** : à qui l'employé écrit, qui sort le dossier, réponse sous 30 jours.
- [ ] 👤 **Expliquer aux gestionnaires** les bons réflexes : pas de talons ni de NAS par courriel ordinaire, verrouiller le
  téléphone, signaler tout incident tout de suite.
- [ ] 💻 **Idées d'ajouts à l'app** (sur demande) : bouton « Exporter mes renseignements » pour un employé (portabilité), registre
  d'incidents, case d'accusé de réception de la politique, purge des anciens employés.

### Si un incident arrive (4 réflexes)
1. **Arrêter la fuite** (changer le mot de passe, retirer l'accès, rappeler le courriel).
2. **Le noter dans le registre** le jour même.
3. **Évaluer le risque** : le NAS, la santé ou des données bancaires sont des cas sérieux.
4. Si le risque est sérieux : **aviser la CAI et les personnes touchées sans tarder**, puis corriger la cause.

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
