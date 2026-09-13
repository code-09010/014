// IndexedDB 持久化：零后端，方案全部存在浏览器本地
const DB_NAME = 'window-display';
const STORE = 'plans';

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function savePlan(plan) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const req = plan.id == null ? store.add(plan) : store.put(plan);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function listPlans() {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    req.onsuccess = () =>
      resolve((req.result || []).sort((a, b) => b.updatedAt - a.updatedAt));
    req.onerror = () => reject(req.error);
  });
}

export async function deletePlan(id) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
