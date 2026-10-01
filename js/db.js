// IndexedDB wrapper. All data lives in this browser on this device only.
//   records  - every income / expense / trip / customer / installation / recurring row (keyed by id)
//   receipts - receipt photos and documents (keyed by id)
//   kv       - settings

const NAME = 'taxtrack';
const STORES = ['records', 'receipts', 'kv'];
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('records', { keyPath: 'id' });
      db.createObjectStore('receipts', { keyPath: 'id' });
      db.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const result = fn(t.objectStore(store));
    t.oncomplete = () => resolve(result && 'result' in result ? result.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const getAll = store => tx(store, 'readonly', s => s.getAll());
export const get = (store, key) => tx(store, 'readonly', s => s.get(key));
export const put = (store, value, key) => tx(store, 'readwrite', s => (key === undefined ? s.put(value) : s.put(value, key)));
export const del = (store, key) => tx(store, 'readwrite', s => s.delete(key));
export const clear = store => tx(store, 'readwrite', s => s.clear());

export async function putMany(store, values) {
  if (!values.length) return;
  await tx(store, 'readwrite', s => { for (const v of values) s.put(v); });
}

export async function clearAll() {
  for (const s of STORES) await clear(s);
}

// Ask the browser not to evict our data under storage pressure.
export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist();
  } catch (e) { /* not supported */ }
  return false;
}
