# OFFICIEL.md — Plan directeur de conformité de Sparklog

> **Document de référence unique** pour rendre Sparklog conforme : convention collective de la construction
> (secteur résidentiel, art. 18.01 2) b — pointage par application mobile), Loi R-20 et Loi 25.
> Ce document **planifie** : il ne change rien dans le code. Chaque changement passera par sa propre PR (version + docs, voir `CLAUDE.md`).
>
> **Avertissements.**
> - Ce n'est **pas un avis juridique**. Chaque point marqué **[À VALIDER]** doit être confirmé par un conseiller juridique, l'AECQ ou la CCQ
>   avant d'être traité comme acquis.
> - Le dépôt est **public** : aucune valeur personnelle (NAS, salaire, nom d'employé, montant de paie) ne doit jamais être écrite ici.
> - Les exigences de la convention viennent du texte **collé par la propriétaire le 2026-11-13** (page « Convention collective 2021-2025,
>   secteur résidentiel », article 18.01 2) b), annexe IV). Le texte officiel de la convention, de la Loi R-20 et de l'annexe W-1 n'a **pas** été
>   relu ici : à comparer avant diffusion.
> - Ce qui n'a pas été vérifié est dit comme tel (section 9).

Version du dépôt à la rédaction : V2.4.257. Dernière mise à jour : 2026-11-13.

---

## 1. En bref

1. **La convention (art. 18.01 2) b)** dit qu'une application de pointage ne doit recueillir qu'un **numéro d'employé** et un **point de
   géolocalisation** (rayon de 350 m), que ces renseignements soient **anonymisés et conservés au Québec** chez un fournisseur
   **certifié** (ISO 27001, SOC 2 Type 1 et 2, ou Cybersécuritaire Canada), que le salarié **consente expressément** (annexe W-1), puisse
   **refuser ou arrêter sans représailles**, **pointe lui-même** et soit **avisé de toute modification** de ses heures.
2. **Sparklog aujourd'hui** recueille bien plus (noms, courriels, paie, NAS, photos…), dans une base **aux États-Unis** (`us-west-2`), avec
   plusieurs services externes. Il ne recueille **aucune géolocalisation** (conforme sur ce point, à garder).
3. **Architecture cible** : deux côtés étanches.
   - **Côté 1 — Pointage** (ce dépôt, allégé) : numéro d'employé + fiches de temps + gestion du temps + feuille d'urgence. **Hébergé au Québec**,
     chez un fournisseur certifié. Aucun nom, courriel ni paie.
   - **Côté 2 — Gestion** (**nouveau dépôt**) : noms, courriels, téléphone, paie, TD1, NAS, relevés d'emploi, courriels d'annonces. Lit les heures
     du côté 1 par une interface sécurisée. Soumis à la Loi 25 (et hébergé au Québec lui aussi, voir 6.2).
4. **Ordre recommandé** : (P0) décisions → (P1) gains rapides sans migration → (P2) hébergement au Québec → (P3) séparation 1 / 2 →
   (P4) preuves de certification → (P5) documents → (P6) vérification finale. Détail en section 7.

---

## 2. Les exigences à respecter

### 2.1 Convention collective — art. 18.01 2) b) (résidentiel) · source : texte collé le 2026-11-13

S'appliquent à l'employeur qui **choisit une application mobile de pointage** comme méthode de pointage. **[À VALIDER]** : que Sparklog soit
une « application mobile de pointage » au sens de la convention (les heures de début et de fin y sont saisies à la main, il n'y a pas de bouton
de punch) et que Messier Connexion relève bien du **secteur résidentiel** (sinon la convention du secteur applicable, avec ses propres articles).
Par prudence, ce plan traite Sparklog comme une application de pointage.

