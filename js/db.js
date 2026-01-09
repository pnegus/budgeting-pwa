/**
 * IndexedDB Wrapper for Budgeting App
 * Stores transactions and app settings.
 */

const DB_NAME = 'BudgetingAppDB';
const DB_VERSION = 1;

let dbInstance = null;

/**
 * Initialize the database.
 * @returns {Promise<IDBDatabase>}
 */
function initDB() {
    return new Promise((resolve, reject) => {
        if (dbInstance) {
            resolve(dbInstance);
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);

        request.onsuccess = () => {
            dbInstance = request.result;
            resolve(dbInstance);
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            // Transactions store
            if (!db.objectStoreNames.contains('transactions')) {
                const txStore = db.createObjectStore('transactions', {
                    keyPath: 'id',
                    autoIncrement: true
                });
                txStore.createIndex('timestamp', 'timestamp', { unique: false });
                txStore.createIndex('category', 'category', { unique: false });
            }

            // Settings store (key-value)
            if (!db.objectStoreNames.contains('settings')) {
                db.createObjectStore('settings', { keyPath: 'key' });
            }
        };
    });
}

/**
 * Add a new transaction.
 * @param {{ amount: number, category: string, note?: string }} transaction
 * @returns {Promise<number>} The new transaction ID
 */
async function addTransaction(transaction) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('transactions', 'readwrite');
        const store = tx.objectStore('transactions');

        const record = {
            amount: transaction.amount,
            category: transaction.category,
            note: transaction.note || '',
            timestamp: Date.now()
        };

        const request = store.add(record);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Get all transactions for a given month.
 * @param {number} year
 * @param {number} month (0-indexed)
 * @returns {Promise<Array>}
 */
async function getTransactionsByMonth(year, month) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('transactions', 'readonly');
        const store = tx.objectStore('transactions');
        const index = store.index('timestamp');

        const startOfMonth = new Date(year, month, 1).getTime();
        const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59, 999).getTime();
        const range = IDBKeyRange.bound(startOfMonth, endOfMonth);

        const results = [];
        const request = index.openCursor(range);

        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                results.push(cursor.value);
                cursor.continue();
            } else {
                resolve(results);
            }
        };
        request.onerror = () => reject(request.error);
    });
}

/**
 * Get all transactions (for "All Data" export).
 * @returns {Promise<Array>}
 */
async function getAllTransactions() {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('transactions', 'readonly');
        const store = tx.objectStore('transactions');
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Get a setting value.
 * @param {string} key
 * @returns {Promise<any>}
 */
async function getSetting(key) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('settings', 'readonly');
        const store = tx.objectStore('settings');
        const request = store.get(key);

        request.onsuccess = () => {
            resolve(request.result ? request.result.value : null);
        };
        request.onerror = () => reject(request.error);
    });
}

/**
 * Set a setting value.
 * @param {string} key
 * @param {any} value
 * @returns {Promise<void>}
 */
async function setSetting(key, value) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('settings', 'readwrite');
        const store = tx.objectStore('settings');
        const request = store.put({ key, value });

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

/**
 * Delete a transaction by ID.
 * @param {number} id
 * @returns {Promise<void>}
 */
async function deleteTransaction(id) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('transactions', 'readwrite');
        const store = tx.objectStore('transactions');
        const request = store.delete(id);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

/**
 * Update a transaction's note/description.
 * @param {number} id
 * @param {string} note
 * @returns {Promise<void>}
 */
async function updateTransactionNote(id, note) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('transactions', 'readwrite');
        const store = tx.objectStore('transactions');
        const getRequest = store.get(id);

        getRequest.onsuccess = () => {
            const record = getRequest.result;
            if (record) {
                record.note = note;
                const putRequest = store.put(record);
                putRequest.onsuccess = () => resolve();
                putRequest.onerror = () => reject(putRequest.error);
            } else {
                reject(new Error('Transaction not found'));
            }
        };
        getRequest.onerror = () => reject(getRequest.error);
    });
}

/**
 * Get the date bounds of all transactions.
 * @returns {Promise<{min: Date|null, max: Date|null}>}
 */
async function getDataDateBounds() {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('transactions', 'readonly');
        const store = tx.objectStore('transactions');
        const index = store.index('timestamp');

        let min = null;
        let max = null;

        // Get first (min)
        const minReq = index.openCursor();
        minReq.onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
                min = new Date(cursor.value.timestamp);
            }

            // Get last (max)
            const maxReq = index.openCursor(null, 'prev');
            maxReq.onsuccess = (e2) => {
                const cursor2 = e2.target.result;
                if (cursor2) {
                    max = new Date(cursor2.value.timestamp);
                }
                resolve({ min, max });
            };
            maxReq.onerror = () => reject(maxReq.error);
        };
        minReq.onerror = () => reject(minReq.error);
    });
}

/**
 * Get transactions within a date range.
 * @param {Date} startDate
 * @param {Date} endDate
 * @returns {Promise<Array>}
 */
async function getTransactionsByDateRange(startDate, endDate) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('transactions', 'readonly');
        const store = tx.objectStore('transactions');
        const index = store.index('timestamp');

        const range = IDBKeyRange.bound(startDate.getTime(), endDate.getTime());
        const results = [];
        const request = index.openCursor(range);

        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                results.push(cursor.value);
                cursor.continue();
            } else {
                resolve(results);
            }
        };
        request.onerror = () => reject(request.error);
    });
}

/**
 * Delete transactions within a date range.
 * @param {Date} startDate
 * @param {Date} endDate
 * @returns {Promise<number>} Number of deleted transactions
 */
async function deleteTransactionsByDateRange(startDate, endDate) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('transactions', 'readwrite');
        const store = tx.objectStore('transactions');
        const index = store.index('timestamp');

        const range = IDBKeyRange.bound(startDate.getTime(), endDate.getTime());
        let count = 0;
        const request = index.openCursor(range);

        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                cursor.delete();
                count++;
                cursor.continue();
            } else {
                resolve(count);
            }
        };
        request.onerror = () => reject(request.error);
    });
}
