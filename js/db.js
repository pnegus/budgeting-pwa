/**
 * IndexedDB Wrapper for Budgeting App
 * Stores transactions, budgets, and app settings.
 */

const DB_NAME = 'BudgetingAppDB';
const DB_VERSION = 2; // Bumped for multi-budget support

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
            const oldVersion = event.oldVersion;
            const transaction = event.target.transaction;

            // Transactions store
            if (!db.objectStoreNames.contains('transactions')) {
                const txStore = db.createObjectStore('transactions', {
                    keyPath: 'id',
                    autoIncrement: true
                });
                txStore.createIndex('timestamp', 'timestamp', { unique: false });
                txStore.createIndex('category', 'category', { unique: false });
                txStore.createIndex('budgetId', 'budgetId', { unique: false });
            } else if (oldVersion < 2) {
                // Add budgetId index to existing transactions store
                const txStore = transaction.objectStore('transactions');
                if (!txStore.indexNames.contains('budgetId')) {
                    txStore.createIndex('budgetId', 'budgetId', { unique: false });
                }
            }

            // Settings store (key-value)
            if (!db.objectStoreNames.contains('settings')) {
                db.createObjectStore('settings', { keyPath: 'key' });
            }

            // Budgets store (new in v2)
            if (!db.objectStoreNames.contains('budgets')) {
                db.createObjectStore('budgets', {
                    keyPath: 'id',
                    autoIncrement: true
                });
            }

            // Migration from v1 to v2
            if (oldVersion < 2 && oldVersion > 0) {
                // We need to create a default budget and migrate all transactions
                // This is handled after onsuccess since we need to read settings first
            }
        };
    }).then(async (db) => {
        // Post-upgrade migration: check if we need to migrate data
        await runMigrationIfNeeded(db);
        return db;
    });
}

/**
 * Run one-time migration for existing data
 */
async function runMigrationIfNeeded(db) {
    const migrationDone = await getSettingInternal(db, 'migrationV2Done');
    if (migrationDone) return;

    // Check if there are any budgets
    const budgets = await getAllBudgetsInternal(db);
    if (budgets.length > 0) {
        // Already have budgets, mark migration done
        await setSettingInternal(db, 'migrationV2Done', true);
        return;
    }

    // Get old monthlyTarget setting
    const oldTarget = await getSettingInternal(db, 'monthlyTarget') || 1000;

    // Create default budget
    const defaultBudgetId = await createBudgetInternal(db, 'Personal Budget', oldTarget);

    // Update all existing transactions with the default budgetId
    await migrateTransactionsToBudget(db, defaultBudgetId);

    // Set current budget
    await setSettingInternal(db, 'currentBudgetId', defaultBudgetId);

    // Mark migration done
    await setSettingInternal(db, 'migrationV2Done', true);
}

/**
 * Internal helper to get a setting
 */
function getSettingInternal(db, key) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction('settings', 'readonly');
        const store = tx.objectStore('settings');
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result ? request.result.value : null);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Internal helper to set a setting
 */
function setSettingInternal(db, key, value) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction('settings', 'readwrite');
        const store = tx.objectStore('settings');
        const request = store.put({ key, value });
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

/**
 * Internal helper to create a budget
 */
function createBudgetInternal(db, name, target) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction('budgets', 'readwrite');
        const store = tx.objectStore('budgets');
        const record = { name, target, created: Date.now() };
        const request = store.add(record);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Internal helper to get all budgets
 */
function getAllBudgetsInternal(db) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction('budgets', 'readonly');
        const store = tx.objectStore('budgets');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Migrate all transactions to a specific budget
 */
function migrateTransactionsToBudget(db, budgetId) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction('transactions', 'readwrite');
        const store = tx.objectStore('transactions');
        const request = store.openCursor();

        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                const record = cursor.value;
                if (!record.budgetId) {
                    record.budgetId = budgetId;
                    cursor.update(record);
                }
                cursor.continue();
            } else {
                resolve();
            }
        };
        request.onerror = () => reject(request.error);
    });
}

// ============ Public Budget Methods ============

/**
 * Create a new budget.
 * @param {string} name
 * @param {number} target
 * @returns {Promise<number>} The new budget ID
 */
