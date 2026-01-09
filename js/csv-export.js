/**
 * CSV Export Module using PapaParse
 */

/**
 * Export transactions to CSV and trigger download.
 * @param {Array} transactions - Array of transaction objects
 * @param {string} filename - Name for the downloaded file
 */
function exportToCSV(transactions, filename) {
    if (!transactions || transactions.length === 0) {
        alert('No transactions to export.');
        return;
    }

    // Format data for CSV
    const csvData = transactions.map((tx) => ({
        ID: tx.id,
        Amount: tx.amount.toFixed(2),
        Category: tx.category,
        Note: tx.note || '',
        Date: new Date(tx.timestamp).toLocaleDateString(),
        Time: new Date(tx.timestamp).toLocaleTimeString()
    }));

    // Use PapaParse to convert to CSV string
    const csv = Papa.unparse(csvData, {
        quotes: true,
        header: true
    });

    // Create a Blob and trigger download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
}

/**
 * Async wrapper for export job. Gets data and exports.
 * @param {'current' | 'previous' | 'all'} range
 */
async function runExportJob(range) {
    let transactions = [];
    const now = new Date();
    let filename = 'budget_export.csv';

    try {
        if (range === 'current') {
            transactions = await getTransactionsByMonth(now.getFullYear(), now.getMonth());
            const monthName = now.toLocaleString('default', { month: 'long' });
            filename = `budget_${monthName}_${now.getFullYear()}.csv`;
        } else if (range === 'previous') {
            const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            transactions = await getTransactionsByMonth(prevMonth.getFullYear(), prevMonth.getMonth());
            const monthName = prevMonth.toLocaleString('default', { month: 'long' });
            filename = `budget_${monthName}_${prevMonth.getFullYear()}.csv`;
        } else {
            transactions = await getAllTransactions();
            filename = `budget_all_data_${now.getFullYear()}.csv`;
        }

        exportToCSV(transactions, filename);
    } catch (error) {
        console.error('Export failed:', error);
        alert('Failed to export data. Please try again.');
    }
}
