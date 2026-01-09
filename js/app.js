/**
 * Budgeting App - Main Application Logic
 */

// DOM Elements
const dashboardView = document.getElementById('dashboard-view');
const inputView = document.getElementById('input-view');
const addBtn = document.getElementById('add-btn');
const backBtn = document.getElementById('back-btn');
const saveBtn = document.getElementById('save-btn');
const exportBtn = document.getElementById('export-btn');
const editTargetBtn = document.getElementById('edit-target-btn');

const monthLabel = document.getElementById('month-label');
const spentAmount = document.getElementById('spent-amount');
const budgetStatus = document.getElementById('budget-status');
const transactionList = document.getElementById('transaction-list');
const emptyState = document.getElementById('empty-state');
const budgetWheel = document.getElementById('budget-wheel');
const budgetUtilization = document.getElementById('budget-utilization');

const amountValue = document.getElementById('amount-value');
const toggleKeyboardBtn = document.getElementById('toggle-keyboard-btn');
const keyboardInput = document.getElementById('keyboard-input');
const wheelPickerSection = document.getElementById('wheel-picker-section');
const categoryBtns = document.querySelectorAll('.category-btn');

const settingsModal = document.getElementById('settings-modal');
const targetInput = document.getElementById('target-input');
const cancelSettingsBtn = document.getElementById('cancel-settings-btn');

const exportModal = document.getElementById('export-modal');
const exportRange = document.getElementById('export-range');
const exportDateRange = document.getElementById('export-date-range');
const exportStartDate = document.getElementById('export-start-date');
const exportEndDate = document.getElementById('export-end-date');
const cancelExportBtn = document.getElementById('cancel-export-btn');
const confirmExportBtn = document.getElementById('confirm-export-btn');
const noteInput = document.getElementById('note-input');

const clearModal = document.getElementById('clear-modal');
const clearRange = document.getElementById('clear-range');
const clearDateRange = document.getElementById('clear-date-range');
const clearStartDate = document.getElementById('clear-start-date');
const clearEndDate = document.getElementById('clear-end-date');
const clearBtn = document.getElementById('clear-btn');
const cancelClearBtn = document.getElementById('cancel-clear-btn');
const confirmClearBtn = document.getElementById('confirm-clear-btn');

const deleteTxModal = document.getElementById('delete-tx-modal');
const cancelDeleteTxBtn = document.getElementById('cancel-delete-tx-btn');
const confirmDeleteTxBtn = document.getElementById('confirm-delete-tx-btn');

// State
let currentAmount = 0;
let selectedCategory = null;
let monthlyTarget = 1000;
let currentTransactions = [];
let useKeyboard = false;
let pendingDeleteTxId = null;

// Wheel picker digit values
const wheelDigits = {
    tens: 0,
    ones: 0
};

// Category colors for the wheel
const categoryColors = {
    Food: '#ff6b6b',
    Gas: '#4ecdc4',
    Utilities: '#ffe66d',
    Misc: '#a29bfe',
    Medical: '#f48fb1',
    Drinks: '#ffab40'
};

/**
 * Sanitize text input to prevent XSS and handle special characters
 */
function sanitizeText(text) {
    if (!text) return '';
    return text
        .trim()
        .replace(/[<>]/g, '')
        .substring(0, 200);
}

/**
 * Initialize the app
 */
async function initApp() {
    await initDB();

    // Load settings
    const savedTarget = await getSetting('monthlyTarget');
    if (savedTarget !== null) {
        monthlyTarget = savedTarget;
    } else {
        // First run: show settings modal
        settingsModal.showModal();
    }
    targetInput.value = monthlyTarget;

    // Set month label
    updateMonthLabel();

    // Load transactions for current month
    await loadCurrentMonthTransactions();

    // Initialize wheel pickers
    initWheelPickers();

    // Register service worker
    registerServiceWorker();
}

/**
 * Register the service worker
 */
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch((err) => {
            console.error('Service Worker registration failed:', err);
        });
    }
}

/**
 * Update month label
 */
function updateMonthLabel() {
    const now = new Date();
    const options = { month: 'long', year: 'numeric' };
    monthLabel.textContent = now.toLocaleDateString('en-US', options);
}

/**
 * Load transactions for the current month
 */
async function loadCurrentMonthTransactions() {
    const now = new Date();
    currentTransactions = await getTransactionsByMonth(now.getFullYear(), now.getMonth());
    renderTransactionList();
    renderBudgetWheel();
}

/**
 * Close all expanded transaction items
 */
function closeAllTransactions() {
    document.querySelectorAll('.transaction-item.expanded').forEach((item) => {
        item.classList.remove('expanded');
        const icon = item.querySelector('.tx-expand-icon');
        const desc = item.querySelector('.tx-description');
        if (icon) icon.classList.remove('expanded');
        if (desc) desc.classList.remove('visible');
    });
}

