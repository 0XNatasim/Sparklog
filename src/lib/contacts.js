// Configuration › Contacts: the « contacts » section of profile_references, edited person by person.
// A section (Britton, HILO…) is one reference row; its people are the `contact` blocks of that row.
// Other blocks a manager may have added in Références (a heading, a text) are kept in place.
import { CONTACT_ROLES, sanitizeBlocks, sanitizeRoles } from "./reference-blocks";

export const CONTACTS_SECTION = "contacts";

export function contactSections(references) {
  return (references || [])
    .filter((ref) => ref.section === CONTACTS_SECTION)
    .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || String(a.created_at || "").localeCompare(String(b.created_at || "")));
}

// The people of a section, with the index of their block (to edit it in place).
export function sectionContacts(reference) {
  const blocks = Array.isArray(reference?.blocks) ? reference.blocks : [];
  return blocks.map((block, index) => ({ index, contact: block })).filter((entry) => entry.contact?.type === "contact");
}

export function emptyContact() {
  return { type: "contact", name: "", role: "", roles: [], phone: "", email: "", note: "" };
}

// A contact needs a name, a phone or an email (same rule as sanitizeBlocks).
export function contactIsEmpty(contact) {
  return !["name", "phone", "email"].some((key) => String(contact?.[key] ?? "").trim());
}

// New blocks of a section after saving one contact: `index` = its block, or null to add it after
// the last contact. The result is sanitized, as stored.
export function saveContact(blocks, index, contact) {
  const list = Array.isArray(blocks) ? [...blocks] : [];
  const value = { ...contact, type: "contact", roles: sanitizeRoles(contact.roles) };
  if (index === null || index === undefined) {
    let last = -1;
    list.forEach((block, i) => { if (block?.type === "contact") last = i; });
    list.splice(last + 1, 0, value);
  } else {
    list[index] = value;
  }
  return sanitizeBlocks(list);
}

export function removeContact(blocks, index) {
  return sanitizeBlocks((blocks || []).filter((_, i) => i !== index));
}

// Moves a contact before / after the neighbouring contact; other blocks stay where they are.
export function moveContact(blocks, index, delta) {
  const list = [...(blocks || [])];
  const positions = list.map((block, i) => (block?.type === "contact" ? i : -1)).filter((i) => i >= 0);
  const at = positions.indexOf(index);
  const target = positions[at + delta];
  if (at < 0 || target === undefined) return null;
  [list[index], list[target]] = [list[target], list[index]];
  return list;
}

// Roles offered in the picker: the base list, then every other role already given to someone.
export function availableRoles(references) {
  const custom = [];
  for (const ref of contactSections(references)) {
    for (const { contact } of sectionContacts(ref)) {
      for (const role of contact.roles || []) {
        if (!CONTACT_ROLES.includes(role) && !custom.some((r) => r.toLowerCase() === String(role).toLowerCase())) custom.push(role);
      }
    }
  }
  return [...CONTACT_ROLES, ...custom.sort((a, b) => a.localeCompare(b, "fr"))];
}

// Filter of the list: does this contact have the role?
export function hasRole(contact, role) {
  return (contact?.roles || []).some((r) => String(r).toLowerCase() === String(role).toLowerCase());
}
