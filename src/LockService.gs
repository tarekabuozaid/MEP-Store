/**
 * LockService.gs — Concurrency protection wrapper
 *
 * Use withLock() around any code that writes to sheets and must not
 * run concurrently (e.g. TxnID generation, balance-affecting writes).
 */

const LockSvc = (function() {

  /**
   * Execute fn() while holding a script-level lock.
   * @param {Function} fn - Function to execute
   * @param {number} [timeoutMs] - Max wait time in ms
   * @returns {*} Whatever fn() returns
   * @throws Error('SYSTEM_BUSY') if lock cannot be acquired
   */
  function withLock(fn, timeoutMs) {
    const lock = LockService.getScriptLock();
    const timeout = timeoutMs || CONFIG.LOCK_TIMEOUT_MS;

    try {
      lock.waitLock(timeout);
    } catch (e) {
      throw new Error('SYSTEM_BUSY: The system is currently busy, please try again in a moment');
    }

    try {
      return fn();
    } finally {
      lock.releaseLock();
    }
  }

  return { withLock: withLock };
})();
