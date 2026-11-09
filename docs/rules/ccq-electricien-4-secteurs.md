# Sparklog — Règles CCQ Électricien, 4 secteurs (conventions 2025-2029)

> Spec de travail pour étendre le moteur de paie (aujourd'hui : secteur IC seulement, voir `compensation-rules.md`) aux 4 secteurs, en vue des tests d'homologation CCQ (ex. compagnon en commercial la semaine et en industriel le dimanche). Chaque règle cite l'article. Les lignes marquées **⚠ À VÉRIFIER** viennent d'extraits partiels — confirmer dans le PDF officiel avant de coder (règle « ne pas deviner », ADR 0001). **Aucune règle de paie n'est modifiée par ce document.**

## 0. Textes officiels

| Secteur | Code annexe salaires | PDF officiel 2025-2029 |
|---|---|---|
| Institutionnel et commercial (IC) | C / C1 | https://www.ccq.org/-/media/Project/Ccq/Ccq-Website/PDF/ConventionsCollectives/2025-2029/110454-110438-PD5145.pdf |
| Industriel (I) | B / B1 / B2 (industrie lourde) | https://www.acq.org/wp-content/uploads/2025/10/rt-conventionscollectives-industriel-2025-2029-v2.pdf |
| Résidentiel léger / lourd (R) | R / R1 | https://www.ccq.org/-/media/Project/Ccq/Ccq-Website/PDF/ConventionsCollectives/2025-2029/110455-110439-PD5147.pdf |
| Génie civil et voirie (GCV) | D / D1 | https://www.acrgtq.qc.ca/app/uploads/2025/04/Convention-collective-2025-2029-23-04-2025-finale.pdf |

Version HTML par section : https://www.ccq.org/fr-CA/loi-r20/conventions-collectives/conventions-collectives/{institutionnel-commercial|industriel|residentiel|genie-civil-et-voirie}/section-xx

Déjà dans le dépôt : convention IC (`docs/reference/convention-collective-ici-2025-2029.pdf`) et tableaux de taux 2026-2027 des 4 secteurs (`tests/Tableau-{Institutionnel-Commercial,Industriel,Residentiel,GCV}-2026-2027.pdf`). À ajouter : PDF des conventions Industriel, Résidentiel, GCV.

Taux horaires : outil CCQ « taux de salaire » ou tableaux SQI (annexes B, C, D, R…). Les taux changent fin avril chaque année → table `wage_rates(sector, annex, trade, level, shift_type, effective_from)`.

---

## 1. Changement d'architecture requis

Aujourd'hui Sparklog = 1 secteur (IC). Il faut :

1. **`sector` au niveau de chaque entrée de temps** (pas au niveau de l'employé ni du projet seulement) : `IC | I | I_LOURDE | R_LEGER | R_LOURD | GCV`.
2. **Moteur de règles par secteur** : `RuleSet[sector]` = horaires normaux, seuils OT, taux OT, primes, indemnités.
3. **Cumul inter-secteurs** (voir §2) : le compteur jour/semaine est **global à l'employé**, mais le **taux** appliqué à chaque heure supp. est celui **du secteur où l'heure est faite**.
4. Ordre de calcul : trier les entrées chronologiquement → remplir les heures normales → ce qui dépasse devient OT → appliquer le taux OT du secteur de l'entrée → **ajouter les primes après** (OT ne s'applique pas aux primes, sauf chef d'équipe/groupe — IC/I art. 22.01, GCV art. 23.01).

## 2. Cumul d'heures dans plus d'un secteur

- **GCV, déf. 1.01 17.1)** : les heures quotidiennes et hebdomadaires sont **cumulatives** quand, dans sa journée ou sa semaine, le salarié travaille dans différents secteurs. Les heures supp. sont payées au **taux majoré du secteur où elles sont exécutées**.
- **IC et Industriel, section I** : aucune définition équivalente trouvée. **⚠ À VÉRIFIER avec la CCQ** — c'est LE point clé de ton test d'homologation. Recommandation : implémenter le cumul (règle GCV) comme comportement par défaut, derrière un flag `cross_sector_cumul=true`, et faire valider l'interprétation par la CCQ.

## 3. Heures normales (électricien)

| | IC | Industriel | Résidentiel lourd | Résidentiel léger | GCV |
|---|---|---|---|---|---|
| Semaine | 40 h lun-ven (20.02) | 40 h lun-ven (20.02) | 40 h lun-ven (18.02 1a) | 40 h lun-ven (18.02 2a) | 40 h lun-ven (21.01, 21.05) |
| Jour | 8 h | 8 h | 8 h (électricien absent de la liste 10 h ⚠) | max 10 h | 8 h |
| Plage | début 6h–9h, fin 14h30–18h | idem | 6h–14h30 → 8h–17h | 6h–16h30 → 8h–19h | 6h–14h30 → 8h–17h |
| Comprimé | ≤ 4 jours, OT au-delà de la limite quotidienne fixée ; 30 h si férié dans semaine de 4 j (20.02 5) | idem (20.02 5) | entente chantier d'envergure | reprise heures perdues à taux simple, max 10 h/j, 50 h/sem, 80 h / 2 sem (18.02 3) | 10/4 et 8/6 lignes (21.05 15 k, l) |
| Chantiers isolés / Baie-James / N 55e | 45 h (9 h/j) ou 50 h (10 h/j) si gîte+couvert (20.05 2) | idem | — | — | annexe D1 |

Tout ce qui sort de la plage ou dépasse jour/semaine = OT. Samedi, dimanche, férié chômé, congé annuel obligatoire = OT.

## 4. Taux des heures supplémentaires (électricien, cas général)

| Secteur | Lun-ven (dépassement) | Samedi | Dimanche / férié |
|---|---|---|---|
| **IC** (21.02) | **1re heure supp. de la SEMAINE à 150 %**, ensuite 200 % | tout en OT : 150 % si la 1re heure de la semaine est libre, puis 200 % (21.01, 21.02 b ; déjà codé, moteur 2.3.0) | **200 % dès la 1re heure** |
| **Industriel** (21.02) | 1re heure supp. de la semaine 150 %, ensuite 200 % ; industrie lourde : 1re heure à 150 % ne s'applique pas aux arrêts (shutdown) ; calcul sur annexe B + B-2 | idem ⚠ | **200 % dès la 1re heure** |
| **Résidentiel lourd** (19.02 1) | 200 % | 200 % | 200 % |
| **Résidentiel léger** (19.02 2a) | **150 %** + réserve d'heures possible | 150 % | 150 % |
| **GCV** (22.02 1) | 200 % (règle générale 100 % de majoration) | 200 % | 200 % |

**Électricien — chantiers isolés, Baie-James, N 55e (IC/I 21.03 4-5)** : 1re heure avant/après l'horaire lun-ven à 150 % ; ensuite + samedi, dimanche, congé annuel, férié → 200 %.

**Électricien — travaux > 2 mois chez un même employeur** : calendrier d'OT fixé par l'employeur + représentant syndical (IC/I 21.03 ; GCV 22.01 4).

> Note : la « 1re heure à 150 % » est **hebdomadaire** en IC ; le moteur actuel l'applique déjà par semaine (`compensation-rules.md`). Le moteur multi-secteurs doit garder cet accumulateur par semaine CCQ (dimanche → samedi).

## 5. Réserve d'heures (résidentiel seulement, art. 19.04)

- Réserves **séparées** léger / lourd, max **80 h** non majorées chacune.
- Semaine < 40 h : léger → complète à 40 h au taux simple ; lourd → heures manquantes × **0,6666**, payées à 150 %.
- 40 h réduit de 8 h par férié chômé.
- Périodes : 30 mars 2025 → 28 mars 2026 ; 29 mars 2026 → 27 mars 2027 ; 28 mars 2027 → 25 mars 2028 ; 26 mars 2028 → 31 mars 2029.
- Liquidation : au plus tard dernier jeudi d'avril ; solde à 150 % (léger) / 200 % (lourd).
- Départ volontaire : léger taux simple R ; lourd 150 % R1. Congédiement : léger 150 % ; lourd 200 %.

## 6. Primes électricien (ajoutées APRÈS l'OT)

| Prime | IC | Industriel | GCV |
|---|---|---|---|
| 2e / 3e équipe | 12 % (22.02 2e) | 15 % (22.02 2e) ⚠ | 10 % ; 15 % industrie lourde (23.02 2) |
| Horaire déplacé | 10 % (22.04 4e) | 10 % ; 15 % industrie lourde (22.04 4e) | 10 % (23.04 2) |
| Chef d'équipe | 8 % (22.03 1) | 8 % | 8 % (23.03 2d) |
| Chef de groupe | 12 % (22.03 2c) | 10 % ⚠ | 12 % (23.03 2d) |
| Pipe rack extérieur, intempéries | 15 % (22.07) | 15 % (22.09) | — |
| Amiante zone contaminée haut risque | 12 % (22.15) | 12 % (22.17) | — |
| Masque à adduction d'air | 1,10 $/h (22.06) | 1,10 $/h (22.06) | — |

Primes d'équipe / horaire déplacé : 7 jours/7, fériés inclus. Chef d'équipe/groupe = seules primes majorées par l'OT.

## 7. Repas, repos, autres

| | IC / Industriel | Résidentiel | GCV |
|---|---|---|---|
| Repas électricien (OT consécutives à une journée de 10 h) | ½ h payée + **30 $** (IC 20.07 3 c i, déjà codé) ; Industriel ⚠ même article à vérifier | ½ h payée + **17 $** sur reçu (18.05 3) | **21 $** (21.13 3a) ⚠ |
| Autre indemnité | après chaque 4 h OT supplémentaires | idem | idem |
| Pause OT | 15 min payée au taux majoré après chaque 2 h OT | — | — |
| Repos min. | 8 h consécutives / 24 h, sinon OT continue (20.07 2) | | |
| Allocation d'assiduité électricien | 4 h (≥ 6 jours chez l'employeur) / 8 h selon durée (14.12) ⚠ | | |
| Indemnité mise à pied électricien IC | 16 × taux (> 3 ans), 32 × taux (> 5 ans) (14.02) | | |
| Équipe minimum (double/triple) | 2 électriciens (compagnon+apprenti ou 2 compagnons) (20.06 1 f i) | | |

