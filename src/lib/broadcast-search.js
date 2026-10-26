// Communications: the search boxes of the employee picker and of « Notifications envoyées ».
// Accents and case are ignored; every typed word must match.
const plain = (value) => String(value || "").toLocaleLowerCase("fr-CA").normalize("NFD").replace(/[̀-ͯ]/g, "");
const words = (query) => plain(query).trim().split(/\s+/).filter(Boolean);

// A sent message matches on its text or on the name of one of its recipients.
export function matchesBroadcastSearch(broadcast, recipientNames, query) {
  const wanted = words(query);
  if (wanted.length === 0) return true;
  const text = plain(broadcast?.body);
  const names = (recipientNames || []).map(plain);
  return wanted.every((word) => text.includes(word) || names.some((name) => name.includes(word)));
}

// An employee of the picker matches on the name or the e-mail.
export function matchesPickerSearch(employee, query) {
  const wanted = words(query);
  if (wanted.length === 0) return true;
  const hay = `${plain(employee?.full_name)} ${plain(employee?.email)}`;
  return wanted.every((word) => hay.includes(word));
}
