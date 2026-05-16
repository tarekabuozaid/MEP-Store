/**
 * DataService.gs — Read operations for master data and stock
 *
 * All reads use batch getValues() for performance.
 * Balance calculation iterates over Stock_Movement once per call.
 */

const DataService = (function() {

  /**
   * Get all master items.
   * @param {boolean} [activeOnly=true]
   * @returns {Array<Object>} [{itemCode, itemName, unit, minStock, category, isActive}]
   */
  function getMasterItems(activeOnly) {
    if (activeOnly === undefined) activeOnly = true;
    const sheet = getSheet_(CONFIG.SHEETS.MASTER_ITEMS);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];

    const data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
    const items = data.map(row => ({
      itemCode: String(row[0] || '').trim(),
      itemName: String(row[1] || '').trim(),
      unit:     String(row[2] || '').trim(),
      minStock: Number(row[3]) || 0,
      category: String(row[4] || '').trim(),
      isActive: row[5] === true || String(row[5]).toUpperCase() === 'TRUE'
    })).filter(item => item.itemCode);

    return activeOnly ? items.filter(i => i.isActive) : items;
  }

  /**
   * Get item by code.
   */
  function getItemDetails(itemCode) {
    if (!itemCode) return null;
    const items = getMasterItems(false);
    const normalized = String(itemCode).trim().toUpperCase();
    return items.find(i => i.itemCode.toUpperCase() === normalized) || null;
  }

  /**
   * Get all locations.
   */
  function getLocations(activeOnly) {
    if (activeOnly === undefined) activeOnly = true;
    const sheet = getSheet_(CONFIG.SHEETS.LOCATIONS);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];

    const data = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
    const locations = data.map(row => ({
      storeCode: String(row[0] || '').trim(),
      storeName: String(row[1] || '').trim(),
      isActive:  row[2] === true || String(row[2]).toUpperCase() === 'TRUE'
    })).filter(l => l.storeCode);

    return activeOnly ? locations.filter(l => l.isActive) : locations;
  }

  /**
   * Validate that a location exists (case-insensitive).
   */
  function isValidLocation(storeCode) {
    if (!storeCode) return false;
    const locations = getLocations(true);
    const normalized = String(storeCode).trim().toUpperCase();
    return locations.some(l => l.storeCode.toUpperCase() === normalized);
  }

  /**
   * Read all stock movement rows once — used by balance calculations.
   * Returns rows as objects for readability.
   */
  function getStockMovementData() {
    const sheet = getSheet_(CONFIG.SHEETS.STOCK_MOVEMENT);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];

    const data = sheet.getRange(2, 1, lastRow - 1, 15).getValues();
    // Convert Date objects to ISO strings so google.script.run can serialize them
    function toDateStr(v) {
      if (!v) return '';
      try { return new Date(v).toISOString().split('T')[0]; } catch(e) { return String(v); }
    }
    function toTsStr(v) {
      if (!v) return '';
      try { return new Date(v).toISOString(); } catch(e) { return String(v); }
    }

    return data.map(function(row) {
      return {
        txnId:     String(row[0] || ''),
        date:      toDateStr(row[1]),
        txnType:   String(row[2] || ''),
        itemCode:  String(row[3] || '').trim(),
        itemName:  String(row[4] || ''),
        unit:      String(row[5] || ''),
        qty:       Number(row[6]) || 0,
        location:  String(row[7] || '').trim(),
        lpo:       String(row[8] || ''),
        supplier:  String(row[9] || ''),
        requester: String(row[10] || ''),
        receiver:  String(row[11] || ''),
        notes:     String(row[12] || ''),
        userEmail: String(row[13] || ''),
        timestamp: toTsStr(row[14])
      };
    }).filter(function(r) { return r.itemCode; });
  }

  /**
   * Single-pass balance computation — O(movements) instead of O(items×locations×movements).
   * Returns a map: "ITEMCODE:LOCATION" → balance number.
   * Always call this once and share the result; never call getBalance() in a loop over items.
   */
  function computeAllBalances(movements) {
    const map = {};
    const data = movements || getStockMovementData();
    data.forEach(function(row) {
      const itemUp = row.itemCode.toUpperCase();
      const locUp  = row.location.toUpperCase();
      const key    = itemUp + ':' + locUp;
      if (!map[key]) map[key] = 0;

      if (row.txnType === CONFIG.TXN_TYPES.TRANSFER) {
        if (row.txnId.endsWith('-OUT')) { map[key] -= row.qty; }
        else if (row.txnId.endsWith('-IN'))  { map[key] += row.qty; }
      } else if (row.txnType === CONFIG.TXN_TYPES.RECEIPT)    { map[key] += row.qty; }
        else if (row.txnType === CONFIG.TXN_TYPES.ISSUANCE)   { map[key] -= row.qty; }
        else if (row.txnType === CONFIG.TXN_TYPES.ADJUSTMENT) { map[key] += row.qty; }
    });
    return map;
  }

  /**
   * Calculate the current balance for ONE item at ONE location.
   * For bulk lookups use computeAllBalances() instead.
   * @param {string} itemCode
   * @param {string} location
   * @param {Array} [cachedData]
   * @returns {number}
   */
  function getBalance(itemCode, location, cachedData) {
    const map = computeAllBalances(cachedData);
    const key = String(itemCode).trim().toUpperCase() + ':' + String(location).trim().toUpperCase();
    return map[key] || 0;
  }

  /**
   * Get the full stock view for a location (or all if '*').
   * Uses single-pass balance computation — O(movements + items×locations).
   * @param {string} location - '*' for all
   * @returns {Array<Object>} [{itemCode, itemName, unit, location, balance, minStock, status}]
   */
  function getStockByLocation(location) {
    const items     = getMasterItems(true);
    const movements = getStockMovementData();
    const balMap    = computeAllBalances(movements);            // single pass
    const locations = (location === CONFIG.ADMIN_STORE_CODE)
      ? getLocations(true).map(function(l) { return l.storeCode; })
      : [location];

    // Only include items that have at least one movement (skip 0-balance items for all-stores view)
    const result = [];
    items.forEach(function(item) {
      locations.forEach(function(loc) {
        const key     = item.itemCode.toUpperCase() + ':' + loc.toUpperCase();
        const balance = balMap[key] || 0;
        let status = 'OK';
        if (balance <= 0) status = 'ZERO';
        else if (balance < item.minStock) status = 'LOW';

        result.push({
          itemCode: item.itemCode,
          itemName: item.itemName,
          unit:     item.unit,
          category: item.category,
          location: loc,
          balance:  balance,
          minStock: item.minStock,
          status:   status
        });
      });
    });

    return result;
  }

  /**
   * Get transactions with filters.
   * @param {Object} filters - {location?, txnType?, itemCode?, dateFrom?, dateTo?, limit?}
   * @returns {Array<Object>}
   */
  function getTransactions(filters) {
    filters = filters || {};
    const limit = Math.min(filters.limit || 500, CONFIG.MAX_QUERY_LIMIT);
    const movements = getStockMovementData();

    let filtered = movements;

    if (filters.location && filters.location !== CONFIG.ADMIN_STORE_CODE) {
      const locUp = String(filters.location).trim().toUpperCase();
      filtered = filtered.filter(r => r.location.toUpperCase() === locUp);
    }

    if (filters.txnType) {
      filtered = filtered.filter(r => r.txnType === filters.txnType);
    }

    if (filters.itemCode) {
      const itemUp = String(filters.itemCode).trim().toUpperCase();
      filtered = filtered.filter(r =>
        r.itemCode.toUpperCase().includes(itemUp) ||
        r.itemName.toUpperCase().includes(itemUp)
      );
    }

    if (filters.dateFrom) {
      const from = new Date(filters.dateFrom);
      filtered = filtered.filter(r => r.date && new Date(r.date) >= from);
    }

    if (filters.dateTo) {
      const to = new Date(filters.dateTo);
      to.setHours(23, 59, 59, 999);
      filtered = filtered.filter(r => r.date && new Date(r.date) <= to);
    }

    // Sort by timestamp desc and limit
    filtered.sort((a, b) => {
      const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return tb - ta;
    });

    return filtered.slice(0, limit);
  }

  return {
    getMasterItems: getMasterItems,
    getItemDetails: getItemDetails,
    getLocations: getLocations,
    isValidLocation: isValidLocation,
    getStockMovementData: getStockMovementData,
    computeAllBalances: computeAllBalances,   // exposed for ReportService
    getBalance: getBalance,
    getStockByLocation: getStockByLocation,
    getTransactions: getTransactions
  };
})();

