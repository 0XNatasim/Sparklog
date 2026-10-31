// Field Service equipment: the official name of each code of the inventory list (owner's list, 2026-10-31).
// The screenshot reading often returns a garbled or cut name (« E- Contrôleur… », « Module d'expansion pour pla »,
// a leading dot), so the name always comes from the code when the code is known; an unknown code keeps what was read.
// Used by the reading (process_inventory_screenshot) and by every screen that shows a device name.
export const EQUIPMENT_NAMES = Object.freeze({
  EQ000031: "Sonde pour CEE",
  EQ000026: "Contrôleur chauffe-eau Hilo",
  EQ000008: "Gradateur mural intelligent",
  EQ000046: "Sinope - 3000W",
  EQ000047: "Sinope - 4000W",
  EQ000049: "Calypso V1",
  EQ000052: "Calypso V2",
  EQ000016: "Thermostat intelligent Hilo 4000",
  EQ000043: "Ensemble chauffe-eau",
  EQ000025: "Interrupteur auxiliaire (3 voie)",
  EQ000014: "Interrupteur mural intelligent",
  EQ000041: "Module d'expansion pour plancher",
  EQ000017: "Passerelle Hilo",
  EQ000015: "Prise murale intelligente",
  EQ000048: "Sinopé Light (3 fils)",
  EQ000050: "Sonde - Calypso",
  EQ000040: "Thermostat Plancher intelligent Hilo",
});

export function canonicalEquipmentName(code, fallback = "") {
  return EQUIPMENT_NAMES[String(code || "").trim().toUpperCase()] || fallback;
}
