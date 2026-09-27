export const DRAFT_SCHEMA_VERSION = 1;
export const DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const DB_NAME = "sparklog-local-drafts";
const STORE_NAME = "drafts";
const DB_VERSION = 1;

export function draftKey(userId, editId = null) {
  if (!userId) return null;
  return `${userId}:${editId ? `edit:${editId}` : "new"}`;
}

export function prepareDraftRecord({ userId, editId = null, submissionKey = null, data, now = Date.now() }) {
  return {
    key: draftKey(userId, editId),
    schemaVersion: DRAFT_SCHEMA_VERSION,
    ownerId: userId,
    scope: editId ? `edit:${editId}` : "new",
    submissionKey,
    updatedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + DRAFT_TTL_MS).toISOString(),
    data,
  };
}

export function isUsableDraft(record, { userId, editId = null, now = Date.now() }) {
  return Boolean(record)
    && record.schemaVersion === DRAFT_SCHEMA_VERSION
    && record.key === draftKey(userId, editId)
    && record.ownerId === userId
    && Date.parse(record.expiresAt) > now
    && record.data && typeof record.data === "object";
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("indexeddb_unavailable"));
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("indexeddb_open_failed"));
  });
}

async function transact(mode, operation) {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const request = operation(tx.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("indexeddb_request_failed"));
      tx.onabort = () => reject(tx.error || new Error("indexeddb_transaction_aborted"));
    });
  } finally {
    db.close();
  }
}

export async function saveDraft(input) {
  const record = prepareDraftRecord(input);
  if (!record.key) return null;
  await transact("readwrite", (store) => store.put(record));
  return record;
}

export async function loadDraft({ userId, editId = null, now = Date.now() }) {
  const key = draftKey(userId, editId);
  if (!key) return null;
  const record = await transact("readonly", (store) => store.get(key));
  if (isUsableDraft(record, { userId, editId, now })) return record;
  if (record) await transact("readwrite", (store) => store.delete(key));
  return null;
}

export async function deleteDraft({ userId, editId = null }) {
  const key = draftKey(userId, editId);
  if (!key || typeof indexedDB === "undefined") return;
  await transact("readwrite", (store) => store.delete(key));
}

