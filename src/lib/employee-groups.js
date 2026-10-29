// Groupes d'employés (migration 0114, Gestion V3 › Équipe › Groupes): a name (often a warehouse) and its
// employees. Used to pick Communications recipients in one click and as the warehouses of the minimum stock
// (Inventaire › Minimums par entrepôt, 0121-0122).
// Manager-level only (RLS); a person can be in several groups.
import { supabase } from "@/supabaseClient";
import { DEPARTURE_STATUSES, isNewHire } from "@/lib/signups";
import { withTimeout } from "@/lib/utils";

export const MAX_GROUP_NAME = 60;
export const MAX_GROUP_NOTE = 300;

// Trimmed name, or null when empty or too long (the database refuses the same).
export function cleanGroupName(name) {
  const text = String(name ?? "").replace(/\s+/g, " ").trim();
  return text && text.length <= MAX_GROUP_NAME ? text : null;
}

export function cleanGroupNote(note) {
  const text = String(note ?? "").trim();
  return text ? text.slice(0, MAX_GROUP_NOTE) : null;
}

// Another group already has this name (case and spaces ignored, like the unique index).
export function groupNameTaken(groups, name, exceptId = null) {
  const key = String(name ?? "").replace(/\s+/g, " ").trim().toLocaleLowerCase("fr-CA");
  return (groups || []).some((group) => group.id !== exceptId && group.name.trim().toLocaleLowerCase("fr-CA") === key);
}

// Database rows → { id, name, note, memberIds }, sorted by name.
export function normalizeGroups(rows) {
  return (rows || [])
    .map((row) => ({
      id: row.id,
      name: row.name,
      note: row.note || "",
      memberIds: [...new Set((row.employee_group_members || []).map((member) => member.user_id))],
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr-CA", { sensitivity: "base" }));
}

// Employees of the chosen groups, once each, limited to `allowed` (the accounts that can receive a
// message: not paused) and in the order of that list.
export function groupsTargetIds(groups, groupIds, allowed) {
  const chosen = new Set(groupIds || []);
  const members = new Set((groups || []).filter((group) => chosen.has(group.id)).flatMap((group) => group.memberIds));
  return (allowed || []).filter((person) => members.has(person.id)).map((person) => person.id);
}

// Among the recipients, the new hires who have not started yet (« En attente », 0110): the manager is
// asked whether they get the message too.
export function pendingNewHires(people, targetIds, today) {
  const ids = new Set(targetIds || []);
  return (people || []).filter((person) => ids.has(person.id) && isNewHire(person, today));
}

// Members of a group that can still be shown, in name order; former / paused accounts flagged.
export function groupMembers(group, profiles) {
  const byId = new Map((profiles || []).map((profile) => [profile.id, profile]));
  return (group?.memberIds || [])
    .map((id) => byId.get(id))
    .filter(Boolean)
    .sort((a, b) => (a.full_name || a.email || "").localeCompare(b.full_name || b.email || "", "fr-CA", { sensitivity: "base" }));
}

// Field people who should belong to a group (warehouse) but are in none: crew and subcontractors (not
// office admins, managers or the owner), active or waiting to start, never a paused or former account.
// In name order.
const FIELD_ROLES = new Set(["employee", "subcontractor_1"]);
export function ungroupedPeople(groups, people, today) {
  const grouped = new Set((groups || []).flatMap((group) => group.memberIds || []));
  return (people || [])
    .filter((person) => FIELD_ROLES.has(person.role || "employee") && !grouped.has(person.id))
    .filter((person) => isNewHire(person, today) || (!person.is_paused && !DEPARTURE_STATUSES.includes(person.departure_status)))
    .sort((a, b) => (a.full_name || a.email || "").localeCompare(b.full_name || b.email || "", "fr-CA", { sensitivity: "base" }));
}

// What to write when a group's members change from `before` to `after` (ids).
export function memberChanges(before, after) {
  const was = new Set(before || []);
  const now = new Set(after || []);
  return {
    add: [...now].filter((id) => !was.has(id)),
    remove: [...was].filter((id) => !now.has(id)),
  };
}

export async function fetchGroups() {
  const { data, error } = await withTimeout(
    supabase.from("employee_groups").select("id, name, note, employee_group_members(user_id)").order("name"),
    12000,
  );
  if (error) throw error;
  return normalizeGroups(data);
}

export async function createGroup({ name, note }) {
  const { data, error } = await supabase
    .from("employee_groups")
    .insert({ name: cleanGroupName(name), note: cleanGroupNote(note) })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function updateGroup(id, { name, note }) {
  const { error } = await supabase.from("employee_groups").update({ name: cleanGroupName(name), note: cleanGroupNote(note) }).eq("id", id);
  if (error) throw error;
}

export async function deleteGroup(id) {
  const { error } = await supabase.from("employee_groups").delete().eq("id", id);
  if (error) throw error;
}

export async function saveGroupMembers(groupId, before, after) {
  const { add, remove } = memberChanges(before, after);
  if (add.length) {
    const { error } = await supabase.from("employee_group_members").insert(add.map((user_id) => ({ group_id: groupId, user_id })));
    if (error) throw error;
  }
  if (remove.length) {
    const { error } = await supabase.from("employee_group_members").delete().eq("group_id", groupId).in("user_id", remove);
    if (error) throw error;
  }
}