// ─── Client-callable wrappers ──────────────────────────────────────

function api_getMasterItems() {
  AuthService.requireRole([CONFIG.ROLES.ADMIN, CONFIG.ROLES.KEEPER, CONFIG.ROLES.VIEWER]);
  return DataService.getMasterItems(true);
}

function api_getLocations() {
  AuthService.requireRole([CONFIG.ROLES.ADMIN, CONFIG.ROLES.KEEPER, CONFIG.ROLES.VIEWER]);
  return DataService.getLocations(true);
}

function api_getBalance(itemCode, location) {
  const user = AuthService.getCurrentUser();
  if (!user) throw new Error('UNAUTHORIZED');
  if (user.role === CONFIG.ROLES.KEEPER && user.storeCode !== location) {
    throw new Error('ACCESS_DENIED');
  }
  return DataService.getBalance(itemCode, location);
}

function api_getMyStock() {
  const user = AuthService.getCurrentUser();
  if (!user) throw new Error('UNAUTHORIZED');
  const location = (user.role === CONFIG.ROLES.ADMIN) ? CONFIG.ADMIN_STORE_CODE : user.storeCode;
  return DataService.getStockByLocation(location);
}

function api_getStockByLocation(location) {
  const user = AuthService.requireRole([CONFIG.ROLES.ADMIN, CONFIG.ROLES.VIEWER]);
  return DataService.getStockByLocation(location || CONFIG.ADMIN_STORE_CODE);
}

function api_getMyTransactions(filters) {
  const user = AuthService.getCurrentUser();
  if (!user) throw new Error('UNAUTHORIZED');
  filters = filters || {};
  if (user.role === CONFIG.ROLES.KEEPER) filters.location = user.storeCode;
  return DataService.getTransactions(filters);
}