/**
 * Render the transaction list
 */
function renderTransactionList() {
    transactionList.innerHTML = '';

    if (currentTransactions.length === 0) {
        emptyState.classList.remove('hidden');
        return;
    }

    emptyState.classList.add('hidden');

    // Sort by timestamp descending
    const sorted = [...currentTransactions].sort((a, b) => b.timestamp - a.timestamp);

    sorted.forEach((tx) => {
        const li = document.createElement('li');
        li.className = 'transaction-item';
        li.dataset.id = tx.id;

        const date = new Date(tx.timestamp);
        const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        const descriptionContent = tx.note
            ? tx.note
            : '<span class="tx-description-empty">Description: Empty</span>';

        li.innerHTML = `
      <div class="tx-main-row">
        <span class="tx-expand-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M7 10l5 5 5-5z"/>
          </svg>
        </span>
        <div class="tx-info">
          <span class="tx-category" style="background: ${categoryColors[tx.category]}">${tx.category}</span>
          <span class="tx-date">${dateStr}</span>
        </div>
        <span class="tx-amount">$${tx.amount.toFixed(2)}</span>
        <button class="tx-delete-btn" aria-label="Delete transaction">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
          </svg>
        </button>
      </div>
      <div class="tx-description">
        <span class="tx-description-text">${descriptionContent}</span>
        <button class="tx-edit-btn" aria-label="Edit description">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
          </svg>
        </button>
      </div>
    `;

        const expandIcon = li.querySelector('.tx-expand-icon');
        const descriptionDiv = li.querySelector('.tx-description');

        // Make entire transaction item clickable to expand/collapse
        li.addEventListener('click', (e) => {
            // Don't toggle if clicking the delete or edit buttons
            if (e.target.closest('.tx-delete-btn') || e.target.closest('.tx-edit-btn')) return;

            const isCurrentlyExpanded = li.classList.contains('expanded');

            // Close all other expanded transactions first
            closeAllTransactions();

            // Toggle this one (if it was expanded, it's now closed; if it was closed, open it)
            if (!isCurrentlyExpanded) {
                li.classList.add('expanded');
                expandIcon.classList.add('expanded');
                descriptionDiv.classList.add('visible');
            }
        });

        // Delete button handler
        const deleteBtn = li.querySelector('.tx-delete-btn');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            pendingDeleteTxId = tx.id;
            deleteTxModal.showModal();
        });

        // Edit button handler
        const editBtn = li.querySelector('.tx-edit-btn');
        editBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const newDescription = prompt('Edit description:', tx.note || '');
            if (newDescription !== null) {
                const sanitized = sanitizeText(newDescription);
                await updateTransactionNote(tx.id, sanitized);
                await loadCurrentMonthTransactions();
            }
        });

        transactionList.appendChild(li);
    });
}

/**
 * Render the budget wheel visualization
 */
function renderBudgetWheel() {
    const totalSpent = currentTransactions.reduce((sum, tx) => sum + tx.amount, 0);
    const percentage = Math.min((totalSpent / monthlyTarget) * 100, 100);

    // Update text displays
    spentAmount.textContent = `$${totalSpent.toFixed(0)}`;
    budgetStatus.textContent = `of $${monthlyTarget}`;

    // Update budget utilization label
    const utilizationPercent = monthlyTarget > 0 ? Math.round((totalSpent / monthlyTarget) * 100) : 0;
    budgetUtilization.textContent = `You are at ${utilizationPercent}% budget utilization`;

    // Clear SVG
    budgetWheel.innerHTML = '';

    const size = 200;
    const cx = size / 2;
    const cy = size / 2;
    const radius = 80;
    const strokeWidth = 20;

    // Background circle
    const bgCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    bgCircle.setAttribute('cx', cx);
    bgCircle.setAttribute('cy', cy);
    bgCircle.setAttribute('r', radius);
    bgCircle.setAttribute('fill', 'none');
    bgCircle.setAttribute('stroke', '#2d2d44');
    bgCircle.setAttribute('stroke-width', strokeWidth);
    budgetWheel.appendChild(bgCircle);

    // Category segments
    if (currentTransactions.length > 0) {
        const categoryTotals = {};
        currentTransactions.forEach((tx) => {
            categoryTotals[tx.category] = (categoryTotals[tx.category] || 0) + tx.amount;
        });

        // Ensure target is a number
        const target = parseFloat(monthlyTarget) || 0;

        let accumulatedLength = 0;
        const circumference = 2 * Math.PI * radius;

        // Determine the denominator for normalization:
        // - If under/at budget: use target (segments show % of target, ring may be partially filled)
        // - If over budget: use totalSpent (segments show % of total, ring is completely filled)
        const denominator = totalSpent > target ? totalSpent : target;

        Object.entries(categoryTotals).forEach(([category, amount]) => {
            // Protect against divide by zero (though unlikely given logic)
            const ratio = denominator > 0 ? (amount / denominator) : 0;
            const arcLength = ratio * circumference;

            const path = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            path.setAttribute('cx', cx);
            path.setAttribute('cy', cy);
            path.setAttribute('r', radius);
            path.setAttribute('fill', 'none');
            path.setAttribute('stroke', categoryColors[category]);
            path.setAttribute('stroke-width', strokeWidth);
            path.setAttribute('stroke-dasharray', `${arcLength} ${circumference}`);

            // Stack segments clockwise by offsetting start point
            // Negative offset shifts the pattern right (clockwise along path)
            path.setAttribute('stroke-dashoffset', -accumulatedLength);

            path.style.transition = 'stroke-dasharray 0.3s ease';

            budgetWheel.appendChild(path);

            accumulatedLength += arcLength;
        });
    }

    // Status ring (green -> yellow -> red)
    let statusColor = '#00ff00'; // Bright Green
    if (percentage >= 75 && percentage < 100) {
        statusColor = '#ffff00'; // Bright Yellow
    } else if (percentage >= 100) {
        statusColor = '#ff0000'; // Bright Red
    }

    const statusRing = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    statusRing.setAttribute('cx', cx);
    statusRing.setAttribute('cy', cy);
    statusRing.setAttribute('r', radius + strokeWidth / 2 + 6);
    statusRing.setAttribute('fill', 'none');
    statusRing.setAttribute('stroke', statusColor);
    statusRing.setAttribute('stroke-width', '8');
    statusRing.setAttribute('opacity', '1');
    budgetWheel.appendChild(statusRing);
}

