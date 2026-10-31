// On-device storage (IndexedDB). Every record lives in `records`; anything
// changed on this device also goes in `outbox` until the server has it.
// `meta` holds the sync cursor and similar small values. Each account has its
// own database (see account.js).
import { databaseName, takeDroppedDatabase } from "./account.js";

const NAME = databaseName();
// A deleted account's database. IndexedDB runs this before the open below,
// even when the guest database now has the same name.
const dropped = takeDroppedDatabase();
if (dropped) {
  try {
    indexedDB.deleteDatabase(dropped);
  } catch {}
}
const VERSION = 1;

let opening = null;
let memory = null; // used when IndexedDB is unavailable (some private modes)

function open() {
  if (!opening) {
    opening = new Promise((resolve) => {
      let request;
      try {
        request = indexedDB.open(NAME, VERSION);
      } catch {
        return resolve(null);
      }
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("records")) db.createObjectStore("records", { keyPath: "id" });
        if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox", { keyPath: "id" });
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    }).then((db) => {
      if (!db) memory = { records: new Map(), outbox: new Map(), meta: new Map() };
      return db;
    });
  }
  return opening;
}

export const persistent = async () => Boolean(await open());

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function all(store) {
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function loadRecords() {
  const db = await open();
  if (!db) return [...memory.records.values()];
  return all(db.transaction("records").objectStore("records"));
}

// Saves records; `outbox: true` also queues them for the next sync.
export async function putRecords(records, { outbox = false } = {}) {
  if (!records.length) return;
  const db = await open();
  if (!db) {
    for (const record of records) {
      memory.records.set(record.id, record);
      if (outbox) memory.outbox.set(record.id, record);
    }
    return;
  }
  const tx = db.transaction(outbox ? ["records", "outbox"] : ["records"], "readwrite");
  for (const record of records) {
    tx.objectStore("records").put(record);
    if (outbox) tx.objectStore("outbox").put(record);
  }
  return done(tx);
}

export async function loadOutbox() {
  const db = await open();
  if (!db) return [...memory.outbox.values()];
  return all(db.transaction("outbox").objectStore("outbox"));
}

// Drops outbox entries the server now has, unless they were edited again
// while the request was in flight.
export async function ackOutbox(sent) {
  if (!sent.length) return;
  const db = await open();
  if (!db) {
    for (const record of sent) if ((memory.outbox.get(record.id)?.updatedAt || 0) <= record.updatedAt) memory.outbox.delete(record.id);
    return;
  }
  const tx = db.transaction("outbox", "readwrite");
  const store = tx.objectStore("outbox");
  for (const record of sent) {
    const request = store.get(record.id);
    request.onsuccess = () => {
      if (request.result && request.result.updatedAt <= record.updatedAt) store.delete(record.id);
    };
  }
  return done(tx);
}

export async function getMeta(key) {
  const db = await open();
  if (!db) return memory.meta.get(key);
  return new Promise((resolve) => {
    const request = db.transaction("meta").objectStore("meta").get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(undefined);
  });
}

export async function setMeta(key, value) {
  const db = await open();
  if (!db) return void memory.meta.set(key, value);
  const tx = db.transaction("meta", "readwrite");
  tx.objectStore("meta").put(value, key);
  return done(tx);
}
