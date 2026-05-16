/**
 * AdminService.gs — Admin-only CRUD for users, items, and locations
 *
 * All functions enforce Admin role. All mutations are audit-logged.
 */

const AdminService = (function() {

  // ─── Users ────────────────────────────────────────────────────────

  function getUsers() {
    AuthService.requireRole(CONFIG.ROLES.ADMIN);
    const sheet = getSheet_(CONFIG.SHEETS.USERS_STORES);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];

    const data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
    return data.map(row => ({
      email:     String(row[0] || '').trim(),
      storeCode: String(row[1] || '').trim(),
      role:      String(row[2] || '').trim(),
      fullName:  String(row[3] || '').trim(),
      isActive:  row[4] === true || String(row[4]).toUpperCase() === 'TRUE',
      addedDate: row[5]
    })).filter(u => u.email);
  }

  function addUser(userData) {
    AuthService.requireRole(CONFIG.ROLES.ADMIN);
    if (!userData || !userData.email) {
      return { success: false, message: 'Email is required' };
    }
    if (!userData.storeCode) {
      return { success: false, message: 'Store code is required' };
    }
    if (!Object.values(CONFIG.ROLES).includes(userData.role)) {
      return { success: false, message: 'Invalid role' };
    }

    // Check duplicate
    const existing = getUsers();
    const emailLower = userData.email.trim().toLowerCase();
    if (existing.some(u => u.email.toLowerCase() === emailLower)) {
      return { success: false, message: 'Email is already registered' };
    }

    // Validate store code (unless Admin = '*')
    if (userData.storeCode !== CONFIG.ADMIN_STORE_CODE && !DataService.isValidLocation(userData.storeCode)) {
      return { success: false, message: 'Store code does not exist' };
    }

    const sheet = getSheet_(CONFIG.SHEETS.USERS_STORES);
    sheet.appendRow([
      userData.email.trim(),
      userData.storeCode.trim(),
      userData.role,
      userData.fullName || '',
      true,
      new Date()
    ]);

    AuditService.log('USER_ADDED', 'Users_Stores', userData.email, {
      storeCode: userData.storeCode,
      role: userData.role
    });

    return { success: true, message: 'User added successfully' };
  }

  function updateUser(email, updates) {
    const currentUser = AuthService.requireRole(CONFIG.ROLES.ADMIN);
    if (!email) return { success: false, message: 'Email is required' };

    // Prevent admin from locking themselves out
    if (email.toLowerCase() === currentUser.email.toLowerCase() && updates.isActive === false) {
      return { success: false, message: 'You cannot disable your own account' };
    }

    const sheet = getSheet_(CONFIG.SHEETS.USERS_STORES);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return { success: false, message: 'User not found' };

    const data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
    const emailLower = email.toLowerCase();
    let rowIdx = -1;
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][0]).toLowerCase() === emailLower) { rowIdx = i; break; }
    }
    if (rowIdx === -1) return { success: false, message: 'User not found' };

    const row = data[rowIdx];
    if (updates.storeCode !== undefined) row[1] = updates.storeCode;
    if (updates.role !== undefined) row[2] = updates.role;
    if (updates.fullName !== undefined) row[3] = updates.fullName;
    if (updates.isActive !== undefined) row[4] = updates.isActive;

    sheet.getRange(rowIdx + 2, 1, 1, 6).setValues([row]);

    AuditService.log('USER_UPDATED', 'Users_Stores', email, updates);
    return { success: true, message: 'Updated' };
  }

  function deactivateUser(email) {
    return updateUser(email, { isActive: false });
  }

  // ─── Master Items ─────────────────────────────────────────────────

  function addItem(itemData) {
    AuthService.requireRole(CONFIG.ROLES.ADMIN);
    if (!itemData || !itemData.itemCode) return { success: false, message: 'Item code is required' };
    if (!itemData.itemName) return { success: false, message: 'Item name is required' };
    if (!itemData.unit) return { success: false, message: 'Unit is required' };

    const existing = DataService.getMasterItems(false);
    const codeUp = itemData.itemCode.trim().toUpperCase();
    if (existing.some(i => i.itemCode.toUpperCase() === codeUp)) {
      return { success: false, message: 'Item code already exists' };
    }

    const sheet = getSheet_(CONFIG.SHEETS.MASTER_ITEMS);
    sheet.appendRow([
      itemData.itemCode.trim(),
      itemData.itemName.trim(),
      itemData.unit.trim(),
      Number(itemData.minStock) || 0,
      itemData.category || '',
      true
    ]);

    AuditService.log('ITEM_ADDED', 'Master_Items', itemData.itemCode, {
      itemName: itemData.itemName,
      unit: itemData.unit
    });

    return { success: true, message: 'Item added' };
  }

  function updateItem(itemCode, updates) {
    AuthService.requireRole(CONFIG.ROLES.ADMIN);
    if (!itemCode) return { success: false, message: 'Item code is required' };

    const sheet = getSheet_(CONFIG.SHEETS.MASTER_ITEMS);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return { success: false, message: 'Item not found' };

    const data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
    const codeUp = String(itemCode).trim().toUpperCase();
    let rowIdx = -1;
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][0]).toUpperCase() === codeUp) { rowIdx = i; break; }
    }
    if (rowIdx === -1) return { success: false, message: 'Item not found' };

    const row = data[rowIdx];
    if (updates.itemName !== undefined) row[1] = updates.itemName;
    if (updates.unit !== undefined) row[2] = updates.unit;
    if (updates.minStock !== undefined) row[3] = Number(updates.minStock);
    if (updates.category !== undefined) row[4] = updates.category;
    if (updates.isActive !== undefined) row[5] = updates.isActive;

    sheet.getRange(rowIdx + 2, 1, 1, 6).setValues([row]);

    AuditService.log('ITEM_UPDATED', 'Master_Items', itemCode, updates);
    return { success: true, message: 'Updated' };
  }

  // ─── Locations ────────────────────────────────────────────────────

  function addLocation(locationData) {
    AuthService.requireRole(CONFIG.ROLES.ADMIN);
    if (!locationData || !locationData.storeCode) return { success: false, message: 'Store code is required' };
    if (!locationData.storeName) return { success: false, message: 'Store name is required' };

    const existing = DataService.getLocations(false);
    const codeUp = locationData.storeCode.trim().toUpperCase();
    if (existing.some(l => l.storeCode.toUpperCase() === codeUp)) {
      return { success: false, message: 'Store code already exists' };
    }

    const sheet = getSheet_(CONFIG.SHEETS.LOCATIONS);
    sheet.appendRow([
      locationData.storeCode.trim(),
      locationData.storeName.trim(),
      true
    ]);

    AuditService.log('LOCATION_ADDED', 'Locations', locationData.storeCode, {
      storeName: locationData.storeName
    });

    return { success: true, message: 'Location added' };
  }

  return {
    getUsers: getUsers,
    addUser: addUser,
    updateUser: updateUser,
    deactivateUser: deactivateUser,
    addItem: addItem,
    updateItem: updateItem,
    addLocation: addLocation
  };
})();

// ─── Client-callable wrappers ──────────────────────────────────────

function api_getUsers()                  { return AdminService.getUsers(); }
function api_addUser(userData)           { return AdminService.addUser(userData); }
function api_updateUser(email, updates)  { return AdminService.updateUser(email, updates); }
function api_deactivateUser(email)       { return AdminService.deactivateUser(email); }
function api_addItem(itemData)           { return AdminService.addItem(itemData); }
function api_updateItem(code, updates)   { return AdminService.updateItem(code, updates); }
function api_addLocation(locationData)   { return AdminService.addLocation(locationData); }
function api_getAllItems()               { AuthService.requireRole(CONFIG.ROLES.ADMIN); return DataService.getMasterItems(false); }
function api_getAllLocations()           { AuthService.requireRole(CONFIG.ROLES.ADMIN); return DataService.getLocations(false); }
