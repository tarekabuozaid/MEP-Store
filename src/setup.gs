/**
 * setup.gs — One-time setup script for Aldhafra IMS v2.0
 *
 * Run setupSpreadsheet() ONCE from the Apps Script editor.
 * It will:
 *   1. Create all required sheets
 *   2. Add column headers
 *   3. Initialize Counters (aligned with legacy TxnID sequences)
 *   4. Add the current user as Admin in Users_Stores
 *   5. Seed the 6 legacy locations from Aldhafra PKG2
 *
 * To update locations on an existing backend, run setupLocations() separately.
 */

// ─── The 6 locations from the legacy .xlsm ───────────────────────────────────
const LEGACY_LOCATIONS = [
  { storeCode: 'MAIN-STORE', storeName: 'Main Store',       isActive: true  },
  { storeCode: 'MZ-S',       storeName: 'MZ',               isActive: true  },
  { storeCode: 'L-S',        storeName: 'LIWA',             isActive: true  },
  { storeCode: 'L-SV',       storeName: 'LIWA-DAILY-C',     isActive: true  },
  { storeCode: 'MZ-SV',      storeName: 'MZ-DAILY-C',       isActive: true  },
  { storeCode: 'Liwa Main Store', storeName: 'Liwa Main Store', isActive: true }
];

// ─── Counters aligned with legacy max sequences ───────────────────────────────
// Legacy: OB-2025 max=1, RCV-2026 max=11, ISS-2026 max=3
// New prefix mapping: RCV → REC, ISS → ISS (same), OB → no new ones expected
const INITIAL_COUNTERS = [
  ['REC', 2026, 11],   // RCV-2026-0011 was last → next will be REC-2026-0012
  ['ISS', 2026, 3],    // ISS-2026-0003 was last → next will be ISS-2026-0004
  ['ADJ', 2026, 0],
  ['TRF', 2026, 0]
];

// ─────────────────────────────────────────────────────────────────────────────

function setupSpreadsheet() {
  const ss = getSpreadsheet_();
  const userEmail = Session.getActiveUser().getEmail();

  Logger.log('Starting setup for spreadsheet: ' + ss.getName());
  Logger.log('Setup user: ' + userEmail);

  // 1. Create Stock_Movement
  ensureSheet_(ss, CONFIG.SHEETS.STOCK_MOVEMENT, [
    'TxnID', 'Date', 'TxnType', 'ItemCode', 'ItemName', 'Unit',
    'Qty', 'Location', 'LPO', 'Supplier', 'Requester', 'Receiver',
    'Notes', 'UserEmail', 'Timestamp'
  ]);

  // 2. Create Master_Items
  ensureSheet_(ss, CONFIG.SHEETS.MASTER_ITEMS, [
    'ItemCode', 'ItemName', 'Unit', 'MinStock', 'Category', 'IsActive'
  ]);

  // 3. Create Locations
  ensureSheet_(ss, CONFIG.SHEETS.LOCATIONS, [
    'StoreCode', 'StoreName', 'IsActive'
  ]);

  // 4. Create Users_Stores
  ensureSheet_(ss, CONFIG.SHEETS.USERS_STORES, [
    'Email', 'StoreCode', 'Role', 'FullName', 'IsActive', 'AddedDate'
  ]);

  // 5. Create Counters — initialise with legacy-aligned sequences
  const countersSheet = ensureSheet_(ss, CONFIG.SHEETS.COUNTERS, [
    'Prefix', 'Year', 'LastSeq'
  ]);
  if (countersSheet.getLastRow() < 2) {
    countersSheet.getRange(2, 1, INITIAL_COUNTERS.length, 3).setValues(INITIAL_COUNTERS);
    Logger.log('Counters initialised (legacy-aligned): ' + JSON.stringify(INITIAL_COUNTERS));
  }

  // 6. Create Audit_Log
  ensureSheet_(ss, CONFIG.SHEETS.AUDIT_LOG, [
    'LogID', 'Timestamp', 'UserEmail', 'Action', 'Entity', 'EntityID', 'Details'
  ]);

  // 7. Add current user as Admin (if not already there)
  const usersSheet = getSheet_(CONFIG.SHEETS.USERS_STORES);
  const existingUsers = usersSheet.getLastRow() > 1
    ? usersSheet.getRange(2, 1, usersSheet.getLastRow() - 1, 1).getValues().flat()
    : [];
  if (!existingUsers.includes(userEmail)) {
    usersSheet.appendRow([
      userEmail, CONFIG.ADMIN_STORE_CODE, CONFIG.ROLES.ADMIN,
      'System Administrator', true, new Date()
    ]);
    Logger.log('Added admin user: ' + userEmail);
  }

  // 8. Seed all 6 legacy locations
  setupLocations();

  // 9. Delete default Sheet1 if empty
  const defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet && defaultSheet.getLastRow() === 0 && ss.getSheets().length > 1) {
    ss.deleteSheet(defaultSheet);
  }

  // 10. Freeze headers on all sheets
  Object.values(CONFIG.SHEETS).forEach(name => {
    const sheet = ss.getSheetByName(name);
    if (sheet) sheet.setFrozenRows(1);
  });

  // 11. Audit
  try {
    AuditService.log('SYSTEM_SETUP', 'Spreadsheet', ss.getId(), {
      sheetsCreated: Object.values(CONFIG.SHEETS),
      adminEmail: userEmail
    });
  } catch (e) {
    Logger.log('Warning: could not write audit log: ' + e.message);
  }

  Logger.log('✅ Setup complete! URL: ' + ss.getUrl());
  return { success: true, spreadsheetId: ss.getId(), spreadsheetUrl: ss.getUrl(), adminEmail: userEmail };
}

/**
 * setupLocations() — can be run independently on an existing backend.
 * Adds any missing locations from LEGACY_LOCATIONS without deleting existing ones.
 */
function setupLocations() {
  const sheet = getSheet_(CONFIG.SHEETS.LOCATIONS);
  const lastRow = sheet.getLastRow();

  const existingCodes = lastRow > 1
    ? sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat().map(c => String(c).trim())
    : [];

  let added = 0;
  LEGACY_LOCATIONS.forEach(loc => {
    if (!existingCodes.includes(loc.storeCode)) {
      sheet.appendRow([loc.storeCode, loc.storeName, loc.isActive]);
      existingCodes.push(loc.storeCode);   // prevent duplicates within this run
      added++;
      Logger.log('Added location: ' + loc.storeCode + ' — ' + loc.storeName);
    } else {
      Logger.log('Location already exists (skipped): ' + loc.storeCode);
    }
  });

  Logger.log('setupLocations complete. Added: ' + added + ', already present: ' + (LEGACY_LOCATIONS.length - added));
  return { added: added, total: LEGACY_LOCATIONS.length };
}

/**
 * Ensure a sheet exists with the given headers.
 */
function ensureSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    Logger.log('Created sheet: ' + name);
  }
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold').setBackground('#1a3c5e').setFontColor('#ffffff');
  return sheet;
}

/**
 * verifySetup() — diagnostic, call from editor to check sheet state.
 */
function verifySetup() {
  const ss = getSpreadsheet_();
  const report = { spreadsheetName: ss.getName(), spreadsheetId: ss.getId(), sheets: {} };

  Object.entries(CONFIG.SHEETS).forEach(([key, name]) => {
    const sheet = ss.getSheetByName(name);
    report.sheets[name] = sheet
      ? { exists: true, rows: sheet.getLastRow(), cols: sheet.getLastColumn() }
      : { exists: false };
  });

  Logger.log(JSON.stringify(report, null, 2));
  return report;
}