| Id | Exigence (résumé fidèle) | Article |
|----|--------------------------|---------|
| C1 | Utilisation **facultative** : le salarié est libre d'utiliser l'application, fournie sans frais. | b.1 |
| C2 | **Consentement exprès** du salarié, au formulaire de l'**annexe W-1**, avant de recueillir des renseignements. | b.1 |
| C3 | Le salarié qui **refuse** a un **autre moyen de pointage** (horloge, carte de temps papier ou électronique), **sans représailles ni mesure disciplinaire**. | b.1 |
| C4 | Après avis à l'employeur, le salarié peut **cesser** d'utiliser l'application, sans représailles. | b.1 |
| C5 | L'employeur **peut fournir l'appareil**, mais le salarié peut fournir le sien. | b.2 |
| C6 | **Aucune géolocalisation en continu.** Elle n'est permise qu'**au pointage** de début et de fin (validation de présence), **activée seulement quand le salarié pointe**. | b.3.1 |
| C7 | Le fournisseur ne recueille que : **un numéro d'employé** et **un point de géolocalisation dans un rayon de 350 m** du lieu où commencent / finissent les heures. | b.3.2 |
| C8 | Aucun autre renseignement **identifiant** : sinon il est **détruit au plus tard une semaine après sa collecte**. | b.3.2 |
| C9 | Sur l'appareil **personnel** du salarié, l'application **n'accède pas à ses données personnelles**. | b.3.2 |
| C10 | Les renseignements recueillis sont **anonymisés et conservés au Québec**, avec les standards de sécurité informatique nécessaires. | b.3.3 |
| C11 | Les **fournisseurs** (application **et hébergement**) ont une **certification reconnue au Canada** : **ISO 27001**, audit **SOC 2 Type 1 et 2**, ou **« Cybersécuritaire Canada »**. | b.3.3 |
| C12 | Une **politique de confidentialité** conforme, **disponible à tous les salariés et employeurs**, avec au minimum : accès limité au personnel qui en a besoin (rôles et responsabilités), renseignements recueillis, utilisation, conservation, destruction, protection. | b.3.4 |
| C13 | Le salarié **pointe lui-même** ses heures de début et de fin chaque jour. | b.3.5 |
| C14 | Il est payé pour les heures enregistrées **moins le temps de repas**. | b.3.5 |
| C15 | Le salarié est **obligatoirement avisé** de **toute modification** par l'employeur des heures de début ou de fin. | b.3.5 |
| C16 | Le salarié a **accès à ses heures pointées sur demande**. | b.3.5 |

### 2.2 Loi R-20 (relations du travail dans l'industrie de la construction) — **[À VALIDER ENTIÈREMENT]**

La propriétaire indique devoir se conformer à la **Loi R-20** et **héberger les données au Québec**. Le texte de la loi n'a pas été relu ici et
je **ne confirme pas** qu'elle impose elle-même un hébergement au Québec : l'obligation d'héberger au Québec **ressort de la convention
collective** (C10, ci-dessus). À faire en P0 : demander à l'AECQ / à un conseiller juridique **quelles obligations précises de la Loi R-20 et de
ses règlements** touchent un employeur qui tient les heures par application (registres de présence, **rapport mensuel à la CCQ**, durée de
conservation, accès de la CCQ). Les exigences R-20 confirmées seront ajoutées ici comme **R1, R2…** avec leur source.

### 2.3 Loi 25 (protection des renseignements personnels dans le secteur privé) — rappel général **[À VALIDER]**

Le plan s'appuie sur les obligations générales suivantes (déjà listées dans `NOOB.md`, section « Loi 25 ») :

