import { describe, it } from "vitest";

// Homologation CCQ — électricien sur plusieurs secteurs (IC, Industriel, Résidentiel léger/lourd, GCV).
// Spec et articles : docs/rules/ccq-electricien-4-secteurs.md (§8). Aucune règle n'est codée ici :
// chaque cas devient un vrai test (et une fixture de parité) quand la règle est confirmée (ADR 0001).
describe("moteur multi-secteurs (à coder)", () => {
  it.todo("T1 lun-ven IC 8 h + dimanche Industriel 8 h → dimanche 200 % taux B");
  it.todo("T2 lun-jeu IC 8 h + ven Industriel 10 h → 9e h 150 % B, 10e h 200 % B (cumul hebdo)");
  it.todo("T3 même jour IC 6 h puis Industriel 4 h → 2 h OT en Industriel (cumul quotidien)");
  it.todo("T4 lun-ven IC 9 h → lundi 150 %, mar-ven 200 % (1re heure OT hebdomadaire)");
  it.todo("T5 lun-ven IC 8 h + samedi résidentiel léger 6 h → 150 % taux R");
  it.todo("T6 lun-ven résidentiel lourd 8 h + samedi IC 4 h → 1 h 150 % C, 3 h 200 % C");
  it.todo("T7 semaine comprimée 4 j IC avec férié lundi → limite 30 h");
  it.todo("T8 mar-ven IC 8 h + dimanche GCV 8 h → 200 % taux D");
  it.todo("T9 2e équipe IC avec OT → prime 12 % non majorée par l'OT");
  it.todo("T10 chef de groupe IC en OT → prime 12 % majorée (22.03)");
  it.todo("T11 résidentiel léger 32 h, réserve 20 h → complété à 40 h, réserve 12 h");
  it.todo("T12 résidentiel lourd 32 h, réserve 20 h → 5,33 h à 150 %, réserve 14,67 h");
  it.todo("T13 IC journée de 10 h puis OT → ½ h repas payée + 30 $");
  it.todo("T14 repos < 8 h entre deux quarts → OT jusqu'à 8 h de repos");
});
