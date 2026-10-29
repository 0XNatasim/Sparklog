# NOOB.md — Ce qu'il reste à faire, en clair

> Version simple de la liste détaillée dans `CLAUDE.md` §6. Mise à jour : 2026-10-29 (V2.4.200).
> `README.md`, `NOOB.md` et `CLAUDE.md` sont mis à jour **ensemble à chaque version** (un test le vérifie).
> Seulement ce qui reste à faire : ce qui est terminé est retiré (voir l'historique Git). Ce que fait l'app : `README.md`.

## Où on en est

- ✅ **V2.4.200** : dans le **Registre d'accidents**, chaque dossier accepte des **fichiers** : photos, PDF, Word, Excel,
  texte (10 Mo chacun, 20 au plus). Bouton « Ajouter des fichiers » dans le dossier ; pour un nouveau dossier, les fichiers
  choisis partent quand on enregistre. On clique un fichier pour l'ouvrir, la corbeille le retire (avec confirmation).
  Seuls les gestionnaires les voient ; le Journal note chaque ajout et chaque retrait. **À faire : appliquer la migration
  0123 dans Supabase** (elle crée l'espace de stockage privé).
- ✅ **V2.4.199** : dans Inventaire, le bouton **« Minimums par entrepôt »** ouvre sa propre page : la liste des
  entrepôts, avec **Oui / Non** (« Compter cet entrepôt ? »). Non = on n'ira pas plus loin avec cet entrepôt. Oui = la
  liste des appareils avec le **minimum** (ratio par employé × employés du groupe) et, à côté, le **total des
  inventaires** des employés de l'entrepôt ; en rouge, ce qui est sous le minimum. Seuls les entrepôts à « Oui » donnent
  l'alerte. Les 74 minimums du tableau de Karine sont déjà saisis. **À faire : mettre « Oui » pour Alma (Saguenay),
  Charlevoix et Rimouski.**
- ✅ **V2.4.198** : **stock minimum par entrepôt**. Dans Inventaire, bouton « Minimums » : choisissez l'entrepôt (un groupe),
  un appareil et un **ratio par employé** (ex. 0,5 thermostat par employé). Le minimum = ratio × nombre d'employés du
  groupe. Si le stock des derniers inventaires passe sous le minimum, l'appareil s'affiche en rouge en haut de la page
  Inventaire et la pastille d'Inventaire s'allume. **À faire : appliquer la migration 0121 dans Supabase**, puis
  vérifier que chaque entrepôt est bien un groupe avec ses employés (Équipe › Groupes).
- ✅ **V2.4.197** : nouveau **Registre d'accidents** (menu Équipe, gestionnaires seulement). « Nouveau dossier » : date,
  la personne, la gravité, ce qui s'est passé, les soins, les jours perdus, le numéro CNESST, les mesures correctives.
  Un dossier se ferme (ou se rouvre), il ne s'efface jamais. Le menu affiche le nombre de dossiers ouverts. Les employés
  ne le voient pas. **À faire : appliquer la migration 0120 dans Supabase.**
- ✅ **V2.4.196** : les carrés « Cette semaine » / « Semaine passée » montrent les km du jour sous les heures. La feuille
  manuelle du gestionnaire demande les km (**0 est accepté, vide non**). Le Sommaire (et son impression) sépare le temps
  régulier et le temps supplémentaire des sous-traitants en colonnes différentes.

- 🔴 **À faire en premier : la paie des semaines 43 et 44.** La semaine 43 (11 au 17 octobre) est la **première payée
  par Sparklog**. Au 2026-10-27 : semaine 43, 328 fiches soumises mais pas approuvées (21 approuvées) ; semaine 44
  (18 au 24 octobre), 440 soumises, aucune approuvée ; rien n'est encore comptabilisé. Dans l'ordre, une semaine à la
  fois : **À traiter** (approuver) › **Paie › Paie de la semaine** (« Calculer et comptabiliser ») › imprimer les talons.
  La semaine 44 attend que la 43 soit comptabilisée (le cumul de l'année suit d'une semaine à l'autre).
- 🕐 **Dimanche 1er novembre, changement d'heure** : de 1 h à 1 h 59 arrive deux fois. Un employé qui commence ou finit
  dans cette heure-là reçoit un message : il envoie ses heures au gestionnaire. Karine (ou toi) entre la fiche dans
  **Gestion › Admin › Feuille de temps d'urgence** et répond « 1re fois (avant de reculer) » ou « 2e fois (après) ».
  Très rare (aucune fiche de nuit jusqu'ici). La paie compte l'heure affichée, pas le temps réel (étape 5).
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
