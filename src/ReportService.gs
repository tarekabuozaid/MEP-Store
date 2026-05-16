/**
 * ReportService.gs — Dashboard data, ledger, exports, audit log viewer
 *
 * Admin-only for full views; Keepers get their store only.
 */

const ReportService = (function() {

  /**
   * Get aggregated dashboard data for admin.
   */
  function getDashboardData() {
    AuthService.requireRole([CONFIG.ROLES.ADMIN, CONFIG.ROLES.VIEWER]);

    const movements = DataService.getStockMovementData();
    const items = DataService.getMasterItems(true);
    const locations = DataService.getLocations(true);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Today's transactions
    const todayTxns = movements.filter(m => {
      if (!m.timestamp) return false;
      const t = new Date(m.timestamp);
      t.setHours(0, 0, 0, 0);
      return t.getTime() === today.getTime();
    });

    const todayByType = {
      Receipt: 0, Issuance: 0, Adjustment: 0, Transfer: 0
    };
    todayTxns.forEach(t => {
      if (t.txnType === CONFIG.TXN_TYPES.TRANSFER) {
        // Count each transfer once (OUT side)
        if (t.txnId.endsWith('-OUT')) todayByType.Transfer++;
      } else {
        todayByType[t.txnType] = (todayByType[t.txnType] || 0) + 1;
      }
    });

    // Low stock across all locations
    const lowStockItems = [];
    items.forEach(item => {
      locations.forEach(loc => {
        const balance = DataService.getBalance(item.itemCode, loc.storeCode, movements);
        if (item.minStock > 0 && balance < item.minStock) {
          lowStockItems.push({
            itemCode: item.itemCode,
            itemName: item.itemName,
            unit: item.unit,
            location: loc.storeCode,
            locationName: loc.storeName,
            balance: balance,
            minStock: item.minStock,
            status: balance <= 0 ? 'ZERO' : 'LOW'
          });
        }
      });
    });

    // Sort: zeros first, then lowest ratio
    lowStockItems.sort((a, b) => {
      if (a.status === 'ZERO' && b.status !== 'ZERO') return -1;
      if (b.status === 'ZERO' && a.status !== 'ZERO') return 1;
      return (a.balance / a.minStock) - (b.balance / b.minStock);
    });

    // Recent 10 transactions
    const recent = movements.slice()
      .sort((a, b) => {
        const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return tb - ta;
      })
      .slice(0, CONFIG.DASHBOARD_RECENT_LIMIT);

    // Items per location
    const totalItemsByLocation = locations.map(loc => {
      const itemSet = new Set();
      movements.forEach(m => {
        if (m.location === loc.storeCode) itemSet.add(m.itemCode);
      });
      return {
        location: loc.storeCode,
        locationName: loc.storeName,
        itemCount: itemSet.size
      };
    });

    return {
      todayCount: todayTxns.filter(t => !t.txnId.endsWith('-IN')).length,
      todayByType: todayByType,
      lowStockCount: lowStockItems.length,
      zeroStockCount: lowStockItems.filter(i => i.status === 'ZERO').length,
      lowStockItems: lowStockItems.slice(0, 20),
      recentTransactions: recent,
      totalItemsByLocation: totalItemsByLocation,
      locationCount: locations.length,
      itemCount: items.length
    };
  }

  /**
   * Get the full ledger (admin) or store-scoped (keeper).
   */
  function getLedger(filters) {
    const user = AuthService.getCurrentUser();
    if (!user) throw new Error('UNAUTHORIZED');

    filters = filters || {};
    if (user.role === CONFIG.ROLES.KEEPER) {
      filters.location = user.storeCode;
    }
    return DataService.getTransactions(filters);
  }

  /**
   * Export filtered transactions to a new spreadsheet, return its URL.
   * Admin-only.
   */
  function exportToSheet(filters) {
    AuthService.requireRole(CONFIG.ROLES.ADMIN);
    const transactions = DataService.getTransactions(filters);

    const fileName = 'Aldhafra IMS Export — ' + Utilities.formatDate(new Date(), 'Asia/Dubai', 'yyyy-MM-dd HHmm');
    const newSs = SpreadsheetApp.create(fileName);
    const sheet = newSs.getActiveSheet();
    sheet.setName('Transactions');

    const headers = [
      'TxnID', 'Date', 'TxnType', 'ItemCode', 'ItemName', 'Unit',
      'Qty', 'Location', 'LPO', 'Supplier', 'Requester', 'Receiver',
      'Notes', 'UserEmail', 'Timestamp'
    ];

    sheet.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold').setBackground('#1a3c5e').setFontColor('#ffffff');

    if (transactions.length > 0) {
      const rows = transactions.map(t => [
        t.txnId, t.date, t.txnType, t.itemCode, t.itemName, t.unit,
        t.qty, t.location, t.lpo, t.supplier, t.requester, t.receiver,
        t.notes, t.userEmail, t.timestamp
      ]);
      sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
    }

    sheet.autoResizeColumns(1, headers.length);
    sheet.setFrozenRows(1);

    // Make accessible to current admin
    const file = DriveApp.getFileById(newSs.getId());
    const currentEmail = Session.getActiveUser().getEmail();
    try {
      file.addEditor(currentEmail);
    } catch (e) { /* already an editor */ }

    return {
      success: true,
      url: newSs.getUrl(),
      fileName: fileName,
      rowCount: transactions.length
    };
  }

  /**
   * Get audit log entries with filters.
   */
  function getAuditLog(filters) {
    AuthService.requireRole(CONFIG.ROLES.ADMIN);
    filters = filters || {};
    const limit = Math.min(filters.limit || 200, CONFIG.MAX_QUERY_LIMIT);

    const sheet = getSheet_(CONFIG.SHEETS.AUDIT_LOG);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];

    const data = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
    let entries = data.map(row => ({
      logId:     row[0],
      timestamp: row[1],
      userEmail: String(row[2] || ''),
      action:    String(row[3] || ''),
      entity:    String(row[4] || ''),
      entityId:  String(row[5] || ''),
      details:   String(row[6] || '')
    }));

    if (filters.userEmail) {
      const e = filters.userEmail.toLowerCase();
      entries = entries.filter(x => x.userEmail.toLowerCase().includes(e));
    }
    if (filters.action) {
      entries = entries.filter(x => x.action === filters.action);
    }
    if (filters.dateFrom) {
      const from = new Date(filters.dateFrom);
      entries = entries.filter(x => x.timestamp && new Date(x.timestamp) >= from);
    }
    if (filters.dateTo) {
      const to = new Date(filters.dateTo);
      to.setHours(23, 59, 59, 999);
      entries = entries.filter(x => x.timestamp && new Date(x.timestamp) <= to);
    }

    entries.sort((a, b) => {
      const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return tb - ta;
    });

    return entries.slice(0, limit);
  }

  return {
    getDashboardData: getDashboardData,
    getLedger: getLedger,
    exportToSheet: exportToSheet,
    getAuditLog: getAuditLog
  };
})();

// ─── Client-callable wrappers ──────────────────────────────────────

function api_getDashboardData()      { return ReportService.getDashboardData(); }
function api_getLedger(filters)      { return ReportService.getLedger(filters); }
function api_exportToSheet(filters)  { return ReportService.exportToSheet(filters); }
function api_getAuditLog(filters)    { return ReportService.getAuditLog(filters); }
