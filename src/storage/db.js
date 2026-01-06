/**
 * IndexedDB Wrapper for AniMate
 *
 * Provides a clean async API for all database operations.
 * Handles database upgrades and migrations automatically.
 */

import { DB_NAME, DB_VERSION, STORES } from "./schemas.js";

let dbInstance = null;

/**
 * Opens and returns the database connection.
 * Creates stores and indexes on first run or version upgrade.
 */
export async function openDB() {
  if (dbInstance) {
    return dbInstance;
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error("[AniMate DB] Failed to open:", request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      console.log("[AniMate DB] Opened successfully");
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      console.log("[AniMate DB] Upgrading from v" + event.oldVersion + " to v" + event.newVersion);

      // Create all stores
      for (const [storeName, config] of Object.entries(STORES)) {
        if (!db.objectStoreNames.contains(storeName)) {
          const store = db.createObjectStore(storeName, {
            keyPath: config.keyPath,
            autoIncrement: config.autoIncrement
          });

          // Create indexes
          if (config.indexes) {
            for (const idx of config.indexes) {
              store.createIndex(idx.name, idx.keyPath, { unique: false });
            }
          }

          console.log("[AniMate DB] Created store:", storeName);
        }
      }
    };
  });
}

/**
 * Close the database connection
 */
export function closeDB() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

/**
 * Put a record into a store (insert or update)
 */
export async function put(storeName, data) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const request = store.put(data);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get a record by primary key
 */
export async function get(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const request = store.get(key);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get all records from a store
 */
export async function getAll(storeName, count) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const request = store.getAll(null, count);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get records from an index
 */
export async function getAllFromIndex(storeName, indexName, query, count) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const index = store.index(indexName);
    const request = index.getAll(query, count);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get records within a range from an index
 */
export async function getRange(storeName, indexName, lower, upper) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const index = store.index(indexName);
    const range = IDBKeyRange.bound(lower, upper);
    const request = index.getAll(range);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete a record by primary key
 */
export async function remove(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const request = store.delete(key);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete all records where expiresAt < now
 * Used by retention cleanup
 */
export async function deleteExpired(storeName) {
  const db = await openDB();
  const now = Date.now();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);

    // Check if store has expires index
    if (!store.indexNames.contains("by_expires")) {
      resolve(0);
      return;
    }

    const index = store.index("by_expires");
    const range = IDBKeyRange.upperBound(now);
    const request = index.openCursor(range);
    let deleted = 0;

    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        cursor.delete();
        deleted++;
        cursor.continue();
      } else {
        console.log(`[AniMate DB] Deleted ${deleted} expired records from ${storeName}`);
        resolve(deleted);
      }
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * Clear all records from a store
 */
export async function clear(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Count records in a store
 */
export async function count(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const request = store.count();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get the most recent record from a store by timestamp index
 */
export async function getLatest(storeName, indexName = "by_timestamp") {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const index = store.index(indexName);
    const request = index.openCursor(null, "prev"); // Descending order

    request.onsuccess = (event) => {
      const cursor = event.target.result;
      resolve(cursor ? cursor.value : null);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Bulk insert records
 */
export async function bulkPut(storeName, records) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    let count = 0;

    for (const record of records) {
      const request = store.put(record);
      request.onsuccess = () => count++;
    }

    tx.oncomplete = () => resolve(count);
    tx.onerror = () => reject(tx.error);
  });
}

// Export a convenience object with all methods
export const db = {
  openDB,
  closeDB,
  put,
  get,
  getAll,
  getAllFromIndex,
  getRange,
  remove,
  deleteExpired,
  clear,
  count,
  getLatest,
  bulkPut
};
