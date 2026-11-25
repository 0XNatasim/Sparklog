# NOOB.md — Ce qu'il reste à faire, en clair

> Version simple de la liste détaillée dans `CLAUDE.md` §6. Mise à jour : 2026-11-17 (V2.4.330).
> `README.md`, `NOOB.md` et `CLAUDE.md` sont mis à jour **ensemble à chaque version** (un test le vérifie).
> Seulement ce qui reste à faire : ce qui est terminé est retiré (voir l'historique Git). Ce que fait l'app : `README.md`.

## Où on en est

### À faire maintenant (par vous)

- [ ] **Migration 0145** (refus d'un OT au-delà de la ligne sans sa capture, V2.4.272) : à appliquer. À partir de là, 2 OT au-delà de 8 h = 2 captures obligatoires pour pouvoir soumettre.

- [ ] **Migration 0144** (preuve par OT, V2.4.271) : à appliquer. Elle fait que chaque capture reste sur son OT et donne à l'employé le droit de voir, remplacer, retirer ou ajouter la capture de ses propres fiches non soumises.

- [ ] **Migration 0143** (preuve par OT, V2.4.269) : à appliquer **avant** de dire aux employés de mettre à jour. Elle enlève la limite « une seule preuve par fiche ».

- [ ] **Inventaire fin de mois (V2.4.268)** : appliquer la **migration 0142**, **redéployer `cleanup_overtime_evidence`**, puis planifier le premier jour dans Inventaire › Inventaire fin de mois.
  À confirmer : 5 à 10 captures (ce qu'on a décidé), et le délai de 60 jours pour les garder.

- [ ] **Conformité (convention collective, Loi R-20, Loi 25) — étape P0 de `OFFICIEL.md`** : un **avis juridique / AECQ** sur les points marqués « À VALIDER » ; **nommer le
  responsable** de la protection des renseignements ; **choisir l'hébergeur au Québec** et lui demander ses certificats (ISO 27001, SOC 2 Type 1 et 2, ou « Cybersécuritaire Canada »).
  Ensuite on commence la P1 (consentement exprès, avis à l'employé pour la feuille d'urgence, politique de confidentialité).
- [ ] **Redéployer `classify_week`** (moteur 2.10.0, aucun changement de calcul, seulement le numéro de version affiché) et, si ce n'est pas fait, **recoller le script Google**
  `apps-script-doPost.js` (colonne « Minimum 8 h (min) » du contremaître : Déployer › Gérer les déploiements › Modifier › Nouvelle version).
- [ ] **Petite faille à fermer quand vous voulez** (faible risque) : un contremaître qui sait faire une requête à la main pourrait créer **sa propre note** avec une fausse étiquette
  « Retournée par … ». Effet : une étiquette trompeuse, rien d'autre (ni fiches, ni heures, ni paie, ni journal). **Solution prête** (détail dans `CLAUDE.md` §6.3) : une petite migration + un test.
- [ ] **À décider** (règle « 4 jours de 10 h ») : une 5e journée dans la semaine (les 40 h) et un férié en semaine.
- [ ] **À confirmer** (règle du contremaître) : le minimum de 8 h seulement du lundi au vendredi, sans complément le samedi, le dimanche ni les fériés.

- 🔴 **À faire en premier : la paie des semaines 43 et 44.** La semaine 43 (11 au 17 octobre) est la **première payée
  par Sparklog**. Au 2026-11-01, pour les semaines 43 et 44 ensemble (11 au 24 octobre) : 745 fiches soumises mais pas approuvées
  et 44 approuvées ; rien n'est encore comptabilisé. Dans l'ordre, une semaine à la
  fois : **À traiter** (approuver) › **Paie › Paie de la semaine** (« Calculer et comptabiliser ») › imprimer les talons.
  La semaine 44 attend que la 43 soit comptabilisée (le cumul de l'année suit d'une semaine à l'autre).
- [ ] **Migration 0146** (V2.4.274) : à appliquer. Elle fait commencer la règle « une capture par OT au-delà de 8 h » le **16 novembre** (et non le 17).
- [ ] **Migration 0147 + fonction (V2.4.278)** : à appliquer **avant** de redéployer `process_overtime_evidence` (file d'attente : une lecture par minute). Dis « Applique la 0147 » puis « Redéploie la fonction ».
- [ ] **OCR : clé du service de lecture (V2.4.277)** : **37 captures « illisibles » sur 59 lues les 16-17 novembre, c'était en fait le service OCR.space qui refusait les demandes (erreur 429 « trop de demandes »)**, pas les captures. Cause probable : la clé OCR.space est la clé de démonstration partagée (« helloworld ») ou un forfait gratuit épuisé. **À faire :** créer ta propre clé gratuite sur ocr.space (25 000 lectures par mois), puis la mettre dans Supabase › Edge Functions › Secrets sous le nom `OCR_SPACE_API_KEY` (ne la colle jamais dans le chat). Ensuite, dans À traiter › OCR, bouton **« Remettre les échecs en file »**.
- [ ] **Migrations 0148 et 0149 + fonction (V2.4.281)** : appliquer la 0148 puis la 0149, puis redéployer `process_overtime_evidence` (je le fais sur demande). Je remets ensuite en file les 7 preuves « conformes » où seul le numéro d'OT avait été lu, pour qu'elles soient relues avec la nouvelle règle.
- [ ] **Migration 0150 (V2.4.285)** : à appliquer (« Applique la 0150 »), sinon « Relire » ne marche que sur les échecs.
- [ ] **Migration 0151 (V2.4.286)** : à appliquer (« Applique la 0151 ») pour pouvoir activer le bouton « Renvoyer pour correction ».
- 🟢 **V2.4.330 — « Conforme » à tort.** Une capture où le lecteur n'avait trouvé que le numéro d'OT (aucune minute) était marquée « Conforme ». Maintenant elle est « Illisible » : seules les minutes prouvent le temps supp. Dix captures étaient dans ce cas le 24 nov. et avant. Rien à faire de votre côté.
- 🟠 **V2.4.329 — Captures « illisibles » alors que le 0 est coché à la question 3.** Le lecteur perdait parfois la ligne « 0 » de la liste ; il la remet maintenant à sa place. **À faire :** dites « Déploie la fonction », puis « Tout relire » dans l'onglet OCR. Si certaines restent illisibles, la fonction écrit maintenant dans son journal où elle a vu le cercle et les lignes : je pourrai trouver la cause.
- 🟢 **V2.4.328 — Le « 1 » et le « 2 » étaient inversés.** Le « 1 » est maintenant la capture qui lit le OT (et le temps chez le client), le « 2 » celle du retour, peu importe laquelle a été envoyée en premier. Rien à faire de votre côté.
- 🟢 **V2.4.327 — OCR, vue « Par preuve » : plus de Britton, deux captures dans une même boîte.** Cette vue compare seulement la preuve et la fiche de travail Sparklog (Britton reste dans « Par OT »). Les 2 captures d'un même OT sont dans une boîte au contour plus foncé, avec un petit « 1 » et « 2 » à côté du nom. Le bouton **Télécharger** de l'onglet OCR peut maintenant prendre **un seul jour** (menu « Jour » sous la semaine), pas seulement la semaine. Rien à faire de votre côté.
- 🟢 **V2.4.326 — OCR, vue « Par preuve » : le OT en trois colonnes** (Britton · Preuve · Fiche), comme « Par OT ». Un OT qui diffère des autres est en rouge ; une capture de SMS affiche « SMS ». Rien à faire de votre côté.
- 🟠 **V2.4.325 — Colonne « Résultat » de l'onglet OCR** : le lecteur dit maintenant ce que c'est : **Field** (une fiche Field Service), **SMS**, **Vieux Form** (l'ancien formulaire « Temps réel de TS », dès le 23 nov.) ou le nouveau formulaire. Pour une preuve valable : **Écart / fiche** (la preuve diffère de la fiche de temps), **Écart / Britton** (diffère de la ligne de Britton) ou **Écart / fiche / Britton** (la ligne de Britton et la fiche de temps diffèrent entre elles). Le nom de l'employé n'est vert que si tout concorde. **À faire dans l'ordre : appliquer la migration 0161, redéployer la fonction `process_overtime_evidence`, puis « Tout relire »** (dis « Applique la 0161 » puis « Déploie la fonction »). Le sens des trois « Écart » est ma lecture de ta demande : dis-moi si tu le veux autrement.
- 🟠 **V2.4.324 — Meilleure lecture du nouveau formulaire de surtemps** : une capture qui ne montre qu'une partie du formulaire (sans le titre, seulement la question 2 ou seulement la question 3) n'est plus refusée comme « mauvaise capture » : tout ce qu'on voit du formulaire compte. L'OT de la question 1 est de nouveau lu et affiché à côté de la réponse cochée. Les cercles cochés minces ou à moitié cachés (barre du bas du téléphone) sont aussi trouvés, ainsi que la réponse d'un formulaire déjà envoyé (iPhone : rond gris plein). Une capture dont le titre de la question est sorti de l'écran est quand même lue (question 2 grâce à l'aide en dessous, question 3 grâce à « Commentaire »). **À faire : redéployer la fonction `process_overtime_evidence`** (dis « Déploie la fonction »), puis « Tout relire » dans l'onglet OCR (les captures déjà refusées se corrigent comme ça). Vérifié sur 5 vraies captures du 23 nov. pour la détection du cercle ; la lecture du texte par le service OCR reste à contrôler.
- 🟢 **V2.4.323 — Onglets consultés par les gestionnaires** : dans Avancé › Journal, un nouvel onglet **Onglets consultés** (visible par toi seulement) montre, pour chaque gestionnaire et chaque jour, les pages et onglets ouverts et combien de fois. Rien n'est connu avant l'activation : le compte commence à partir de la migration. **À faire : appliquer la migration 0159.** Seuls les noms des pages sont gardés. Pense à en parler aux gestionnaires (politique de confidentialité).
- 🟠 **V2.4.322 — Deux captures d'un coup** : à l'étape de la preuve de temps supp., l'employé choisit **deux captures** (« Durée réelle du temps supplémentaire » et « Durée du retour »), chacune avec son bouton ; « Envoyer les 2 captures » s'allume quand les deux sont choisies. Les deux partent avec la fiche en une seule opération, avant la soumission : plus besoin de passer par l'horloge de l'Historique pour la deuxième. **À faire : appliquer la migration 0160 avant de publier** (dis « Applique la 0160 »).
- 🟢 **V2.4.321 — Nouveau formulaire de surtemps** : le formulaire a changé (deux questions à choix : « Durée réelle du temps supplémentaire » et « Durée du retour »). Sparklog lit maintenant le cercle coché sur la capture et en tire les minutes ; l'OT ne vient plus du formulaire (il vient de la fiche). « + de 120 minutes » s'affiche « 120+ ». Fonction `process_overtime_evidence` redéployée (v16) ; ensuite « Tout relire » dans l'onglet OCR et contrôle de 2 ou 3 vraies captures (pas encore vérifié sur une vraie lecture du service OCR).
- 🟢 **V2.4.319 — Télécharger la semaine** : dans la feuille de temps, un bouton **Télécharger la semaine** (à gauche de « Snapshot de la semaine ») donne toute la semaine en tableau Excel : une ligne par employé, heures et km de chaque jour, totaux de la semaine et temps payé (arrondi). Le même bouton est dans le snapshot, pour la semaine choisie. Rien à appliquer dans la base.
- 🟢 **V2.4.318 — Ouvrir dans un onglet séparé** : les onglets de chaque page de gestion (À traiter › OCR, Temps, Paie…) et les boutons « Snapshot de la semaine » / « Semaine passée » sont de vrais liens : clic droit (« Ouvrir dans un nouvel onglet »), clic molette ou Ctrl + clic les ouvrent dans leur propre onglet du navigateur, pour en avoir 2, 3 ou 4 côte à côte. Un clic normal fonctionne comme avant. Rien à appliquer dans la base.
- 🟢 **V2.4.317 — « Par OT » : un groupe OT (Britton · Preuve · Fiche)** : la colonne OT unique est remplacée par un groupe **OT** de trois colonnes, comme « Chez le client » et « Retour » : l'OT tel que **Britton** le dit, tel que lu sur la **preuve de temps** et tel qu'écrit sur la **fiche de travail**. Un OT qui diffère des autres est en rouge ; la colonne de la preuve dit « SMS » pour une capture de message texte. Pareil dans le fichier téléchargé. Rien à appliquer dans la base.
- 🟢 **V2.4.316 — « Par OT » montre le nom, l'OT et le jour du tableau Britton** : quand une ligne a une ligne Britton, la **date, le nom et l'OT** affichés (dans l'app et dans le fichier téléchargé) sont ceux de **Britton** — c'est sa colonne « Date » qui range le jour, et le menu « Jour » la suit ; le jour de la fiche n'apparaît en petit dessous que s'il est différent. Une ligne sans ligne Britton garde ceux de la fiche. Rien à appliquer dans la base.
- 🟢 **V2.4.315 — Tableau Britton : le jour d'une ligne est de nouveau la colonne « Date »** : correction de ma version du 21 nov. — le jour d'une ligne est la colonne **« Date » / « Date installation »**, pas l'heure de fin (l'heure de fin ne sert que pour l'heure, et pour le jour quand « Date » est vide). **À faire : réimporter les deux fichiers (16-18 nov. et 19-20 nov.)** pour que les jours enregistrés suivent la colonne « Date » ; une ligne réimportée remplace sa copie. Rien à appliquer dans la base.
- 🟢 **V2.4.314 — Fichier téléchargé : nom et OT bons en vert** : quand Britton a une ligne pour la fiche (« Tout concorde », « Britton diffère », « Preuve diffère », « Sans preuve »), le **nom et l'OT sont en vert gras**. Quand Britton n'a pas de ligne : l'OT est rouge, le nom vert si la personne est dans le tableau de Britton, rouge sinon. Rien à appliquer dans la base.
- 🟢 **V2.4.313 — Fichier téléchargé : chiffres en vert quand tout concorde** : sur une ligne « Tout concorde » (vert pâle), les **chiffres** sont aussi en **vert gras**, comme le nom d'une personne qui est dans le tableau de Britton. Rien à appliquer dans la base.
- 🟢 **V2.4.312 — La capture du message texte s'appelle « SMS » ; nom vert / rouge quand pas chez Britton** : la capture du **message texte** « Demande de temps supplémentaire approuvé… » (au lieu de la capture du formulaire) n'est plus appelée « Mauvaise capture » : elle s'appelle simplement **« SMS »**. **Ce n'est pas une preuve valable** : elle reste à vérifier (comme une mauvaise capture) et compte comme « Sans preuve » dans « Par OT », où les colonnes de la preuve disent « SMS ». Quand Britton n'a **pas de ligne** pour un OT, l'**OT est en rouge** ; le **nom est en vert** si la personne **est** dans le tableau de Britton autour de cette journée (donc l'OT est probablement le mauvais) et en **rouge** si elle n'y est pas du tout ; une remarque donne l'OT que Britton a pour elle (ex. Alexandre : OT 231731). **À faire : appliquer la migration 0158 et redéployer la fonction `process_overtime_evidence`** (dites « Applique la 0158 et redéploie »), puis « Tout relire » dans l'onglet OCR pour les captures déjà marquées « Mauvaise capture ».
- 🟢 **V2.4.311 — « Pas chez Britton » en rouge ; colonnes de l'onglet OCR groupées comme le fichier** : quand Britton n'a **aucune ligne** pour un OT (« Pas chez Britton »), le **nom et l'OT sont en rouge**, dans le tableau et dans le fichier téléchargé. Dans l'onglet OCR, la vue **« Par preuve »** a maintenant le même en-tête sur 2 lignes que le fichier : **Chez le client** / **Retour** au-dessus de Britton · Preuve de temps · Fiche de travail (la colonne Britton seulement si un tableau Britton est importé). Rien à appliquer dans la base.
- 🟢 **V2.4.310 — « Modifier les minutes » : soumettre pour l'employé** : dans le même écran (Avancé › Feuille de temps d'urgence), chaque fiche **enregistrée ou à mettre à jour** a un bouton **« Soumettre la fiche »**, et un bouton du haut soumet **toutes les fiches pas encore soumises du jour** avec une seule raison. La preuve de temps supp. et l'inventaire de fin de mois ne sont pas demandés (comme pour la saisie d'urgence) ; les heures, le chevauchement et les km sont quand même vérifiés. Tout est écrit au Journal avec la raison. **À faire : appliquer la migration 0157** (dites « Applique la 0157 » et je le fais).
- 🟢 **V2.4.309 — Fichier Excel du tableau comparatif : plus serré** : l'en-tête est maintenant sur **2 lignes** (en haut « Chez le client » et « Retour », en dessous Britton · Preuve de temps · Fiche de travail ; les autres colonnes couvrent les 2 lignes) et les colonnes de chiffres sont beaucoup plus étroites. Rien à appliquer dans la base.
- 🟢 **V2.4.308 — Fichier Excel du tableau comparatif : lignes en couleur** : dans le fichier téléchargé, une ligne où **tout concorde** est en **vert pâle** ; une ligne où **tout est là mais il y a une différence** (« Britton diffère », « Preuve diffère ») est en **orange pâle** ; les autres lignes (pas chez Britton, pas dans Sparklog, sans preuve) restent blanches. Le chiffre qui diffère reste en rouge. Rien à appliquer dans la base.
- 🟢 **V2.4.307 — Tableau comparatif : une « Remarque » qui explique l'écart** : sous le résultat (et dans une colonne du fichier Excel), une phrase dit pourquoi une ligne ne concorde pas : « OT fait 1 jour avant la fin chez Britton » ; « cet employé a cet OT le … » ; « aucun OT comme celui-là pour cette personne : ses OT dans Sparklog sont … Mauvais numéro d'OT ? » ; « Britton a une ligne de cette personne sur un autre OT » ; « aucune fiche ces jours-là ». C'est seulement une piste : rien n'est rapproché en devinant. Rien à appliquer dans la base.
- 🟢 **V2.4.306 — Tableau comparatif : le jour de fin chez Britton** : dans « Par OT », le menu « Jour » trouve aussi une ligne par le jour où la ligne Britton **se termine** (travail fait le 19, formulaire rempli le 20 : visible sous les deux jours). La colonne Date affiche « Britton : fin le 20 nov. » quand c'est différent. Rien à appliquer dans la base.
- 🟢 **V2.4.305 — Import Britton : ancien tableau du 16 au 18 nov.** : le bouton d'import lit maintenant aussi l'ancien tableau (colonnes « Prénom Nom », « Entreprise », « Numéro du OT », « client », « Auto », « heure total »). Vous pouvez importer le fichier .csv ou .xlsx du 16 au 18 tel quel ; les jours 16, 17 et 18 auront alors leurs données Britton dans le tableau « Par OT ». Rien à appliquer dans la base.
- 🟢 **V2.4.304 — Tableau comparatif : colonnes regroupées et téléchargement Excel** : dans À traiter › OCR › **« Par OT (Britton · Preuve · Fiche) »**, les colonnes sont maintenant regroupées par thème : **Chez le client** (Britton → Preuve de temps → Fiche de travail) puis **Retour** (même ordre), dans l'app **et** dans le fichier. Nouveau bouton **« Télécharger (Excel) »** : il donne les lignes affichées (avec le filtre choisi : à vérifier, un verdict, un jour, une recherche) dans un tableau **.xlsx, sans aucune image**, avec le chiffre qui diffère **en rouge**, la première ligne figée et un filtre sur les colonnes. Le fichier s'appelle « comparaison temps supp » suivi des jours (ex. « 2026-11-16 au 2026-11-20 »). Sur cet écran, le formulaire s'appelle maintenant **« Preuve de temps »** et la feuille de temps Sparklog **« Fiche de travail »**. Rien à appliquer dans la base.
- 🟢 **V2.4.303 — Importer Britton : la date vient de « Heure de fin »** : la colonne G (**Date installation**) est la date de soumission, elle est maintenant **ignorée**. Le jour d'une ligne Britton est la date de son **« Heure de fin »**, et une ligne Britton est rapprochée de la fiche Sparklog du **même OT** faite le même jour ou **jusqu'à 2 jours avant** (formulaire rempli le lendemain matin ou après une fin de semaine). Les lignes déjà importées sont relues avec leur heure de fin : **pas besoin de réimporter** (réimporter le même fichier remplace les lignes, sans doublon). La ligne qui n'avait pas de date d'installation est maintenant lue. Rien à appliquer dans la base.
- 🟢 **V2.4.302 — Comparer le temps supp. OT par OT (Britton · Form · Sparklog)** : dans À traiter › OCR, une fois le tableau Britton importé, un bouton **« Par OT (Britton · Form · Sparklog) »** apparaît. Il affiche **une ligne par OT** avec, pour chaque source, les minutes **chez le client / retour** : ce que Britton a approuvé, ce que l'employé a écrit sur le formulaire, et ce que dit la feuille de temps Sparklog. Le chiffre qui diffère des deux autres est **en rouge**. Un verdict en couleur : **Tout concorde**, **Sans preuve** (Britton et feuille de temps concordent mais pas de capture), **Form diffère** (l'employé s'est trompé), **Britton diffère**, **Pas chez Britton** (du temps supp. dans Sparklog sans ligne Britton : des minutes qu'on ne se fait pas rembourser) et **Pas dans Sparklog** (Britton a approuvé un OT que Sparklog n'a pas ce jour-là). Par défaut, seulement ce qu'il faut vérifier ; le menu « Afficher » permet de tout voir ou un seul verdict. Seuls les jours couverts par le tableau Britton sont comparés. Lecture seule, rien à appliquer dans la base. Limite : un OT sous la ligne des 8 h n'apparaît que si Britton ou une preuve le désigne.
- 🟢 **V2.4.301 — Importer Britton reconnaît ton vrai fichier** : la colonne de date de ton fichier s'appelle **« Date installation »** et l'import ne connaissait que « Date » : corrigé. Si des colonnes sont introuvables, le message dit lesquelles. Vérifié avec ton tableau du 19-20 novembre : 38 lignes lues ; la ligne dont la **date d'installation est vide** (11/16, Vanessa) est ignorée et listée, jamais devinée. Dans Drive, un Google Sheets doit être **téléchargé en .xlsx ou .csv** avant l'import. Rien à appliquer dans la base.
- 🟢 **V2.4.300 — Importer Britton accepte aussi le .csv** : le bouton **« Importer Britton »** prend le fichier Excel (.xlsx) **ou un .csv** (séparé par des points-virgules, des virgules ou des tabulations ; les accents sont bien lus). L'ancien **.xls** est refusé avec un message : enregistre-le d'abord en .xlsx dans Excel. Rien à appliquer dans la base.
- 🟡 **V2.4.299 — Comparer le tableau de Britton avec Sparklog** : dans À traiter › OCR, bouton **« Importer Britton »** : tu choisis le fichier Excel (.xlsx) tel que Britton l'envoie. Chaque ligne se place à côté de la preuve Sparklog du **même jour et du même OT** : deux colonnes **« Britton client »** et **« Britton retour »** (en rouge quand ça diffère de la feuille de temps, avec la même marge que pour les preuves : 15 min chez le client, 5 min au retour). Le filtre **« Écart avec Britton »** ne montre que ces lignes, et le bouton **« Britton sans preuve »** liste ce que Britton a approuvé alors que Sparklog n'a aucune preuve ce jour-là pour cet OT. Réimporter le même fichier met à jour les lignes, sans les doubler. Rien ne change dans les fiches ni la paie. **À faire : appliquer la migration 0156.** À confirmer : « Temps d'exécution » = minutes chez le client et « Temps de retour » = retour.
- 🟡 **V2.4.298 — Ajouter la preuve de temps supp. (même option spéciale)** : quand « Modifier les minutes » est activée (Avancé › Feuille de temps d'urgence), chaque fiche dit si elle a une preuve de temps supp. (**« Aucune preuve de temps supp. sur cette fiche »** sinon) et un bouton **« Ajouter la preuve »** te laisse choisir l'image. Écris d'abord la **raison** (gardée au Journal). L'image va dans le dossier de l'employé : il la voit dans son Historique comme les autres et la lecture automatique (OCR) la prend en file. **À faire : appliquer la migration 0155.**
- 🟡 **V2.4.297 — Supprimer une fiche (même option spéciale)** : quand « Modifier les minutes » est activée (Avancé › Feuille de temps d'urgence), un bouton rouge **« Supprimer la fiche »** apparaît à côté de « Enregistrer les nouvelles heures », pour une fiche enregistrée, à mettre à jour ou soumise (jamais approuvée ni exportée), avec une **raison obligatoire**. La fiche est **copiée au Journal avant** d'être supprimée. Son souper et ses reçus de stationnement partent avec elle ; sa preuve de temps supp. passe sur une autre fiche du jour s'il y en a une. **À faire : appliquer la migration 0154.**
- 🟡 **V2.4.296 — Preuve gardée quand elle devient inutile** : quand une journée repasse sous 8 h (fiche modifiée, supprimée ou déplacée), la preuve **n'est plus supprimée** : elle est marquée **« Preuve inutile »** (onglet OCR, aperçu, image téléchargée) et conservée ; la marque disparaît si la journée repasse au-dessus de la ligne. **À faire : appliquer la migration 0153** (avec la 0152).
- 🟡 **V2.4.296 — « Modifier les minutes » (option spéciale, à toi seule)** : dans **Avancé › Feuille de temps d'urgence**, une case **Activer** (désactivée par défaut). Une fois activée : une **bannière rouge** s'affiche sur toutes les pages de gestion pour te le rappeler, et tu peux, pour un employé et un jour, **changer le Départ et la Fin** d'une fiche (enregistrée, à mettre à jour ou soumise ; jamais approuvée) en écrivant une raison. Pratique pour 6 h 57 → 15 h 00 (3 minutes de temps supp.) : pas de formulaire de preuve pour 3 minutes. Chaque changement est gardé au **Journal** (avant / après / raison). **À faire : appliquer la migration 0152** (dis « Applique la 0152 »). Désactive l'option quand tu as fini.
- ✅ **V2.4.295 — Snapshot de la semaine : « aucune heure » à tort** : le snapshot ne lisait que **les 1000 premières fiches** de la semaine (la semaine du 15 au 21 nov. en compte 1054), donc certaines journées (ex. le lundi de Martin Fillion, d'Anthony Rivera, de Daniel) apparaissaient vides ou incomplètes. Les fiches n'étaient pas perdues : l'affichage est corrigé, il lit maintenant **toute** la semaine. Rien à appliquer.
- ✅ **V2.4.294 — Feuille de temps : « Tout » dans le menu qui existait déjà** : j'ai retiré la boîte ajoutée en trop dans la ligne des filtres. Le menu **« Soumis (2) »** (sous la légende de l'étoile, quand un employé est choisi) a maintenant l'option **« Tout »** en premier et par défaut : les quatre colonnes (Enregistrés, À mettre à jour, Soumis, Approuvés) l'une sous l'autre sur téléphone. Rien à appliquer.
- ✅ **V2.4.293 — Feuille de temps : menu des états avec « Tout »** : les quatre cases de la V2.4.291 sont remplacées par le **menu des états**, avec **« Tout »** en premier (choix par défaut), puis Enregistrés, À mettre à jour, Soumis, Approuvés. Un état choisi s'applique aussi quand un seul employé est choisi (seule cette colonne s'affiche). Rien à appliquer.
- ✅ **V2.4.292 — Aperçu OCR : textes** : le titre devient **« Capture form / temps Sparklog »** et la ligne « Un écart est affiché en rouge… » est enlevée (les écarts restent en rouge). Rien à appliquer.
- ✅ **V2.4.291 — Feuille de temps : filtre des états en cases à cocher** : au lieu d'un menu, quatre cases **Enregistrés / À mettre à jour / Soumis / Approuvés**. Tu coches la combinaison que tu veux ; **les quatre sont cochées par défaut** (tu vois tout). Avec un seul employé choisi, seules les colonnes cochées s'affichent. Rien à appliquer.
- ✅ **V2.4.290 — Aperçu OCR : début de journée et heure des 8 h** : l'aperçu (et l'image téléchargée) montre **à quelle heure la journée a commencé** et **à quelle heure elle a atteint 8 h** (10 h pour une journée de 10 h). Ça explique les minutes « Sparklog » attendues chez le client (ex. départ à 6 h 52 au lieu de 7 h). Rien à appliquer.
- ✅ **V2.4.289 — Télécharger les preuves de l'onglet OCR** : un bouton **« Télécharger »** (comme dans Justificatifs : une semaine à la fois, un ZIP, ce qui a déjà été pris est mémorisé) donne **une image par preuve** : la capture avec sa fiche à côté, comme l'aperçu. L'aperçu et l'image montrent maintenant **départ → arrivée → fin**, le **retour** (minutes et km) quand il y en a un, et les km aller / retour. Rien à appliquer.
- ✅ **V2.4.288 — « À mettre à jour »** : une fiche renvoyée pour correction s'appelle maintenant **« À mettre à jour »** (chez l'employé et chez vous). Dans la feuille de temps de la gestion, il y a un filtre et une colonne **« À mettre à jour »** : vous voyez les fiches renvoyées, même quand vous choisissez un seul employé. Rien à appliquer.
- ✅ **V2.4.287 — Filtre par jour dans l'onglet OCR** : un menu **« Jour »** (à côté du filtre d'état et de la recherche) liste les jours qui ont des preuves (avec leur nombre) ; choisir un jour n'affiche que ses lectures, et **« Tout relire » ne relit alors que ce jour-là**. Les colonnes du tableau s'appellent maintenant **« Form »** (ce que l'employé a écrit dans le formulaire), **« Sparklog »** (ce que dit la feuille de temps), **« Retour form »** et **« Retour Sparklog »**.
- ✅ **V2.4.286 — Renvoyer pour correction depuis l'onglet OCR** (**interrupteur** dans Gestion › Configuration › Paramètres, « Retour pour correction (onglet OCR) », **désactivé** au départ) : quand une preuve ne concorde pas (ex. l'employé a écrit 167 min au formulaire pour une fiche qui n'en fait que 148), le bouton **« Renvoyer pour correction »** (sur la ligne, ou dans l'aperçu de la capture) rend la fiche à l'employé : il la corrige, remplace sa preuve (horloge de l'Historique) et la soumet de nouveau. Une confirmation est demandée. L'aperçu affiche maintenant le **numéro d'OT** dans son titre. Quand l'employé ouvre la preuve d'une fiche qu'il peut encore modifier (horloge de l'Historique), il lit : **reprendre la capture du formulaire rempli, ne pas renvoyer le formulaire (déjà envoyé), faire la capture AVANT d'appuyer sur « Envoyer »**, avec le même exemple. Le texte de la demande de preuve dit aussi « AVANT » d'envoyer.
- ✅ **V2.4.285 — Relire une lecture, ou toutes** : dans l'onglet OCR, **chaque ligne** a maintenant un bouton « Relire » (même une lecture qui a des valeurs), et **« Tout relire (n) »** remet en file toutes les lectures affichées (après confirmation ; le filtre et la recherche s'appliquent). Les lectures sont refaites une par minute.
- ✅ **V2.4.284 — « 2026 min » corrigé** : sur une capture dont la réponse du retour était vide, le lecteur prenait la **date** du formulaire (2026-11-19) pour 2026 minutes de retour. Il ne lit plus que des nombres de 1 à 3 chiffres qui ne font pas partie d'une date. Une seule preuve était touchée (remise à vide). Et surtout, le lecteur lit maintenant chaque réponse **sur la ligne sous sa question** (comme on la voit à l'écran), peu importe l'ordre du texte : la date ne peut plus prendre la place du retour. La fonction est à redéployer (je le fais) ; les preuves déjà lues se corrigent avec « Remettre en file ».
- ✅ **V2.4.283 — Onglet OCR : liens et aperçu double** : le **nom** de l'employé ouvre un petit menu (« Fiche employé » dans une fenêtre, ou « Feuille de temps » de ce jour) ; le **numéro d'OT** aussi (« Cette fiche seulement » ou « Toute la journée »). Le bouton œil montre la **capture à gauche et la fiche de travail liée à droite** (état, heures, retour, km) avec les écarts en rouge. Rien ne modifie la fiche.
- ✅ **V2.4.282 — État de la file dans l'onglet OCR** : une preuve « En file » montre combien d'essais ont été refusés par le service OCR et l'heure du prochain essai. **Cause des preuves qui restent en file ou « échouées » : le service OCR.space refuse (erreur 429) la clé partagée de démonstration. À faire : créer ta clé gratuite personnelle sur ocr.space (« Free OCR API key ») et la mettre dans Supabase › Edge Functions › Secrets sous le nom `OCR_SPACE_API_KEY`, puis « Remettre les échecs en file ».**
- ✅ **V2.4.281 — Renvoi automatique avec interrupteur** : Gestion › Configuration › Paramètres › « Contrôle des preuves (mauvaise capture) ». **Désactivé** au départ. Activé, une fiche **soumise** dont la preuve n'est pas le formulaire retourne toute seule à l'employé (la mauvaise capture est retirée, il doit en joindre une bonne et resoumettre ; une fiche approuvée n'est jamais touchée). À savoir : ça joue au moment où la lecture se fait (dans la minute qui suit) ; une preuve lue *avant* d'activer ne renvoie rien, sauf si tu la remets en file (onglet OCR).
- ✅ **V2.4.280 — « Mauvaise capture » reconnue** : un employé avait envoyé une **fiche de travail** comme preuve de temps supp., et Sparklog disait « conforme » parce qu'elle porte un numéro d'OT en haut. Maintenant le lecteur vérifie que la capture **est bien le formulaire** (ses questions « chez le client », « retour à l'entrepôt »… y sont) ; sinon c'est **« Mauvaise capture »** : dans l'onglet OCR (compté dans « À vérifier »), et une **alerte rouge** dans « À regarder d'abord » pour une journée soumise. Les chiffres lus sur une mauvaise capture sont ignorés. **Pas encore : bloquer l'employé** — la lecture se fait dans la minute qui suit l'envoi, donc elle ne peut pas empêcher l'envoi ; à décider (voir ma proposition).
- ✅ **V2.4.279 — OCR : on commence le 16 novembre** : l'onglet OCR ne montre que les preuves **depuis le 16 novembre** ; les 76 vieilles preuves qui attendaient dans la file en ont été retirées (remises « Lecture échouée », on ne les lit pas). Aucune migration.
- ✅ **V2.4.278 — OCR : une lecture par minute, avec file d'attente** : les captures de temps supp. ne sont plus envoyées toutes en même temps au service de lecture (qui refusait). Elles attendent dans une **file** et une tâche en lit **une par minute**, la plus ancienne d'abord. **Si une lecture est refusée, elle retourne au bas de la file** et on passe à la suivante ; elle est réessayée au plus tôt 10 minutes plus tard (20, 30… après d'autres échecs) ; après 5 essais elle devient « Lecture échouée ». Dans l'onglet **OCR** : nouvel état **« En file »**, bouton **« Remettre les échecs en file »** (ou « Relire » sur une ligne), et le tableau se met à jour tout seul chaque minute. Les échecs des 14 derniers jours sont remis en file automatiquement par la migration. **À faire :** appliquer la **migration 0147**, puis redéployer la fonction (je le fais sur demande). Même avec une clé gratuite, une lecture par minute (1 440 par jour) suffit largement.
- ✅ **V2.4.277 — OCR : « Lecture échouée » et bouton « Relire »** : dans l'onglet OCR, une capture que le service n'a pas pu lire (trop de demandes) s'affiche **« Lecture échouée »**, plus « Illisible » ; un bouton **« Relire »** par ligne et **« Relire les échecs (n) »** (gestionnaires seulement, une à la fois). La fonction réessaie aussi toute seule 3 fois. **À faire :** je redéploie la fonction `process_overtime_evidence` après la fusion. Aucune migration.
- ✅ **V2.4.276 — onglet « OCR »** : dans **À traiter**, à côté de « À approuver » et « Justificatifs », un nouvel onglet **OCR** montre un **tableau** : une ligne par capture de preuve de temps supp., avec la date, l'employé, l'OT de la fiche, ce que le lecteur a **lu** sur la capture (OT, minutes chez le client, minutes de retour) à côté de ce que la fiche **attend**, un résultat (conforme / écart / illisible / pas lue) et un bouton « œil » pour voir la capture. Les écarts sont en rouge ; on peut filtrer (à vérifier, conformes, anciennes) et chercher un employé, un OT ou une date. Rien ne se modifie à partir de cet onglet. **À confirmer avec Karine :** « minutes chez le client » = les minutes de cet OT au-delà de 8 h (retour exclu) ; si ce n'est pas ça, les « attendus » seront faux. Aucune migration.
- ✅ **V2.4.275 — texte de la demande de preuve** : le titre devient « Preuve de temps supplémentaire requise », avec la règle (chaque OT au-delà de 8 h, ou 10 h si coché, a sa propre capture), le nom du formulaire « Confirmation de Temps supp. » (cliquable : c'est le formulaire déjà dans Profil › Formulaires, son lien se change là et jamais dans le code), l'OT concerné, et « Tout le formulaire sur la capture » en rouge. L'ancienne phrase « Votre total quotidien dépasse 8 heures » est retirée. Aucune migration.
- ✅ **V2.4.274 — la règle « une capture par OT » commence le 16 novembre** : elle devait s'appliquer le soir même de ta décision, mais l'app comptait la date en heure universelle (17). Les journées **du 16 novembre et après** demandent une capture par OT au-delà de la ligne ; avant le 16, une capture par journée. **À faire : appliquer la migration 0146** (sans elle, la base accepte encore une seule capture le 16).
- ✅ **V2.4.273 — souper et preuve visible** : le message rouge « souper automatique n'a pas pu être ajouté » n'est plus montré à l'employé. La cause : l'écran envoyait parfois 0 minute pour la journée alors que la base refuse un souper sous 10 h 15 ; les minutes sont maintenant recalculées. Si le souper ne peut quand même pas se créer, **toi et les gestionnaires** voyez l'alerte « souper manquant » dans « À regarder d'abord » (à ajouter à la main). Dans l'Historique, l'horloge de temps supp. s'ouvre aussi pour les journées d'avant le 17 novembre (lecture seule si la fiche est soumise). Aucune migration.
- ✅ **V2.4.272 — la base REFUSE un OT au-delà de la ligne sans sa capture (Phase 11)** : **2 OT qui dépassent 8 h (10 h si coché) = 2 captures obligatoires, 3 OT = 3 captures.** À partir du **17 novembre 2026**, impossible de **soumettre** un OT qui franchit la ligne (ou qui vient après) si **cet OT** n'a pas sa propre capture ; la capture d'un autre OT ne compte pas. Ce n'est plus seulement l'app : la **base de données** le vérifie. Les brouillons ne sont jamais bloqués, le personnel de bureau et ta saisie d'urgence pour un employé restent exemptés, et les journées d'avant le 17 novembre gardent une capture par journée. Le bouton « Soumettre la journée » de l'Historique dit combien d'OT n'ont pas leur capture (horloge rouge avec un +) et le message d'erreur explique quoi faire. **À faire : appliquer la migration 0145.** Tant qu'elle n'est pas appliquée, la base accepte encore une journée avec une seule capture.
- ✅ **V2.4.271 — une preuve de temps supp. par OT, qui reste sur son OT (Phase 10)** : **dès le 17 novembre 2026**, chaque OT qui dépasse la ligne des 8 h (10 h si « 4 jours de 10 h » est coché) a **sa propre capture**, et elle **reste sur l'OT où vous l'avez ajoutée** (3 OT au-delà = 3 captures). Dans l'**Historique**, l'**horloge** de l'OT est maintenant un bouton : elle ouvre la capture et, tant que la fiche n'est pas soumise, vous pouvez la **remplacer, la retirer ou l'ajouter** si elle manque (une horloge **rouge avec un +** = OT au-delà de la ligne sans capture). Une fiche soumise ne se change que par la gestion (elle vous la retourne). Les journées d'avant le 17 novembre gardent une capture par journée. L'app **explique la règle** à chaque endroit : dans la fenêtre qui demande la capture, dans la fenêtre de l'horloge et dans un message rouge en haut de l'Historique quand des OT n'ont pas leur capture. **À faire : appliquer la migration 0144** (sans elle, les captures continuent de se ranger sur la dernière fiche et le bouton d'ajout échoue). La base accepte encore de soumettre une journée avec une seule capture : la refuser quand il en manque sera l'étape suivante.
- ✅ **V2.4.270 — correction : la preuve de temps supp. n'est plus redemandée sans arrêt** : la V2.4.269 comptait les preuves de la journée dans une table que **seuls les gestionnaires peuvent lire** ; pour un employé le compte restait à 0 et l'app pouvait redemander la capture à chaque modification. On revient à la règle d'avant (une preuve par journée, demandée tant que la journée dépasse 8 h et qu'aucune fiche ne l'a). **La règle « une preuve par OT » reviendra** dans la prochaine étape, avec un compte que l'employé peut lire. Rien à faire de votre côté (la migration 0143 déjà appliquée ne gêne pas).
- ✅ **V2.4.269 — une preuve de temps supp. par OT au-delà de 8 h (Phase 9a)** : si votre journée a **plusieurs OT qui dépassent 8 h** (10 h avec « 4 jours de 10 h »), l'app demande **une capture du formulaire pour chacun** : « Capture 1 sur 2 », puis « Capture 2 sur 2 ». Ça compte l'OT qui franchit la ligne des 8 h et tous ceux d'après, dans l'ordre des heures. Elle redemande à chaque enregistrement tant qu'il manque une capture. Côté gestion, toutes les captures de la journée s'affichent sur la fiche. **La base accepte encore de soumettre la journée avec une seule capture** : la refuser quand il en manque sera la Phase 9b. **À faire : appliquer la migration 0143 AVANT que les employés utilisent cette version**, sinon l'ajout de la 2e capture donne une erreur.
- ✅ **V2.4.268 — inventaire de fin de mois des sous-traitants (Phase 8)** : dans **Inventaire › « Inventaire fin de mois »** (vous seuls, les gestionnaires), vous choisissez le **jour** et les
  **personnes** qui gèrent un entrepôt. Ce jour-là, à la fin de leur journée (ou depuis l'**Historique**), elles envoient de **5 à 10 captures** du formulaire rempli. **Tant que ce n'est pas fait,
  leurs fiches de temps de ce jour ou après ne peuvent pas être soumises** (elles restent en brouillon). « Je ne l'ai pas encore » est permis : la fiche attend. Vous voyez qui a envoyé (Reçu / En retard),
  vous regardez et **téléchargez** les photos (un ZIP par jour ou par personne) et vous pouvez **Débloquer** quelqu'un. Les photos sont gardées **60 jours** (modifiable dans la même page, de 7 à 365).
  **Pour que ça marche : appliquer la migration 0142 puis redéployer la fonction `cleanup_overtime_evidence`** (sinon rien ne s'efface tout seul).
- ✅ **V2.4.267 — preuve de temps supp. seulement au dernier OT** : quand vous entrez vos heures et que vous avez déjà dépassé 8 h mais qu'il vous reste d'autres OT à saisir, l'app **ne demande plus** la capture au milieu de la journée. Elle la demande au **dernier OT de la journée** (quand vous répondez « Oui » à « Dernier OT de la journée ? »), ou quand vous soumettez la journée depuis l'Historique. La règle de la base n'a pas changé : sans la preuve, la journée ne peut pas être soumise.
- ✅ **V2.4.266 — snapshot d'hier retiré** : le bouton « Hier à 23 h 58 » n'existe plus ; les snapshots « Cette semaine » et « Semaine passée » restent. Rien à faire de votre côté.
- ✅ **V2.4.265 — fiche de l'employé depuis le snapshot** : dans le **snapshot de la semaine** (« Cette semaine » / « Semaine passée »), le **nom d'un employé est cliquable** : un clic ouvre **sa fiche** (tous les onglets : Identité, CCQ, Paie et options, Impôts, Congés, Accès), au même endroit dans la fenêtre. Le bouton **« Retour au snapshot »** ramène le tableau, **sur la même semaine** et mis à jour si tu as changé quelque chose dans la fiche. Les modifications faites dans la fiche s'enregistrent comme dans Équipe › Employés.
- ✅ **V2.4.264 — tableau plus compact** : dans **Conditions de paie**, les **titres de colonnes sont raccourcis** (« 1er dépl. non payé », « Retour av. soc. ≤ 40 h », « 1re h supp. 2× », « Prime CCQ $/h »…) et **écrits à la verticale**, pour que le tableau prenne moins de place. Le nom complet s'affiche en laissant la souris sur un titre, et **en cliquant (ou touchant) un titre, une fenêtre explique en mots simples ce que fait la règle** (pour une ligne de trajet : sa valeur par défaut, les choix possibles et l'article de la convention). **Attention :** « 1er dépl. non payé » garde le sens de la case de la fiche employé (**cochée = le premier déplacement n'est PAS payé**). Rien d'autre ne change.
- ✅ **V2.4.263 — onglet « Conditions de paie »** : dans **Gestion › Configuration**, un nouvel onglet **Conditions de paie** : **un seul tableau**, une ligne par employé, avec tout ce qui est dans « Paie et options » de chaque fiche employé (règles de temps, primes de chef d'équipe, taux fixe, taux km, téléphone, entreposage, options de saisie) **et** les lignes de « Trajets et frais ». Tu coches une case, tu tapes un montant ou tu choisis dans la liste : **c'est enregistré tout de suite**, au même endroit que la fiche employé ou la page Trajets (rien d'autre n'a changé, les anciens écrans marchent comme avant). Tu peux chercher un nom ou un numéro, filtrer par entrepôt, cacher des groupes de colonnes, et changer **tous les employés affichés** d'un coup avec « Tous / Aucun » (ou « Pour tous… ») au-dessus d'une colonne (une confirmation est demandée). **À savoir :** les lignes de « Trajets et frais » sont encore **ignorées par le calcul de paie** ; « Chargé à Britton » et le seuil de km restent dans Admin › Trajets et frais.
- ✅ **V2.4.262 — preuve vérifiable** : l'app **lit la capture du formulaire** de temps supplémentaire et garde seulement trois chiffres : le **numéro d'OT**, les **minutes chez le client** et les **minutes de retour**. Dans **À vérifier avant d'approuver**, une alerte s'affiche si ça **ne concorde pas** avec la journée : l'OT doit être **celui de la dernière fiche** de la journée ; les minutes chez le client = le temps payé **au-delà de 8 h** (sans le retour, à 15 minutes près) ; le retour = le **retour facturable** saisi en fin de journée. Une capture **illisible** donne aussi une alerte. **Rien n'est bloqué** : c'est une alerte, tu peux quand même approuver. **À savoir :** la lecture passe par OCR.space (service hors Québec, déjà utilisé pour les autres captures ; le plan `OFFICIEL.md` prévoit de le retirer). Les km du retour ne sont pas comparés (non lus sur la capture). Si ta définition des « minutes chez le client » est différente, c'est un seul endroit à changer (`overtime-proof-check.js`).
- ✅ **V2.4.261 — preuve de temps supplémentaire** : quand une journée dépasse 8 h, l'employé doit maintenant joindre une **capture du formulaire de demande de temps supplémentaire** (Microsoft Forms) **au lieu du SMS**. La fenêtre et l'image d'exemple sont mises à jour. **À savoir :** l'app ne lit pas la capture, donc rien ne vérifie que c'est le bon formulaire ; les anciennes preuves SMS restent visibles. Prévenir les employés avant la mise en ligne.
- ✅ **V2.4.260** : dans **À traiter**, la carte **« À regarder d'abord »** se **plie et se déplie** en touchant son titre (le nombre de jours reste affiché). Le choix est gardé sur ton appareil, et c'est le même réglage que l'encadré « À vérifier avant d'approuver » des fiches.
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
