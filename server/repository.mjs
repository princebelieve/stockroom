// SQLite is always the local source of truth. MongoDB is reached only through
// the sync service; it is never used as an alternative local database.
const repository = await import('./db.mjs')

export const { getSettings, updateSettings, listProducts, createProduct, adjustStock, createSale, authenticateUser, changePassword, listUsers, createUser, createOwnerSetup, getOwnerMetrics, getReports, exportSalesCsv, listCustomers, createCustomer, adjustCustomerWallet, listExpenses, createExpense, listSales, listMovements, createBackup, getPendingSyncOperations, markSyncOperationsSynced, recordSyncConflicts, listSyncConflicts, resolveSyncConflict, markSyncFailure, getSyncCursor, setSyncCursor, getSyncStatus, applyRemoteOperations, createStocktake, getStocktake, updateStocktakeCount, approveStocktake } = repository
export const storageName = 'SQLite'
