import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { availableRoles, contactIsEmpty, contactSections, hasRole, moveContact, removeContact, saveContact, sectionContacts } from "./contacts";
import { CONTACT_ROLES, contactRoleLabel, sanitizeBlocks, sanitizeRoles } from "./reference-blocks";
import { MANAGER_NAV, canOpenNavItem } from "./manager-nav";

const olivier = { type: "contact", name: "Olivier Dagenais", role: "Contremaître", phone: "438-828-7070", email: "odagenais@britton.ca" };
const yanni = { type: "contact", name: "Yanni Chabot-Valin", role: "Contremaître", phone: "514-668-3736", email: "yvalin@britton.ca" };
const britton = { id: "b", section: "contacts", title: "Britton", sort_order: 90, blocks: [{ type: "heading", text: "Contremaîtres" }, olivier, yanni] };
const hilo = { id: "h", section: "contacts", title: "HILO", sort_order: 80, blocks: [{ type: "contact", name: "", phone: "438-289-4456", note: "Composez le 7." }] };
const quick = { id: "q", section: "quick", title: "Manuel", sort_order: 10, blocks: [{ type: "link", label: "x", url: "https://x.ca" }] };

describe("contact roles (Configuration › Contacts)", () => {
  it("trims, dedupes (case-insensitive) and caps the roles", () => {
    expect(sanitizeRoles([" inventaire ", "Inventaire", "", "Responsable  camion", null])).toEqual(["inventaire", "Responsable camion"]);
    expect(sanitizeRoles(Array.from({ length: 15 }, (_, i) => `r${i}`))).toHaveLength(10);
    expect(sanitizeRoles(["x".repeat(80)])[0]).toHaveLength(60);
  });

  it("stores roles on the contact block only when there are some (old contacts unchanged)", () => {
    expect(sanitizeBlocks([olivier])[0]).not.toHaveProperty("roles");
    expect(sanitizeBlocks([{ ...olivier, roles: ["inventaire"] }])[0].roles).toEqual(["inventaire"]);
  });

  it("translates the base roles and shows custom roles as written", () => {
    const t = (key) => `T:${key}`;
    expect(contactRoleLabel("temps_supplementaire", t)).toBe("T:contacts.role.temps_supplementaire");
    expect(contactRoleLabel("Responsable camion", t)).toBe("Responsable camion");
  });
});

describe("contacts of a section", () => {
  it("lists only the contacts sections, in order, and their people with their block index", () => {
    expect(contactSections([britton, quick, hilo]).map((r) => r.id)).toEqual(["h", "b"]);
    expect(sectionContacts(britton).map((e) => [e.index, e.contact.name])).toEqual([[1, "Olivier Dagenais"], [2, "Yanni Chabot-Valin"]]);
  });

  it("gives Olivier the inventory role and Yanni the overtime role, keeping the heading", () => {
    let blocks = saveContact(britton.blocks, 1, { ...olivier, roles: ["inventaire"] });
    blocks = saveContact(blocks, 2, { ...yanni, roles: ["temps_supplementaire"] });
    expect(blocks[0]).toEqual({ type: "heading", text: "Contremaîtres" });
    expect(blocks[1].roles).toEqual(["inventaire"]);
    expect(blocks[2].roles).toEqual(["temps_supplementaire"]);
    expect(hasRole(blocks[1], "Inventaire")).toBe(true);
    expect(hasRole(blocks[2], "inventaire")).toBe(false);
  });

  it("adds a new contact after the last contact of the section", () => {
    const blocks = saveContact([...britton.blocks, { type: "text", text: "Fin" }], null, { type: "contact", name: "Mélanie", phone: "514-799-0097", roles: [] });
    expect(blocks.map((b) => b.name || b.text)).toEqual(["Contremaîtres", "Olivier Dagenais", "Yanni Chabot-Valin", "Mélanie", "Fin"]);
  });

  it("removes and moves a contact without touching other blocks", () => {
    expect(removeContact(britton.blocks, 1).map((b) => b.name || b.text)).toEqual(["Contremaîtres", "Yanni Chabot-Valin"]);
    expect(moveContact(britton.blocks, 2, -1).map((b) => b.name || b.text)).toEqual(["Contremaîtres", "Yanni Chabot-Valin", "Olivier Dagenais"]);
    expect(moveContact(britton.blocks, 1, -1)).toBeNull(); // the heading is not a contact
  });

  it("needs a name, a phone or an email", () => {
    expect(contactIsEmpty({ name: " ", phone: "", email: "", note: "x" })).toBe(true);
    expect(contactIsEmpty({ phone: "438-289-4456" })).toBe(false);
  });

  it("offers the base roles then the custom roles already used", () => {
    const withCustom = { ...britton, blocks: [{ ...olivier, roles: ["inventaire", "Responsable camion"] }] };
    expect(availableRoles([withCustom, quick])).toEqual([...CONTACT_ROLES, "Responsable camion"]);
  });
});

describe("wiring", () => {
  const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

  it("adds a Contacts tab to Configuration with the same access as Références (manager only)", () => {
    const config = MANAGER_NAV.flatMap((g) => g.items).find((i) => i.id === "v3-config");
    const tab = config.tabs.find((t) => t.key === "contacts");
    expect(tab.from).toBe("references");
    expect(read("../pages/manager/ManagerPages.jsx")).toMatch(/contacts: \(\) => <ContactsManager \/>/);
    expect(canOpenNavItem("manager", [], config)).toBe(true);
  });

  it("shows the roles on each contact in Profil › Contacts", () => {
    expect(read("../components/ReferenceContent.jsx")).toContain("contactRoleLabel(role, t)");
  });
});