---

## 8. Cas de test d'homologation (squelette : `src/payroll/multi-sector.todo.test.js`)

Hypothèse : électricien compagnon, cumul inter-secteurs actif. `T_x` = taux de salaire du secteur x (annexe applicable).

| # | Scénario | Attendu |
|---|---|---|
| T1 | Lun-ven IC 8 h/j + **dimanche 8 h Industriel** | IC : 40 h à T_C. Dimanche : 8 h à **200 % × T_B** (dimanche = 200 % dès 1re h ; la règle 150 % ne s'applique pas). |
| T2 | Lun-jeu IC 8 h + **ven Industriel 10 h** | 32 h IC simple ; ven : 8 h T_B simple, 9e h = 1re OT de la semaine → 150 % T_B, 10e h → 200 % T_B. + indemnité repas si 10 h ⚠ |
| T3 | Lun IC 6 h puis Industriel 4 h même jour | Cumul quotidien = 10 h → 2 h OT, faites en Industriel : 1 h 150 % T_B, 1 h 200 % T_B. |
| T4 | Lun-ven IC 9 h/j | Lun : 9e h à 150 % T_C ; mar-ven : 9e h à 200 % T_C (1re OT est hebdo). |
| T5 | Lun-ven IC 8 h + **samedi R léger 6 h** | Samedi : 6 h à 150 % T_R (taux OT du résidentiel léger). |
| T6 | Lun-ven R lourd 8 h + samedi IC 4 h | Samedi IC : 1 h 150 % T_C, 3 h 200 % T_C (1re OT de la semaine ; cumul ⚠) |
| T7 | Semaine avec férié chômé lundi, horaire comprimé 4 j IC | Limite hebdo 30 h ; OT au-delà. |
| T8 | Mar-ven IC 8 h + dimanche GCV 8 h | Dimanche : 8 h à 200 % T_D. |
| T9 | 2e équipe IC 8 h + 2 h OT | 8 h × T_C + 12 % ; OT : 1 h 150 % T_C + 12 % T_C (prime non majorée), 1 h 200 % T_C + 12 % T_C. |
| T10 | Chef de groupe IC, 2 h OT | Prime 12 % **majorée** par l'OT (exception 22.03). |
| T11 | R léger semaine de 32 h avec réserve 20 h | Paye complétée à 40 h taux simple, réserve → 12 h. |
| T12 | R lourd semaine de 32 h, réserve 20 h | 8 × 0,6666 = 5,33 h à 150 % ; réserve → 14,67 h. |
| T13 | IC journée de 10 h puis OT | ½ h repas payée + 30 $ ; pause 15 min au taux majoré. |
| T14 | Repos < 8 h entre 2 quarts | Toutes les heures jusqu'à 8 h de repos restent en OT. |

## 9. Points ouverts — à faire confirmer par la CCQ avant homologation

1. Cumul inter-secteurs applicable quand une des entrées est IC ou Industriel (texte trouvé seulement en GCV 1.01 17.1).
2. Quand le cumul fait déborder la semaine, quel secteur « porte » la 1re heure OT à 150 % (hypothèse : le secteur où cette heure est faite, appliquant SA règle).
3. Samedi en Industriel : même règle que l'IC (21.02 b) ?
4. Indemnités de repas de l'électricien hors IC (GCV 21 $ ? Industriel ?) et indexation par date.
5. Prime 2e/3e équipe industriel (15 %) et chef de groupe industriel (10 %).
6. Électricien résidentiel lourd : 8 h confirmé (non listé dans 18.02 1 d).
