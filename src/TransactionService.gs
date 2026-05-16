/**
 * TransactionService.gs — Core transaction processing
 *
 * Mirrors the VBA SubmitEntry logic with these fixes:
 *   - O(1) batch reads instead of O(n²) per-row lookups
 *   - LockService prevents TxnID collisions and concurrent writes
 *   - Location is mandatory in balance calculations (per-store isolation)
 *   - Adjustment with negative result triggers a warning
 *   - UserEmail + Timestamp are auto-recorded
 */

const TransactionService = (function() {

  // ─── Public entry point ──────────────────────────────────────────

  /**
   * Submit a transaction.
   * @param {Object} payload - {txnType, date, sourceLocation, destLocation, lpo, supplier, requester, receiver, notes, lines, confirmNegativeAdjustment}
   * @returns {Object} {success, txnId, rowsWritten, errors, warnings}
   */
  function submitTransaction(payload) {
    payload = payload || {};

    // 1. Authorization
    const user = AuthService.getCurrentUser();
    if (!user) return failure_('UNAUTHORIZED: User not identified');
    if (user.role === CONFIG.ROLES.VIEWER) return failure_('ACCESS_DENIED: Read-only permission');
    if (user.role === CONFIG.ROLES.KEEPER && user.storeCode !== payload.sourceLocation) {
      return failure_('ACCESS_DENIED: You are not authorized for location ' + payload.sourceLocation);
    }

    // 2. Validate header
    const headerCheck = validateHeader(payload);
    if (!headerCheck.isValid) {
      return { success: false, errors: headerCheck.errors.map(e => ({ row: 0, message: e })), warnings: headerCheck.warnings };
    }

    // 3. Validate lines
    const linesCheck = validateLines(payload.lines || [], payload.txnType);
    if (linesCheck.validLines.length === 0) {
      return {
        success: false,
        errors: linesCheck.errors.length > 0 ? linesCheck.errors : [{ row: 0, message: 'No valid items in the transaction' }],
        warnings: headerCheck.warnings
      };
    }

    // 4. Check balances (Issuance + Transfer only)
    const allWarnings = headerCheck.warnings.concat(linesCheck.warnings || []);
    const allErrors = linesCheck.errors.slice();

    if (payload.txnType === CONFIG.TXN_TYPES.ISSUANCE || payload.txnType === CONFIG.TXN_TYPES.TRANSFER) {
      const balCheck = checkBalances(linesCheck.validLines, payload.sourceLocation);
      if (!balCheck.passed) {
        allErrors.push.apply(allErrors, balCheck.errors);
      }
      allWarnings.push.apply(allWarnings, balCheck.warnings);
    }

    // 5. Check adjustment for negative result
    if (payload.txnType === CONFIG.TXN_TYPES.ADJUSTMENT) {
      const adjCheck = checkAdjustmentResults(linesCheck.validLines, payload.sourceLocation);
      if (adjCheck.warnings.length > 0 && !payload.confirmNegativeAdjustment) {
        return {
          success: false,
          requiresConfirmation: true,
          errors: [],
          warnings: adjCheck.warnings,
          confirmationField: 'confirmNegativeAdjustment'
        };
      }
    }

    if (allErrors.length > 0) {
      try {
        AuditService.log('TRANSACTION_REJECTED', 'Stock_Movement', '', {
          txnType: payload.txnType,
          location: payload.sourceLocation,
          errors: allErrors
        });
      } catch (e) {}
      return { success: false, errors: allErrors, warnings: allWarnings };
    }

    // 6. Inside lock: generate TxnID + write rows
    try {
      const result = LockSvc.withLock(function() {
        const txnId = generateTxnId(payload.txnType);
        const rowsWritten = writeRows(txnId, payload, linesCheck.validLines, user.email);
        return { txnId: txnId, rowsWritten: rowsWritten };
      });

      try {
        AuditService.log('TRANSACTION_SUBMITTED', 'Stock_Movement', result.txnId, {
          txnType: payload.txnType,
          location: payload.sourceLocation,
          destination: payload.destLocation || null,
          itemCount: linesCheck.validLines.length,
          rowsWritten: result.rowsWritten
        });
      } catch (e) {}

      return {
        success: true,
        txnId: result.txnId,
        rowsWritten: result.rowsWritten,
        errors: [],
        warnings: allWarnings
      };
    } catch (e) {
      return failure_(e.message || 'Unknown error while saving the transaction');
    }
  }

  // ─── Validation ──────────────────────────────────────────────────

  function validateHeader(payload) {
    const errors = [];
    const warnings = [];

    // TxnType
    const validTypes = Object.values(CONFIG.TXN_TYPES);
    if (!payload.txnType || !validTypes.includes(payload.txnType)) {
      errors.push('Unknown transaction type');
    }

    // Date
    if (!payload.date) {
      errors.push('Please enter the date');
    } else {
      const txnDate = new Date(payload.date);
      if (isNaN(txnDate.getTime())) {
        errors.push('Invalid date');
      } else {
        const today = new Date();
        const diffDays = Math.abs((today - txnDate) / (1000 * 60 * 60 * 24));
        if (diffDays > CONFIG.DATE_WARNING_DAYS) {
          warnings.push('Date is more than ' + CONFIG.DATE_WARNING_DAYS + ' days away from today');
        }
      }
    }

    // Source location
    if (!payload.sourceLocation) {
      errors.push('Please select the source location');
    } else if (!DataService.isValidLocation(payload.sourceLocation)) {
      errors.push('Location "' + payload.sourceLocation + '" is not in the list');
    }

    // Transfer-specific
    if (payload.txnType === CONFIG.TXN_TYPES.TRANSFER) {
      if (!payload.destLocation) {
        errors.push('Destination is required for Transfer');
      } else if (!DataService.isValidLocation(payload.destLocation)) {
        errors.push('Destination location "' + payload.destLocation + '" does not exist');
      } else if (payload.destLocation === payload.sourceLocation) {
        errors.push('Source and destination cannot be the same location');
      }
    }

    return { isValid: errors.length === 0, errors: errors, warnings: warnings };
  }

  function validateLines(lines, txnType) {
    const errors = [];
    const validLines = [];
    const masterItems = DataService.getMasterItems(true);
    const masterMap = {};
    masterItems.forEach(i => { masterMap[i.itemCode.toUpperCase()] = i; });

    lines.forEach((line, idx) => {
      const rowNum = idx + 1;
      const code = String(line.itemCode || '').trim();

      // Silent skip: empty or "0"
      if (!code || code === '0') return;

      // Item must exist and be active
      const item = masterMap[code.toUpperCase()];
      if (!item) {
        errors.push({ row: rowNum, message: 'Item code "' + code + '" not found in master items' });
        return;
      }

      // Quantity
      const qty = Number(line.qty);
      if (isNaN(qty)) {
        errors.push({ row: rowNum, message: 'Quantity in row ' + rowNum + ' must be a number' });
        return;
      }
      if (txnType === CONFIG.TXN_TYPES.ADJUSTMENT) {
        if (qty === 0) {
          errors.push({ row: rowNum, message: 'Adjustment quantity in row ' + rowNum + ' cannot be zero' });
          return;
        }
      } else {
        if (qty <= 0) {
          errors.push({ row: rowNum, message: 'Quantity in row ' + rowNum + ' must be greater than zero' });
          return;
        }
      }

      validLines.push({
        itemCode: item.itemCode,
        itemName: item.itemName,
        unit: item.unit,
        qty: qty,
        minStock: item.minStock
      });
    });

    return { validLines: validLines, errors: errors, warnings: [] };
  }

  function checkBalances(validLines, sourceLocation) {
    const errors = [];
    const warnings = [];
    const movements = DataService.getStockMovementData();

    // Aggregate per-item demand (in case same item appears multiple times)
    const demand = {};
    validLines.forEach(line => {
      const k = line.itemCode.toUpperCase();
      demand[k] = (demand[k] || 0) + line.qty;
    });

    validLines.forEach((line, idx) => {
      const balance = DataService.getBalance(line.itemCode, sourceLocation, movements);
      const totalRequested = demand[line.itemCode.toUpperCase()];

      if (totalRequested > balance) {
        errors.push({
          row: idx + 1,
          message: 'Balance of "' + line.itemName + '" at ' + sourceLocation +
                   ' = ' + balance + ' ' + line.unit + ', requested: ' + totalRequested
        });
      } else if (line.minStock > 0 && (balance - totalRequested) < line.minStock) {
        warnings.push(
          'Warning: "' + line.itemName + '" will fall below minimum (' +
          (balance - totalRequested) + '/' + line.minStock + ')'
        );
      }
    });

    return { passed: errors.length === 0, errors: errors, warnings: warnings };
  }

  function checkAdjustmentResults(validLines, sourceLocation) {
    const warnings = [];
    const movements = DataService.getStockMovementData();

    validLines.forEach(line => {
      const balance = DataService.getBalance(line.itemCode, sourceLocation, movements);
      const result = balance + line.qty;
      if (result < 0) {
        warnings.push(
          'Warning: balance of "' + line.itemName + '" will become ' + result +
          ' (negative) after adjustment. Continue?'
        );
      }
    });

    return { warnings: warnings };
  }

  // ─── TxnID generation ────────────────────────────────────────────

  /**
   * Generate a new TxnID. MUST be called inside LockSvc.withLock().
   */
  function generateTxnId(txnType) {
    const prefix = CONFIG.TXN_PREFIXES[txnType];
    if (!prefix) throw new Error('Unknown txnType: ' + txnType);

    const sheet = getSheet_(CONFIG.SHEETS.COUNTERS);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) throw new Error('Counters sheet is empty. Run setupSpreadsheet().');

    const data = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
    const currentYear = new Date().getFullYear();
    let rowIdx = -1;

    for (let i = 0; i < data.length; i++) {
      if (data[i][0] === prefix) { rowIdx = i; break; }
    }

    let newSeq;
    if (rowIdx === -1) {
      sheet.appendRow([prefix, currentYear, 1]);
      newSeq = 1;
    } else {
      const storedYear = data[rowIdx][1];
      const lastSeq = (storedYear === currentYear) ? Number(data[rowIdx][2]) || 0 : 0;
      newSeq = lastSeq + 1;
      sheet.getRange(rowIdx + 2, 2, 1, 2).setValues([[currentYear, newSeq]]);
    }

    return prefix + '-' + currentYear + '-' + String(newSeq).padStart(4, '0');
  }

  // ─── Write rows ──────────────────────────────────────────────────

  function writeRows(txnId, header, validLines, userEmail) {
    const sheet = getSheet_(CONFIG.SHEETS.STOCK_MOVEMENT);
    const timestamp = new Date();
    const txnDate = new Date(header.date);
    const rows = [];

    validLines.forEach(line => {
      const baseRow = function(rowTxnId, location) {
        return [
          rowTxnId,
          txnDate,
          header.txnType,
          line.itemCode,
          line.itemName,
          line.unit,
          line.qty,
          location,
          header.lpo || '',
          header.supplier || '',
          header.requester || '',
          header.receiver || '',
          header.notes || '',
          userEmail,
          timestamp
        ];
      };

      if (header.txnType === CONFIG.TXN_TYPES.TRANSFER) {
        rows.push(baseRow(txnId + '-OUT', header.sourceLocation));
        rows.push(baseRow(txnId + '-IN',  header.destLocation));
      } else {
        rows.push(baseRow(txnId, header.sourceLocation));
      }
    });

    const lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, rows.length, rows[0].length).setValues(rows);

    return rows.length;
  }

  // ─── Helpers ─────────────────────────────────────────────────────

  function failure_(message) {
    return { success: false, errors: [{ row: 0, message: message }], warnings: [] };
  }

  return {
    submitTransaction: submitTransaction,
    validateHeader: validateHeader,
    validateLines: validateLines,
    checkBalances: checkBalances,
    generateTxnId: generateTxnId,
    writeRows: writeRows
  };
})();

// ─── Client-callable wrapper ───────────────────────────────────────

function api_submitTransaction(payload) {
  return TransactionService.submitTransaction(payload);
}