/**
 * Initialize wheel pickers
 */
function initWheelPickers() {
    const columns = document.querySelectorAll('.wheel-column');

    columns.forEach((col) => {
        const digit = col.dataset.digit;
        const itemsContainer = col.querySelector('.wheel-items');

        // Create number items (0-9)
        for (let i = 0; i < 10; i++) {
            const item = document.createElement('div');
            item.className = 'wheel-item';
            item.textContent = i;
            item.dataset.value = i;
            itemsContainer.appendChild(item);
        }

        // Add scroll snap behavior
        col.addEventListener('scroll', () => {
            const itemHeight = 50;
            const scrollTop = col.scrollTop;
            const selectedIndex = Math.round(scrollTop / itemHeight);
            wheelDigits[digit] = Math.min(9, Math.max(0, selectedIndex));
            updateAmountFromWheel();
        });

        // Set initial scroll position
        col.scrollTop = 0;
    });
}

/**
 * Update amount from wheel digits
 */
function updateAmountFromWheel() {
    currentAmount = wheelDigits.tens * 10 + wheelDigits.ones;
    amountValue.textContent = currentAmount;
}

/**
 * Reset input form
 */
function resetInputForm() {
    currentAmount = 0;
    selectedCategory = null;
    wheelDigits.tens = 0;
    wheelDigits.ones = 0;
    amountValue.textContent = '0';
    keyboardInput.value = '';
    noteInput.value = '';

    // Reset wheel scroll positions
    document.querySelectorAll('.wheel-column').forEach((col) => {
        col.scrollTop = 0;
    });

    // Reset category selection
    categoryBtns.forEach((btn) => btn.classList.remove('selected'));

    // Reset to wheel input
    useKeyboard = false;
    wheelPickerSection.classList.remove('hidden');
    keyboardInput.classList.add('hidden');
    toggleKeyboardBtn.textContent = 'Use Keyboard';
}

/**
 * Switch between views
 */
function showView(viewId) {
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
}

// Event Listeners

addBtn.addEventListener('click', () => {
    resetInputForm();
    showView('input-view');
});

backBtn.addEventListener('click', () => {
    resetInputForm();
    showView('dashboard-view');
});

saveBtn.addEventListener('click', async () => {
    // Validate
    if (currentAmount <= 0) {
        alert('Please enter an amount greater than 0.');
        return;
    }
    if (!selectedCategory) {
        alert('Please select a category.');
        return;
    }

    // Save transaction
    const sanitizedNote = sanitizeText(noteInput.value);
    await addTransaction({
        amount: currentAmount,
        category: selectedCategory,
        note: sanitizedNote
    });

    // Reload and go back
    await loadCurrentMonthTransactions();
    resetInputForm();
    showView('dashboard-view');
});

