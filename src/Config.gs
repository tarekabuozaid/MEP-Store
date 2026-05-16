/**
 * Config.gs — Central configuration for Aldhafra IMS v2.0
 *
 * Constants used across all services.
 * Edit SPREADSHEET_ID after creating your Google Sheet (or leave null to use bound sheet).
 */

const CONFIG = {
  // Set to null to use the active spreadsheet (when bound).
  // Set to a string ID to use a specific spreadsheet from a standalone script.
  SPREADSHEET_ID: null,

  // Sheet names — must match exactly
  SHEETS: {
    STOCK_MOVEMENT: 'Stock_Movement',
    MASTER_ITEMS:   'Master_Items',
    LOCATIONS:      'Locations',
    USERS_STORES:   'Users_Stores',
    COUNTERS:       'Counters',
    AUDIT_LOG:      'Audit_Log'
  },

  // Transaction types
  TXN_TYPES: {
    RECEIPT:    'Receipt',
    ISSUANCE:   'Issuance',
    ADJUSTMENT: 'Adjustment',
    TRANSFER:   'Transfer'
  },

  // TxnID prefixes
  TXN_PREFIXES: {
    Receipt:    'REC',
    Issuance:   'ISS',
    Adjustment: 'ADJ',
    Transfer:   'TRF'
  },

  // Roles
  ROLES: {
    ADMIN:  'Admin',
    KEEPER: 'Keeper',
    VIEWER: 'Viewer'
  },

  // Admin wildcard for StoreCode
  ADMIN_STORE_CODE: '*',

  // Date warning threshold (days)
  DATE_WARNING_DAYS: 30,

  // LockService timeout (ms)
  LOCK_TIMEOUT_MS: 10000,

  // Max rows returned in queries (safety)
  MAX_QUERY_LIMIT: 1000,

  // Recent transactions on dashboard
  DASHBOARD_RECENT_LIMIT: 10
};

/**
 * Get the active spreadsheet — either bound or by ID.
 */
function getSpreadsheet_() {
  if (CONFIG.SPREADSHEET_ID) {
    return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  }
  const bound = SpreadsheetApp.getActiveSpreadsheet();
  if (!bound) {
    throw new Error('No spreadsheet found. Set CONFIG.SPREADSHEET_ID in Config.gs.');
  }
  return bound;
}

/**
 * Get a sheet by configured name. Throws if missing.
 */
function getSheet_(sheetName) {
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error(`Sheet "${sheetName}" not found. Run setupSpreadsheet() to create it.`);
  }
  return sheet;
}