async function createBudget(name, target = 1000) {
    const db = await initDB();
    return createBudgetInternal(db, name, target);
}

/**
 * Get a budget by ID.
 * @param {number} id
 * @returns {Promise<Object|null>}
 */
async function getBudget(id) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('budgets', 'readonly');
        const store = tx.objectStore('budgets');
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Get all budgets.
 * @returns {Promise<Array>}
 */
async function getAllBudgets() {
    const db = await initDB();
    return getAllBudgetsInternal(db);
}

/**
 * Update a budget.
 * @param {number} id
 * @param {{ name?: string, target?: number }} updates
 * @returns {Promise<void>}
 */
async function updateBudget(id, updates) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('budgets', 'readwrite');
        const store = tx.objectStore('budgets');
        const getRequest = store.get(id);

        getRequest.onsuccess = () => {
            const record = getRequest.result;
            if (record) {
                if (updates.name !== undefined) record.name = updates.name;
                if (updates.target !== undefined) record.target = updates.target;
                const putRequest = store.put(record);
                putRequest.onsuccess = () => resolve();
                putRequest.onerror = () => reject(putRequest.error);
            } else {
                reject(new Error('Budget not found'));
            }
        };
        getRequest.onerror = () => reject(getRequest.error);
    });
}

// ============ Transaction Methods (Updated for budgetId) ============

/**
 * Add a new transaction.
 * @param {{ amount: number, category: string, note?: string, budgetId: number }} transaction
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
            budgetId: transaction.budgetId,
            timestamp: Date.now()
        };

        const request = store.add(record);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Get all transactions for a given month and budget.
 * @param {number} year
 * @param {number} month (0-indexed)
 * @param {number} budgetId
 * @returns {Promise<Array>}
 */
async function getTransactionsByMonth(year, month, budgetId) {
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
                if (cursor.value.budgetId === budgetId) {
                    results.push(cursor.value);
                }
                cursor.continue();
            } else {
                resolve(results);
            }
        };
        request.onerror = () => reject(request.error);
    });
}

/**
 * Get all transactions for a budget (for export).
 * @param {number} budgetId
 * @returns {Promise<Array>}
 */
async function getAllTransactions(budgetId) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('transactions', 'readonly');
        const store = tx.objectStore('transactions');
        const index = store.index('budgetId');
        const request = index.getAll(budgetId);

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
    return getSettingInternal(db, key);
}

/**
 * Set a setting value.
 * @param {string} key
 * @param {any} value
 * @returns {Promise<void>}
 */
async function setSetting(key, value) {
    const db = await initDB();
    return setSettingInternal(db, key, value);
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
 * Get the date bounds of all transactions for a budget.
 * @param {number} budgetId
 * @returns {Promise<{min: Date|null, max: Date|null}>}
 */
async function getDataDateBounds(budgetId) {
    const db = await initDB();
    // Get all transactions for budget and find min/max
    const transactions = await getAllTransactions(budgetId);
    if (transactions.length === 0) {
        return { min: null, max: null };
    }

    const timestamps = transactions.map(t => t.timestamp);
    return {
        min: new Date(Math.min(...timestamps)),
        max: new Date(Math.max(...timestamps))
    };
}

/**
 * Get transactions within a date range for a budget.
 * @param {Date} startDate
 * @param {Date} endDate
 * @param {number} budgetId
 * @returns {Promise<Array>}
 */
async function getTransactionsByDateRange(startDate, endDate, budgetId) {
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
                if (cursor.value.budgetId === budgetId) {
                    results.push(cursor.value);
                }
                cursor.continue();
            } else {
                resolve(results);
            }
        };
        request.onerror = () => reject(request.error);
    });
}

/**
 * Delete transactions within a date range for a budget.
 * @param {Date} startDate
 * @param {Date} endDate
 * @param {number} budgetId
 * @returns {Promise<number>} Number of deleted transactions
 */
async function deleteTransactionsByDateRange(startDate, endDate, budgetId) {
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
                if (cursor.value.budgetId === budgetId) {
                    cursor.delete();
                    count++;
                }
                cursor.continue();
            } else {
                resolve(count);
            }
        };
        request.onerror = () => reject(request.error);
    });
}

