/**
 * AuditService.gs — Audit log writer
 *
 * Records every important event to the Audit_Log sheet.
 * NEVER throws — audit failures must not break transactions.
 */

const AuditService = (function() {

  /**
   * Write an audit log entry.
   * @param {string} action - From ACTIONS list below
   * @param {string} entity - Entity affected: 'Stock_Movement' | 'Users_Stores' | ...
   * @param {string} entityId - ID of the entity (TxnID, email, etc.)
   * @param {Object} [details] - Additional details (will be JSON-stringified)
   */
  function log(action, entity, entityId, details) {
    try {
      const sheet = getSheet_(CONFIG.SHEETS.AUDIT_LOG);
      const userEmail = (Session.getActiveUser() && Session.getActiveUser().getEmail()) || 'system';
      const logId = sheet.getLastRow();  // Used as auto-increment

      sheet.appendRow([
        logId,
        new Date(),
        userEmail,
        action || 'UNKNOWN',
        entity || '',
        entityId || '',
        details ? JSON.stringify(details) : ''
      ]);
    } catch (e) {
      // Silent failure — audit must never break the main flow
      try { Logger.log('Audit failed: ' + e.message); } catch (_) {}
    }
  }

  return {
    log: log,
    ACTIONS: {
      LOGIN:                 'LOGIN',
      UNAUTHORIZED_ACCESS:   'UNAUTHORIZED_ACCESS',
      TRANSACTION_SUBMITTED: 'TRANSACTION_SUBMITTED',
      TRANSACTION_REJECTED:  'TRANSACTION_REJECTED',
      USER_ADDED:            'USER_ADDED',
      USER_UPDATED:          'USER_UPDATED',
      USER_DEACTIVATED:      'USER_DEACTIVATED',
      ITEM_ADDED:            'ITEM_ADDED',
      ITEM_UPDATED:          'ITEM_UPDATED',
      LOCATION_ADDED:        'LOCATION_ADDED',
      SYSTEM_SETUP:          'SYSTEM_SETUP'
    }
  };
})();
