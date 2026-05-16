/**
 * setup.gs — One-time setup script for Aldhafra IMS v2.0
 *
 * Run setupSpreadsheet() ONCE from the Apps Script editor.
 * It will:
 *   1. Create all required sheets
 *   2. Add column headers
 *   3. Initialize Counters
 *   4. Add the current user as Admin in Users_Stores
 *   5. Add sample Locations
 */

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

  // 5. Create Counters with initial data
  const countersSheet = ensureSheet_(ss, CONFIG.SHEETS.COUNTERS, [
    'Prefix', 'Year', 'LastSeq'
  ]);
  if (countersSheet.getLastRow() < 2) {
    const currentYear = new Date().getFullYear();
    countersSheet.getRange(2, 1, 4, 3).setValues([
      ['REC', currentYear, 0],
      ['ISS', currentYear, 0],
      ['ADJ', currentYear, 0],
      ['TRF', currentYear, 0]
    ]);
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
      userEmail,
      CONFIG.ADMIN_STORE_CODE,
      CONFIG.ROLES.ADMIN,
      'System Administrator',
      true,
      new Date()
    ]);
    Logger.log('Added admin user: ' + userEmail);
  }

  // 8. Add sample locations (only if Locations is empty)
  const locSheet = getSheet_(CONFIG.SHEETS.LOCATIONS);
  if (locSheet.getLastRow() < 2) {
    locSheet.getRange(2, 1, 2, 3).setValues([
      ['MZ', 'Madinat Zayed', true],
      ['L',  'Liwa',          true]
    ]);
    Logger.log('Added sample locations: MZ, L');
  }

  // 9. Delete default Sheet1 if it exists and is empty
  const defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet && defaultSheet.getLastRow() === 0 && ss.getSheets().length > 1) {
    ss.deleteSheet(defaultSheet);
  }

  // 10. Freeze headers on all sheets
  Object.values(CONFIG.SHEETS).forEach(name => {
    const sheet = ss.getSheetByName(name);
    if (sheet) sheet.setFrozenRows(1);
  });

  // 11. Log the setup event
  try {
    AuditService.log('SYSTEM_SETUP', 'Spreadsheet', ss.getId(), {
      sheetsCreated: Object.values(CONFIG.SHEETS),
      adminEmail: userEmail
    });
  } catch (e) {
    Logger.log('Warning: could not write audit log: ' + e.message);
  }

  Logger.log('✅ Setup complete!');
  Logger.log('Spreadsheet URL: ' + ss.getUrl());
  Logger.log('Next: Deploy as Web App (Deploy → New deployment → Web app)');

  return {
    success: true,
    spreadsheetId: ss.getId(),
    spreadsheetUrl: ss.getUrl(),
    adminEmail: userEmail
  };
}

/**
 * Ensure a sheet exists with the given headers.
 * If exists, leaves data intact but updates headers.
 */
function ensureSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    Logger.log('Created sheet: ' + name);
  }
  // Always set headers in row 1
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#1a3c5e').setFontColor('#ffffff');
  return sheet;
}

/**
 * Diagnostic — call from editor to verify setup.
 */
function verifySetup() {
  const ss = getSpreadsheet_();
  const report = {
    spreadsheetName: ss.getName(),
    spreadsheetId: ss.getId(),
    sheets: {}
  };

  Object.entries(CONFIG.SHEETS).forEach(([key, name]) => {
    const sheet = ss.getSheetByName(name);
    report.sheets[name] = sheet ? {
      exists: true,
      rows: sheet.getLastRow(),
      cols: sheet.getLastColumn()
    } : { exists: false };
  });

  Logger.log(JSON.stringify(report, null, 2));
  return report;
}