| Id | Obligation | Où on en est |
|----|------------|--------------|
| L1 | **Responsable** de la protection des renseignements personnels, nommé et publié. | à nommer |
| L2 | **Politique de confidentialité** publiée, en langage clair. | brouillon `docs/governance/politique-confidentialite.md` |
| L3 | **Consentement** clair, libre et éclairé, pour des fins précises. | modèle de lettre, rien dans l'app |
| L4 | **Évaluation des facteurs relatifs à la vie privée (ÉFVP)** avant de communiquer des renseignements **hors Québec**. | à faire (aujourd'hui : États-Unis) |
| L5 | **Entente écrite** avec chaque fournisseur qui reçoit des renseignements. | à faire |
| L6 | **Registre des incidents** de confidentialité et procédure d'avis (CAI et personnes touchées). | à faire |
| L7 | **Droits des personnes** : accès, rectification, retrait du consentement, portabilité. | à faire (export « Mes renseignements » possible) |
| L8 | **Conservation limitée** puis destruction ou anonymisation. | durées à fixer avec le comptable |
| L9 | **Minimisation** : ne recueillir que le nécessaire. | à revoir (section 3) |

---

## 3. État actuel de Sparklog (vérifié dans le code et la base le 2026-11-13)

### 3.1 Où sont les renseignements

| Élément | Où | Emplacement |
|---------|----|-------------|
| Base de données (profils, fiches, paie, notes, journaux) et connexion | Supabase | **États-Unis, région `us-west-2`** (hors Québec) |
| Fichiers (8 buckets privés) : `overtime-evidence`, `parking-receipts`, `meal-receipts`, `inventory-screenshots`, `ccq-cards`, `accident-files`, `broadcast-images`, `reference-files` | Supabase Storage | Même région |
| Application (code statique, aucun renseignement personnel stocké) | Vercel (Render aussi configuré) | Réseau mondial de diffusion |
| Lecture des captures de bons de travail et de preuves | OCR.space (clé `OCR_SPACE_API_KEY`) | Service externe, lieu **[à confirmer]** |
| Export des fiches approuvées (noms, heures) | Google Apps Script / Google Sheets | Google, lieu non choisi par nous |
| Courriels d'annonces | Resend ou Brevo (clés `RESEND_*` / `BREVO_*`) | Services externes, lieu **[à confirmer]** |
| Notifications téléphone | Web Push (VAPID) via les services push des navigateurs | Services des navigateurs |

La page est servie avec `Permissions-Policy: geolocation=()` (`vercel.json`) : le navigateur **bloque** la géolocalisation. L'app ne recueille
aucune position. **À conserver** (voir C6, C7).

### 3.2 Ce qui est recueilli (tables sensibles ; liste complète : 57 tables)

- **`profiles`** (53 colonnes) : nom, **courriel**, **téléphone**, **date de naissance**, **numéro et carte CCQ** (+ photo dans `ccq-cards`), niveau
  d'apprenti, syndicat, taux horaire, options de paie, dates d'embauche et de départ, **numéro d'employé** (`employee_number` existe déjà).
- **`employee_sensitive`** : NAS, dans un **coffre chiffré Supabase** (0102), accessible seulement par fonctions réservées à la propriétaire.
- **`employee_tax_profiles`** : montants TD1 / TP-1015.3, exemptions. **`payroll_period_ledger`**, **`payroll_ytd`**, **`roe_history`** : paie et relevés d'emploi.
- **`jobs`** et tables liées : heures, OT, km, état ; **`overtime_evidence`**, **`parking_receipts`**, **`meal_claims`** : photos et montants.
- **Journaux nominatifs** : `audit_log` (`actor_name`, `target_name`), `employee_activity_log` (`user_name`), `accident_log` (`person_name`, description,
  témoins, **réclamation CNESST**), `foreman_reports` (`audited_name`, texte libre), `manager_notes`, `messages`.
- **`push_subscriptions`** : adresse push de l'appareil, `user_agent`.

### 3.3 Fonctions serveur (Edge Functions) qui touchent aux renseignements

`create_employee`, `delete_user`, `reset_employee_password`, `send_announcement` (courriels), `send_push`, `process_overtime_evidence` et
`process_inventory_screenshot` (OCR.space), `push_approved_batch` (envoi vers Google), `classify_week`, `ccq_rates*`, `cleanup_overtime_evidence`,
`delete_inventory_screenshots`, `infra_metrics`.

---

## 4. Écarts entre les exigences et Sparklog

Gravité : **Bloquant** = contredit une exigence de la convention · **Majeur** · **Mineur**.

| # | Écart | Exigences | Gravité |
|---|-------|-----------|---------|
| E1 | Base et fichiers **aux États-Unis**. | C10, L4 | **Bloquant** |
| E2 | Sparklog recueille **bien plus** que numéro d'employé + géolocalisation : noms, courriels, téléphone, naissance, paie, NAS, photos, textes libres. | C7, C8, L9 | **Bloquant** |
| E3 | Données **non anonymisées** : tout est lié à une personne nommée. | C10 | **Bloquant** |
| E4 | **Aucune preuve de certification** (ISO 27001 / SOC 2 Type 1 et 2 / Cybersécuritaire Canada) pour Supabase, Vercel, Google, OCR.space, Resend, Brevo. | C11 | **Bloquant** |
| E5 | **Pas de consentement exprès** (annexe W-1) dans l'app ni de procédure de refus / retrait. | C1–C4 | **Bloquant** |
| E6 | **Services externes** reçoivent des renseignements (OCR.space, Google, Resend / Brevo). | C10, L4, L5 | **Majeur** |
| E7 | **Feuille d'urgence soumise par la propriétaire** (V2.4.254) : l'employé n'a pas pointé et **n'est pas avisé**. | C13, C15 | **Majeur** |
| E8 | Politique de confidentialité en **brouillon**, non diffusée. | C12, L2 | **Majeur** |
| E9 | Aucun **responsable** nommé, **registre des incidents**, procédure d'avis, **ÉFVP**, **ententes** avec les fournisseurs. | L1, L4–L6 | **Majeur** |
| E10 | **Durées de conservation** non fixées (preuves : 30 jours par défaut ; reste : non défini). | L8, C8 | **Majeur** |
| E11 | **Droits des personnes** : pas d'export « Mes renseignements », pas de procédure de rectification / retrait. | L7, C16 | **Mineur** |
| E12 | Connexion par **courriel réel** (le courriel est un renseignement personnel). | C7 | **Bloquant** pour le côté 1 |
| E13 | Politique de sécurité de contenu (CSP) en mode **rapport seulement**. | C10 (sécurité) | **Mineur** |
| E14 | Photos (preuves, SMS, bons de travail) peuvent contenir des **noms de tiers** et rester plus longtemps que la semaine permise. | C8 | **Majeur** |

Ce qui est **déjà conforme** : aucune géolocalisation (C6, C7 pour la partie géo), l'employé saisit lui-même ses heures (C13), il consulte ses
fiches (C16), les fiches modifiées par la gestion repassent par l'employé sauf la soumission d'urgence (C15, voir E7), photos recompressées sans
EXIF / GPS, NAS chiffré hors base, double authentification des comptes de gestion.

---

## 5. Architecture cible : deux côtés

### 5.1 Principe

```
 Employé / gestionnaire ──► CÔTÉ 1 : POINTAGE ─────────────► (Québec, fournisseur certifié)
                              n° d'employé, fiches, temps,        aucun nom, aucun courriel, aucune paie
                              urgence, notes par n°
                                     ▲  lecture seule, authentifiée
                                     │  (heures par n° d'employé)
 Propriétaire / paie ─────► CÔTÉ 2 : GESTION  ─────────────► (Québec aussi)
                              noms, courriels, téléphone, paie,
                              TD1, NAS, RE, annonces, CCQ
```

- **Côté 1** ne sait pas qui est le numéro 4821. **Côté 2** seul sait relier un numéro à une personne.
- Le lien n° ↔ personne ne quitte jamais le côté 2. Le côté 2 **lit** les heures du côté 1 ; il n'y écrit pas de renseignement identifiant.
- Un employé n'a **aucun compte** côté 2.

**[À VALIDER]** : qu'un **numéro d'employé** seul, lié à des heures, suffise comme « anonymisé » au sens de C10 (c'est de la
**pseudonymisation** : le côté 2 peut refaire le lien). La convention elle-même autorise le numéro d'employé (C7), ce qui va dans ce sens.

### 5.2 Un dépôt ou deux ? (réponse à la question de la propriétaire)

**Deux dépôts GitHub : oui, c'est le bon choix**, et c'est aussi un contrôle d'accès (qui a le droit de voir quel code et quels secrets).

| Dépôt | Contenu | Visibilité |
|-------|---------|------------|
| **`Sparklog`** (existant) → devient le **côté 1** | App de pointage, base du côté 1, Edge Functions du côté 1, moteur d'heures partagé | **Public** (aucun secret, aucune donnée) |
| **Nouveau dépôt** (nom suggéré : `sparklog-gestion`) → **côté 2** | App de gestion, base du côté 2 (noms, paie), fonctions du côté 2 | **Privé** (il décrit où sont les données sensibles) |

**Code commun** (moteur de paie des heures, contrat des fiches `job-contract`) : le moteur vit déjà dans `supabase/functions/_shared/payroll_engine.js`
(une seule source). Deux façons de le partager — à trancher en P3 :
1. **Le côté 2 appelle le côté 1** pour classer les heures (fonction `classify_week` déjà là) : rien à dupliquer, une seule source de vérité. *Recommandé.*
2. Le côté 2 contient une **copie versionnée** du moteur avec les mêmes tests de parité (`payroll-engine-parity`). Plus simple à lancer, risque de divergence.

### 5.3 Répartition des données (proposition, table par table)

| Reste côté 1 (pointage, Québec) | Va côté 2 (gestion) | À supprimer ou à réduire |
|---------------------------------|---------------------|--------------------------|
| `jobs`, `job_entry_unlocks`, `job_entry_sources`, `company_time_settings`, `company_holidays`, `preset_work_orders`, `overtime_settings` | `profiles` (nom, courriel, tél., naissance, CCQ, syndicat, taux, options de paie) | `profiles.birth_date` et captures CCQ si la loi n'exige pas de les garder |
| **Profil minimal** : n° d'employé, rôle, `is_paused`, options **qui modifient le temps** (`first_trip_unpaid`, `ten_hour_days`, `km_apart_from_capture`, `team_leader_*`) | `employee_sensitive` (NAS), `employee_tax_profiles`, `payroll_*`, `roe_history`, `conges_indemnity_rate`, `ccq_rate_snapshots`, `statutory_rate_sets`, `payroll_rates`, `travel_pay_rules`, `employer_contributions` | `push_subscriptions.user_agent` |
| `overtime_evidence`, `meal_claims`, `parking_receipts` (+ buckets) — sans nom ; photos à courte durée | `employee_forms`, `employee_form_access`, `profile_references`, `ccq-cards` | Textes libres nominatifs (`foreman_reports.audited_name`, notes) : remplacer par un **n° d'employé** |
| `foreman_reports` / `_reads` (par n°), `manager_notes` (par n°), `inventory_*` (sans nom) | `messages`, `manager_broadcasts` (annonces : courriels) | `audit_log` / `employee_activity_log` : **n° d'employé** au lieu du nom |
| `audit_log` du côté 1 (acteur et cible **par n°**) | `accident_log` (noms, CNESST), `accident-files` | |
| Notifications push (abonnement lié au **n°**, sans `user_agent`) | `employee_groups` / `employee_group_members` si elles servent à des noms | |

À trancher en P3 : les **groupes / entrepôts** et l'inventaire (utilisent le groupe de l'employé) ; la **feuille Google** (voir 6.4).

