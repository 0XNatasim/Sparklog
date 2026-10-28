# Grok.md — Optimisations UX restantes / nouvelles

Basées sur V2.4.194.  
Priorité visuelle / UX Gestion (le reste du NOOB.md est surtout de la validation de paie / données métier).

Les points ci-dessous sont purement UX et n’interfèrent pas avec les bloqueurs actuels (validation de la paie semaine 43, infos employeur (masse salariale / CNESST), TD1, comparaison avec de vrais talons).

## 1. Command palette (Cmd/Ctrl+K) — très « 2026 »
Recherche rapide de pages, onglets, employés, ou actions (« Approuver la semaine », « Exporter CCQ »). Complète parfaitement le menu imbriqué.

## 2. Amélioration mobile des onglets imbriqués
Sur téléphone, la liste dans le drawer + la rangée horizontale au-dessus de la page peut encore être dense. Possibilités :
- Transformer la rangée mobile en select/dropdown ou bottom sheet plus clair.
- Meilleure indication visuelle de l’onglet actif.

## 3. Breadcrumbs ou contexte plus fort
Dans les hubs (Rapports, Config, Historique paie), afficher un petit fil d’Ariane ou un titre plus explicite « Rapports › Coûts » pour que l’utilisateur sache toujours où il est, même si le menu est replié.

## 4. Recherche globale légère ou filtres persistants
Beaucoup d’écrans (À traiter, Feuilles de temps, Employés) ont déjà des filtres. Une barre de recherche unifiée ou des filtres qui survivent à la navigation améliorerait le flux quotidien.

## 5. Densité / mode compact optionnel
Sur grand écran, option pour réduire un peu le padding des cartes et listes (utile pour les gestionnaires qui traitent beaucoup de fiches).

## 6. Clavier
Navigation au clavier dans le menu (flèches + Entrée) et raccourcis pour les actions fréquentes (approuver, retourner pour correction).

## 7. Polish visuel léger
- États actifs des enfants dans la sidebar encore plus nets.
- Transitions douces à l’ouverture des groupes / onglets.
- Cohérence des icônes (déjà bien avancée avec TAB_ICONS).

---

Les vrais bloqueurs actuels (selon NOOB.md) restent la validation de la paie semaine 43, les infos employeur (masse salariale / CNESST), les TD1, et la comparaison avec de vrais talons. Les points ci-dessus sont purement UX et n’interfèrent pas avec ça.