toggleKeyboardBtn.addEventListener('click', () => {
    useKeyboard = !useKeyboard;
    if (useKeyboard) {
        wheelPickerSection.classList.add('hidden');
        keyboardInput.classList.remove('hidden');
        keyboardInput.focus();
        toggleKeyboardBtn.textContent = 'Use Wheel';
    } else {
        wheelPickerSection.classList.remove('hidden');
        keyboardInput.classList.add('hidden');
        toggleKeyboardBtn.textContent = 'Use Keyboard';
    }
});

keyboardInput.addEventListener('input', () => {
    const val = parseFloat(keyboardInput.value) || 0;
    currentAmount = val;
    amountValue.textContent = val.toFixed(2);
});

categoryBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
        categoryBtns.forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedCategory = btn.dataset.category;
    });
});

// Settings modal
settingsModal.addEventListener('close', async () => {
    if (settingsModal.returnValue === 'save') {
        const newTarget = parseFloat(targetInput.value) || 1000;
        monthlyTarget = newTarget;
        await setSetting('monthlyTarget', monthlyTarget);
        renderBudgetWheel();
    }
});

cancelSettingsBtn.addEventListener('click', () => {
    targetInput.value = monthlyTarget;
    settingsModal.close();
});

// Long press on wheel center to edit target
document.querySelector('.wheel-center').addEventListener('click', () => {
    targetInput.value = monthlyTarget;
    settingsModal.showModal();
});

// Edit budget target button
editTargetBtn.addEventListener('click', () => {
    targetInput.value = monthlyTarget;
    settingsModal.showModal();
});

// Export modal
exportBtn.addEventListener('click', async () => {
    const bounds = await getDataDateBounds();
    if (bounds.min && bounds.max) {
        exportStartDate.min = bounds.min.toISOString().split('T')[0];
        exportStartDate.max = bounds.max.toISOString().split('T')[0];
        exportEndDate.min = bounds.min.toISOString().split('T')[0];
        exportEndDate.max = bounds.max.toISOString().split('T')[0];
        exportStartDate.value = bounds.min.toISOString().split('T')[0];
        exportEndDate.value = bounds.max.toISOString().split('T')[0];
    }
    exportRange.value = 'current';
    exportDateRange.classList.add('hidden');
    exportModal.showModal();
});

exportRange.addEventListener('change', () => {
    if (exportRange.value === 'custom') {
        exportDateRange.classList.remove('hidden');
    } else {
        exportDateRange.classList.add('hidden');
    }
});

cancelExportBtn.addEventListener('click', () => {
    exportModal.close();
});

confirmExportBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    exportModal.close();

    if (exportRange.value === 'current') {
        runExportJob('current');
    } else {
        // Custom date range
        const start = new Date(exportStartDate.value);
        start.setHours(0, 0, 0, 0);
        const end = new Date(exportEndDate.value);
        end.setHours(23, 59, 59, 999);
        const transactions = await getTransactionsByDateRange(start, end);
        const filename = `budget_${exportStartDate.value}_to_${exportEndDate.value}.csv`;
        exportToCSV(transactions, filename);
    }
});

// Clear data modal
clearBtn.addEventListener('click', async () => {
    const bounds = await getDataDateBounds();
    if (bounds.min && bounds.max) {
        clearStartDate.min = bounds.min.toISOString().split('T')[0];
        clearStartDate.max = bounds.max.toISOString().split('T')[0];
        clearEndDate.min = bounds.min.toISOString().split('T')[0];
        clearEndDate.max = bounds.max.toISOString().split('T')[0];
        clearStartDate.value = bounds.min.toISOString().split('T')[0];
        clearEndDate.value = bounds.max.toISOString().split('T')[0];
    }
    clearRange.value = 'current';
    clearDateRange.classList.add('hidden');
    clearModal.showModal();
});

clearRange.addEventListener('change', () => {
    if (clearRange.value === 'custom') {
        clearDateRange.classList.remove('hidden');
    } else {
        clearDateRange.classList.add('hidden');
    }
});

cancelClearBtn.addEventListener('click', () => {
    clearModal.close();
});

confirmClearBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    clearModal.close();

    let start, end;
    if (clearRange.value === 'current') {
        const now = new Date();
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    } else {
        start = new Date(clearStartDate.value);
        start.setHours(0, 0, 0, 0);
        end = new Date(clearEndDate.value);
        end.setHours(23, 59, 59, 999);
    }

    const count = await deleteTransactionsByDateRange(start, end);
    alert(`Deleted ${count} transaction(s).`);
    await loadCurrentMonthTransactions();
});

// Delete transaction modal
cancelDeleteTxBtn.addEventListener('click', () => {
    pendingDeleteTxId = null;
    deleteTxModal.close();
});

confirmDeleteTxBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    deleteTxModal.close();

    if (pendingDeleteTxId !== null) {
        await deleteTransaction(pendingDeleteTxId);
        pendingDeleteTxId = null;
        await loadCurrentMonthTransactions();
    }
});

// Initialize app
initApp();
