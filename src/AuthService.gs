/**
 * AuthService.gs — Authentication and authorization
 *
 * All access control flows through this service.
 * Users are looked up in the Users_Stores sheet.
 */

const AuthService = (function() {

  /**
   * Fetch user info from Users_Stores by email.
   * @param {string} email - Gmail address
   * @returns {Object|null} user info or null if not found / inactive
   */
  function getUserInfo(email) {
    if (!email) return null;

    const sheet = getSheet_(CONFIG.SHEETS.USERS_STORES);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return null;

    const data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
    const normalizedEmail = String(email).trim().toLowerCase();

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowEmail = String(row[0] || '').trim().toLowerCase();
      if (rowEmail === normalizedEmail) {
        const isActive = row[4] === true || String(row[4]).toUpperCase() === 'TRUE';
        if (!isActive) return null;
        return {
          email:     row[0],
          storeCode: String(row[1] || '').trim(),
          role:      String(row[2] || '').trim(),
          fullName:  String(row[3] || '').trim(),
          isActive:  true,
          addedDate: row[5]
        };
      }
    }
    return null;
  }

  /**
   * Get the current session user.
   * @returns {Object|null}
   */
  function getCurrentUser() {
    const email = Session.getActiveUser().getEmail();
    return getUserInfo(email);
  }

  /**
   * Check if a user has access to a specific store and role.
   * @param {string} email
   * @param {string|null} requiredStoreCode - null = any store
   * @param {string|null} requiredRole - null = any non-viewer role
   * @returns {boolean}
   */
  function checkAccess(email, requiredStoreCode, requiredRole) {
    const user = getUserInfo(email);
    if (!user) return false;

    // Admin can do anything
    if (user.role === CONFIG.ROLES.ADMIN) return true;

    // Role check
    if (requiredRole && user.role !== requiredRole) return false;

    // Store check
    if (requiredStoreCode !== null && requiredStoreCode !== undefined) {
      if (user.storeCode === CONFIG.ADMIN_STORE_CODE) return true;
      if (user.storeCode !== requiredStoreCode) return false;
    }

    return true;
  }

  /**
   * Throw an UNAUTHORIZED error if the current user can't perform the action.
   * Use at the start of every server function that mutates data.
   */
  function requireRole(role) {
    const user = getCurrentUser();
    if (!user) throw new Error('UNAUTHORIZED: User not identified');
    if (user.role === CONFIG.ROLES.ADMIN) return user;
    if (Array.isArray(role)) {
      if (!role.includes(user.role)) {
        throw new Error('ACCESS_DENIED: You do not have permission for this action');
      }
    } else if (user.role !== role) {
      throw new Error('ACCESS_DENIED: You do not have permission for this action');
    }
    return user;
  }

  /**
   * Throw an error if the user doesn't have access to a specific store.
   */
  function requireStoreAccess(storeCode) {
    const user = getCurrentUser();
    if (!user) throw new Error('UNAUTHORIZED');
    if (user.role === CONFIG.ROLES.ADMIN) return user;
    if (user.storeCode === CONFIG.ADMIN_STORE_CODE) return user;
    if (user.storeCode !== storeCode) {
      throw new Error('ACCESS_DENIED: You are not authorized for location ' + storeCode);
    }
    return user;
  }

  /**
   * True if user is Admin.
   */
  function isAdmin(user) {
    return user && user.role === CONFIG.ROLES.ADMIN;
  }

  return {
    getUserInfo: getUserInfo,
    getCurrentUser: getCurrentUser,
    checkAccess: checkAccess,
    requireRole: requireRole,
    requireStoreAccess: requireStoreAccess,
    isAdmin: isAdmin
  };
})();

/**
 * Client-callable wrapper.
 */
function api_getCurrentUserInfo() {
  return AuthService.getCurrentUser();
}