### 5.4 Connexion et affichage des noms

- **Connexion côté 1** : identifiant **n° d'employé + NIP / mot de passe**. L'adresse stockée par Supabase Auth devient **factice**
  (`<n°>@pointage.invalid`, comme les anciens employés `ancien.<nom>@…invalid` aujourd'hui). Plus de « mot de passe oublié » par courriel :
  la réinitialisation se fait par la gestion. Les comptes de gestion utilisent aussi un identifiant à numéro + **double authentification (TOTP)**.
- **Les gestionnaires voient des noms** pour travailler. Ils les lisent **côté 2** et les **affichent** dans le navigateur, sans jamais les envoyer au
  côté 1. Deux options (à trancher en P3) : (a) l'écran de gestion est servi par le côté 2 et récupère les heures du côté 1 ; (b) l'écran reste
  côté 1 et affiche des **numéros**, avec une table n° ↔ nom chargée **depuis le côté 2** par le navigateur (jamais stockée côté 1).
  Option (b) change moins l'interface actuelle ; option (a) est plus propre juridiquement.

---

## 6. Ce qu'on doit modifier de notre côté

### 6.1 Côté 1 — pointage (ce dépôt)

| Id | Modification | Répond à |
|----|--------------|----------|
| M1 | **Consentement exprès (annexe W-1)** dans l'app : écran à la première connexion, case + texte du formulaire, **enregistrement** (n° d'employé, date, version du texte), **refus** → pointage par **un autre moyen** sans pénalité (fiche papier / électronique saisie par la gestion), **retrait** à tout moment. | C1–C4, L3 |
| M2 | **Avis à l'employé** à toute modification de ses heures par la gestion, **y compris la soumission d'urgence** ; fiche marquée « saisie par l'employeur ». | C13, C15, E7 |
| M3 | **Identité par numéro** : connexion n° + NIP, adresses factices, plus de nom ni de courriel côté 1. | C7, E12 |
| M4 | **Retirer** de la base du côté 1 tout renseignement identifiant (voir 5.3) ; journaux et notes **par n°**. | C7, C8, E2 |
| M5 | **Durées de conservation et destruction automatique** : preuves en photo ≤ 1 semaine si elles identifient quelqu'un ; toute donnée identifiante hors n° ≤ 1 semaine ; fiches de temps : durée à fixer (R-20 / paie). Tâche planifiée + journal de destruction. | C8, L8, E10, E14 |
| M6 | **Aucune géolocalisation** : test automatique qui échoue si le code l'utilise ; garder `Permissions-Policy geolocation=()`. Si un jour on en veut une : au pointage seulement, rayon 350 m. | C6, C7 |
| M7 | **Sans accès aux données de l'appareil** : ne demander aucune autorisation inutile (contacts, fichiers…) ; la caméra reste **à l'action** (prise de photo). Vérifier l'usage de `localStorage` / IndexedDB (brouillons locaux, 30 jours). | C9 |
| M8 | **OCR hors service externe** : remplacer OCR.space (lecture sur l'appareil, ou service hébergé au Québec) ; ne plus envoyer d'image hors Québec. | C10, E6 |
| M9 | **Export vers Google retiré du côté 1** ; la paie se lit côté 2 (voir 6.4). | C10, E6 |
| M10 | **CSP en application** (`Content-Security-Policy` au lieu de `-Report-Only`), `connect-src` réduit au projet Québec. | E13 |
| M11 | **Accès de l'employé à ses heures** (déjà présent) + export « Mes heures » sur demande. | C16 |
| M12 | **Politique de confidentialité** affichée dans l'app (lien permanent), version datée. | C12 |
| M13 | **Registre des incidents** et procédure (outil interne côté 2). | L6 |

### 6.2 Hébergement au Québec

| Id | Modification | Détails |
|----|--------------|---------|
| H1 | **Nouveau projet Supabase dans une région du Québec** (AWS `ca-central-1` = Montréal — **[À VÉRIFIER]** que Supabase propose cette région pour le plan utilisé). | Une base existante **ne change pas de région sur place** : copie vers un nouveau projet. |
| H2 | **Migration** : sauvegarde de la base (`pg_dump`), **comptes de connexion avec leurs mots de passe chiffrés** (schéma `auth`), copie des **8 buckets**, redéploiement des **fonctions** et **secrets**, nouvelles clés dans l'app, **bascule de DNS**, vérification, **conservation de l'ancienne base 7 jours puis destruction certifiée**. | Fenêtre d'arrêt courte (nuit / fin de semaine). Voir P2. |
| H3 | **Front-end** : Vercel ne garde aucun renseignement, mais l'hébergeur doit être cité dans la politique ; option de le garder (vérifier certification) ou d'héberger les fichiers statiques au Québec. | **[À VALIDER]** |
| H4 | **Sauvegardes et journaux** (backups, logs, outils de surveillance `infra_metrics`) **au Québec aussi** ; vérifier où Supabase stocke les sauvegardes. | C10 |
| H5 | **Courriels** : côté 2 seulement (les adresses n'existent plus côté 1). Fournisseur hébergé au Canada / Québec ou **remplacé** (ex. serveur de courriel de l'entreprise). | E6 |
| H6 | **Notifications push** : charge utile **sans renseignement** (jamais de nom ni de montant) ; abonnement lié au n° ; évaluer l'impact (services des navigateurs). | C7, E6 |

### 6.3 Côté 2 — gestion (nouveau dépôt, privé)

À créer : application de gestion (noms, courriels, téléphone, paie, TD1, NAS, relevés d'emploi, accidents, annonces, CCQ), sa base au Québec,
l'**interface de lecture** des heures du côté 1 (clé de service **propre au côté 2**, rotation, journal d'accès), la **table n° ↔ personne**
(accès limité, journalisée), la **création des comptes** côté 1 (le côté 2 appelle une fonction du côté 1 qui crée « n° + NIP » sans nom),
le **moteur de paie** (montants), le **registre des incidents**, le **registre des consentements** (copie du côté 1 par n°), l'**export
« Mes renseignements »**. Même exigences de sécurité (double authentification, journal, hébergement au Québec).

### 6.4 Services externes (décision pour chacun)

| Service | Reçoit | Décision proposée |
|---------|--------|-------------------|
| OCR.space | Images de bons de travail et de preuves | **Retirer** (M8) : lecture locale ou service au Québec |
| Google Apps Script / Sheets | Noms + heures approuvées | **Retirer du côté 1** ; si l'export reste utile, le produire **côté 2** (fichier ou hébergement au Québec) |
| Resend / Brevo | Courriels + contenu des annonces | **Côté 2 seulement**, fournisseur à valider (certification, lieu) ou remplacer |
| Vercel / Render | Rien de personnel (statique) | Garder si certification vérifiée, ou héberger au Québec |
| Web Push (navigateurs) | Adresse push + charge | Charge sans renseignement ; aucun nom |
| Supabase | Tout (aujourd'hui) | **Région Québec** (H1) + preuve de certification (E4) |

---

## 7. Plan par phases

Les durées sont des **ordres de grandeur** pour guider la planification, pas des engagements.

### P0 — Décisions et prérequis (1 à 2 semaines, surtout du temps de la propriétaire)

- [ ] **Avis juridique / AECQ** : (a) Sparklog est-il une « application de pointage » ? (b) secteur de l'entreprise ; (c) obligations précises de la **Loi R-20** ;
  (d) « anonymisé » = numéro seul suffisant ? (e) texte officiel et **modèle du formulaire annexe W-1** ; (f) durée de conservation des fiches.
- [ ] **Nommer le responsable** de la protection des renseignements personnels (L1).
- [ ] **Choisir le fournisseur d'hébergement au Québec** et **demander ses preuves** : certificat ISO 27001, rapport SOC 2 Type 1 / Type 2, ou attestation « Cybersécuritaire
  Canada » (section 8). Idem pour chaque service gardé (courriels, front-end).
- [ ] **Créer le dépôt privé du côté 2** et ses accès (équipe réduite).
- [ ] **Trancher** : option (a) ou (b) pour les noms à l'écran (5.4) ; partage du moteur d'heures (5.2).
- **Sortie** : ce document mis à jour avec les réponses (R1…, décisions D1…).

### P1 — Gains rapides, sans migration (2 à 3 semaines)

- [ ] **M1** consentement exprès + refus / retrait (nouvelle table `consentements`, écran, texte du formulaire W-1 fourni en P0).
- [ ] **M2** avis à l'employé pour la soumission d'urgence + étiquette « saisie par l'employeur ».
- [ ] **M12** politique de confidentialité complétée et affichée dans l'app.
- [ ] **M6** test automatique « aucune géolocalisation ».
- [ ] **M10** CSP en application.
- [ ] **M5 (première partie)** : durées fixées, destruction automatique des preuves en photo selon la règle d'une semaine pour ce qui identifie.
- [ ] **M13** registre des incidents + procédure (document + tableau simple), ÉFVP rédigée.
- **Livrable testable** : un employé refuse ou retire son consentement et peut quand même saisir son temps autrement ; aucune fiche d'urgence n'est soumise sans avis.

### P2 — Hébergement au Québec (3 à 4 semaines)

- [ ] **H1** nouveau projet Supabase en région Québec ; **répétition complète** sur une copie (base, comptes, fichiers, fonctions, secrets).
- [ ] **H2** bascule planifiée (fenêtre courte, plan de retour, ancienne base conservée 7 jours puis détruite avec attestation).
- [ ] **H4** vérification des sauvegardes et journaux au Québec.
- [ ] **M8 / M9** : sortir OCR.space et Google du chemin (remplacements).
- [ ] **H5 / H6** : courriels et push revus.
- **Livrable testable** : plus aucune donnée personnelle hors Québec ; test de paie sur une semaine complète identique avant / après.
- **Risque principal** : comptes de connexion et fichiers ; **parade** : répétition sur copie + comparaison des totaux (fiches, photos, utilisateurs).

### P3 — Séparation côté 1 / côté 2 (6 à 10 semaines, la plus grosse)

- [ ] **Côté 2** : nouveau dépôt, base, connexion, interface de lecture des heures, moteur de paie, registres.
- [ ] **Migration des données** : `profiles` découpé (profil minimal côté 1, reste côté 2) ; tables de paie vers le côté 2 ; **journaux réécrits par n°** ; textes nominatifs remplacés.
- [ ] **M3** connexion n° + NIP côté 1, adresses factices, réinitialisation par la gestion ; **M4** retrait des colonnes identifiantes.
- [ ] **Écrans** : gestion, talons, DAS, RE, export CCQ, rapports de coûts passent côté 2 ; le snapshot, la révision et les notifications affichent des **numéros** côté 1 (ou noms via le côté 2, option 5.4).
- [ ] **Tests de parité de paie** entre l'ancien et le nouveau chemin (règle « Payroll logic forks »), semaine par semaine.
- **Livrable testable** : une requête SQL sur la base du côté 1 ne renvoie **aucun** nom, courriel, téléphone, montant de paie ni NAS ; la paie d'une semaine de référence est identique au centime.
- **Risque principal** : casser la paie ou les relevés ; **parade** : migrer **par blocs** (d'abord la lecture seule du côté 2, ensuite les écrans de paie), garder l'ancien chemin jusqu'à la parité.

### P4 — Preuves de certification et ententes (en parallèle de P2 et P3)

- [ ] Dossier « certifications » : une page par fournisseur avec **certificat / rapport, date de validité, portée** (section 8).
- [ ] **Ententes écrites** (confidentialité, sécurité, localisation, incidents, destruction) avec chaque fournisseur (L5).
- [ ] Calendrier de **renouvellement** des preuves (annuel).

### P5 — Documents et gouvernance (en parallèle)

- [ ] **Formulaire annexe W-1** (texte exact), **politique de confidentialité** (contenu C12), **lettre de consentement** mise à jour avec les articles réels
  (`docs/governance/consentement-sparklog-punch.md`), **procédure d'incident**, **procédure de demande d'accès / rectification / retrait** (30 jours),
  **registre des accès** (qui voit quoi, rôles et responsabilités — C12).

### P6 — Vérification finale et maintien

- [ ] **Audit interne** avec la matrice de traçabilité (section 10) : chaque exigence ↔ changement ↔ preuve.
- [ ] **Revue annuelle** : certifications, durées de conservation, accès, incidents, mise à jour de ce document.
- [ ] Surveillance : alerte si un nouveau service externe ou une nouvelle colonne identifiante apparaît (test automatique sur le schéma du côté 1).

---

## 8. Certifications à obtenir des fournisseurs (C11)

Pour chaque fournisseur qui **fait l'application ou héberge** des renseignements : obtenir **au moins une** des preuves suivantes, la conserver au
dossier avec sa date de validité.

| Preuve acceptée par la convention | Ce qu'il faut demander |
|-----------------------------------|------------------------|
| **ISO/IEC 27001** | Certificat valide, organisme certificateur, **portée** (le service et le centre de données utilisés) |
| **SOC 2 Type 1 et Type 2** | Rapport(s) ou lettre de conformité, période couverte |
| **Cybersécuritaire Canada** | Attestation valide |

**Non vérifié ici** : lesquelles de ces certifications détiennent Supabase, Vercel, Google, Resend, Brevo, OCR.space ou l'hébergeur du côté
Québec, et pour quelle portée et quelle région. Ne rien affirmer avant d'avoir le document en main. Le choix du fournisseur du côté 1
doit **commencer** par ce critère.

---

## 9. Ce qui n'a pas été vérifié (à ne pas tenir pour acquis)

- Le **texte officiel** de la convention, de la **Loi R-20**, de ses règlements et de l'**annexe W-1** (seul l'extrait collé le 2026-11-13 a été lu).
- Que Sparklog soit une « application de pointage » et que l'entreprise soit du **secteur résidentiel**.
- Que le **numéro d'employé** suffise comme anonymisation (C10).
- La **région** Québec chez Supabase et les **certifications** de chaque fournisseur.
- Le **lieu d'hébergement** réel d'OCR.space, Resend, Brevo et des sauvegardes Supabase.
- L'obligation de la **Loi R-20** d'héberger au Québec (elle ressort ici de la **convention**, art. 18.01 2) b.3.3).

---

## 10. Matrice de traçabilité (exigence → changement → preuve)

| Exigence | Changements | Preuve attendue |
|----------|-------------|-----------------|
| C1–C4 consentement, refus, retrait | M1 | Table `consentements`, test d'écran, procédure papier documentée |
| C5, C9 appareil | M7 | Revue des autorisations demandées, test |
| C6, C7 (géo) | M6 | Test « aucune géolocalisation », en-tête `Permissions-Policy` |
| C7, C8 (n° d'employé seulement ; destruction 1 semaine) | M3, M4, M5, P3 | Requête de vérification sur la base du côté 1 ; journal de destruction |
| C10 (anonymisé, Québec) | H1–H4, P3 | Capture de la région du projet, requête de vérification, avis juridique sur « anonymisé » |
| C11 (certifications) | P4, section 8 | Dossier des certificats avec dates |
| C12 (politique) | M12, P5 | Politique publiée dans l'app, contenu coché ligne par ligne |
| C13, C15 (pointage lui-même, avis de modification) | M2 | Test : avis envoyé pour toute modification ; étiquette « saisie par l'employeur » |
| C14 (repas) | déjà géré (les employés retirent leur dîner) | Règle documentée |
| C16 (accès aux heures) | M11 | Écran Historique + export |
| L1–L9 (Loi 25) | P0, M13, P4, P5 | Responsable nommé, ÉFVP, ententes, registre, procédures |

---

## 11. Points à décider (par la propriétaire)

1. **D1** Sparklog est-il traité comme application de pointage (hypothèse de ce plan) ? → avis P0.
2. **D2** Noms à l'écran des gestionnaires : option (a) écrans servis par le côté 2, ou (b) numéros côté 1 + noms chargés du côté 2.
3. **D3** Partage du moteur d'heures : le côté 2 appelle le côté 1, ou copie versionnée.
4. **D4** Fournisseur d'hébergement du côté 1 et du côté 2 (un seul ou deux), selon les certifications.
5. **D5** Avenir de l'export Google : retiré, ou reproduit côté 2.
6. **D6** Durée de conservation des fiches de temps (selon R-20 / paie) et des preuves en photo.
7. **D7** Sort des données qui n'ont pas de raison d'être (date de naissance, photo de la carte CCQ) : supprimer ou garder côté 2.

---

## 12. Tenue de ce document

- Chaque PR de conformité **coche** les cases ci-dessus et met à jour la section 10.
- Une exigence confirmée par un avis juridique **remplace** son **[À VALIDER]** par la référence de l'avis (sans nom de personne ni donnée personnelle).
- `README.md`, `NOOB.md` et `CLAUDE.md` renvoient ici (règle « Docs rule »).
