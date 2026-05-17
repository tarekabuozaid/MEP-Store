# Aldhafra IMS v2.1 Roadmap

**Status:** v2.0 ✅ Live & Operational | v2.1 Improvements Planned  
**Last Updated:** 17 May 2026  
**Deployment URL (v2):** `https://script.google.com/macros/s/AKfycbw3k7biBWAHQlLIkoFyvN008WDgzDCl6LIUz96M0zJqvaKXwGCK6DMtyDKZb2aW79kd/exec`

---

## Overview

v2.0 launched successfully with core transaction tracking, role-based access, and audit trails. v2.1 focuses on three areas:

1. **Daily Operations** — Features that directly improve day-to-day workflow
2. **Efficiency** — UI/UX improvements that save time
3. **Business Value** — Advanced features that reduce manual work

This roadmap is prioritized and ready for phased implementation. Each feature includes file references, server function names, and estimated effort.

---

## Priority 1: Daily Operations Impact

These features directly affect how keepers and admins work every day.

### 1. Item Drill-Down — Click Item History

**Problem:** Admins cannot trace where a specific item has moved across stores over time without manual ledger review.

**Solution:** Clicking any item in Stock or AllStock view opens a detailed transaction history for that item across all locations.

**User Flow:**
1. Keeper/Admin: Stock view → see all items with balances
2. Click any item code or name
3. Modal opens showing: all receipts, issuances, adjustments, transfers for that item
4. Filters: date range, transaction type, location

**Files to Create/Modify:**
- New file: `view_item_history.html` — history modal UI
- Modify: `view_stock.html`, `view_allstock.html` — add click handlers to item rows
- Modify: `scripts.html` — add `openItemHistory(itemCode)` function

**Server Functions:**
- New: `DataService.getItemHistory(itemCode, filters)` — returns all Stock_Movement rows for that item
  - Parameters: `itemCode`, `fromDate`, `toDate`, `txnType`, `location`
  - Returns: array of rows sorted by date descending
  - Should filter out inactive items gracefully

**Estimated Effort:** 3–4 hours (UI + server lookup)

**Testing Checklist:**
- Click on item in Stock view → history loads
- Filter by date range works
- Filter by transaction type works (show only Receipts, etc.)
- Item with no history shows "No transactions"
- AllStock view also opens history correctly

---

### 2. Print & PDF — Transaction Slip + Filtered View

**Problem:** After entering a transaction, keeper has no way to print a receipt. Admin cannot print current filtered view of stock.

**Solution:** Add print buttons and print stylesheets.

**User Flows:**
- **Entry form:** After saving transaction → "Print Slip" button appears, shows receipt-style printout
- **Stock view:** Print button → prints current filtered table (respecting filters applied by user)

**Files to Create/Modify:**
- Modify: `view_entry.html` — add print button after successful save
- Modify: `view_stock.html`, `view_allstock.html` — add print button above table
- New CSS: add `@media print` rules in `styles.html`

**Server Functions:**
- None required (purely UI-based CSS print)

**Print Stylesheet Guidelines:**
- Hide navigation bar, filters, buttons
- Keep table headers visible
- Use black text on white background
- Add transaction header: date, txn ID, keeper name, store
- Footer: page number, print date/time

**Estimated Effort:** 2–3 hours (CSS + print UI)

**Testing Checklist:**
- Print entry slip after save
- Print is readable and shows all required fields
- Print stock view with filters applied
- Verify filters do NOT affect printed content (shows filtered items only, not all)
- Test on actual printer (not just browser print preview)

---

### 3. Keeper Dashboard — Mini Home Screen

**Problem:** Keepers currently land on "New Transaction" with no context. They don't see their store's health at a glance.

**Solution:** Add a landing dashboard showing own-store KPIs and quick actions.

**Dashboard Cards (Keeper view):**
- **Items in Stock:** Count of items with Qty > 0
- **Low Stock Count:** Count of items where Qty < MinStock
- **Last 5 Transactions:** Table of recent entries in their store (TxnID, date, type, item, qty)
- **Quick Actions:** Buttons to "New Transaction", "View My Stock", "My History"

**Files to Create/Modify:**
- New file: `view_keeper_dashboard.html` — dashboard layout
- Modify: `scripts.html` — router logic to show Keeper Dashboard as default landing
- Modify: `Index.html` — update navigation to highlight Dashboard link for keepers

**Server Functions:**
- New: `ReportService.getKeeperKPIs(storeCode)` — returns counts for cards
  - Counts items with Qty > 0
  - Counts items with Qty < MinStock
  - Returns last 5 transactions (sorted by date desc)
  - Performance: single read of Stock_Movement, filter in code

**Estimated Effort:** 3–4 hours (UI + server data fetch)

**Testing Checklist:**
- Keeper logs in → sees Dashboard as first screen
- Item counts update correctly
- Low stock count is accurate
- Last 5 transactions shown in correct order
- Quick action buttons navigate correctly
- Admin should NOT see Keeper Dashboard (should see admin Dashboard)

---

## Priority 2: Efficiency Improvements

These features optimize existing workflows without adding new data.

### 4. Auto-Focus Quantity After Item Select

**Problem:** After picking an item from the autocomplete, user must click into the Qty field. Adds friction for repetitive data entry.

**Solution:** After `selectItem()` completes, auto-focus the Qty input in the same row.

**Files to Modify:**
- `view_entry.html` — after item selection, trigger `.focus()` on qty field

**Server Functions:**
- None

**Estimated Effort:** 30 minutes

**Testing Checklist:**
- Select item → Qty field automatically focused (cursor visible)
- Can start typing quantity immediately
- Works across all rows in form

---

### 5. Date Format DD/MM/YYYY Everywhere

**Problem:** Dates currently display as YYYY-MM-DD in tables. Arabic context expects DD/MM/YYYY.

**Solution:** Change `formatDate()` utility function in `scripts.html` from ISO to DD/MM/YYYY format.

**Impact:**
- All table displays (Stock, Ledger, History, Dashboard)
- Preserve ISO format for `<input type="date">` fields (browser handles these natively)
- Keep internal logic using Date objects (no string manipulation)

**Files to Modify:**
- `scripts.html` — update `formatDate()` function
  ```javascript
  // BEFORE: return date.toISOString().split('T')[0]  → 2026-05-15
  // AFTER: return `${day}/${month}/${year}` → 15/05/2026
  ```

**Server Functions:**
- None (format utility only)

**Estimated Effort:** 1 hour

**Testing Checklist:**
- All tables show DD/MM/YYYY format
- Date inputs still work natively (browser defaults)
- Excel export uses correct format
- Search/filter by date still works

---

### 6. Ledger Column Sort (Client-Side)

**Problem:** Ledger can show 1000+ rows with no sorting capability. Admin must manually scroll or export to sort.

**Solution:** Add client-side column headers as clickable sorts (Date, TxnID, Type, Store, Item, Qty).

**Files to Modify:**
- `view_ledger.html` — make column headers clickable
- `scripts.html` — add sort function that reorders table rows in DOM

**Sort Logic:**
- Single click: ascending
- Second click: descending
- Third click: reset to server order (newest first by default)
- Sorting is in-memory (no server round-trip)

**Server Functions:**
- None

**Estimated Effort:** 1.5 hours (click handler + sort logic)

**Testing Checklist:**
- Click Date header → sorts oldest to newest
- Click again → newest to oldest
- Click TxnID → sorts alphanumeric
- All column sorts work
- No server call made (instant)

---

### 7. Error Toast Persistence

**Problem:** Error messages disappear too fast (3.5s timeout). Users miss critical feedback like "Insufficient balance."

**Solution:** Increase timeout for error-type toasts to 8 seconds; keep success at 3.5 seconds.

**Files to Modify:**
- `scripts.html` — modify `showToast(message, type)` function
  ```javascript
  const timeout = type === 'error' ? 8000 : 3500;
  ```

**Server Functions:**
- None

**Estimated Effort:** 15 minutes

**Testing Checklist:**
- Error toast stays visible for 8 seconds
- Success toast stays visible for 3.5 seconds
- Both fade smoothly
- Multiple toasts queue correctly

---

## Priority 3: Business Value

These features reduce manual work and provide insights.

### 8. Low Stock Email Alerts (Daily, 8 AM Dubai)

**Problem:** Admins manually check Stock view to spot shortages. Critical items can go unnoticed until they're completely out.

**Solution:** Time-triggered function that emails Admin daily at 8 AM Dubai time if any items are below minimum stock.

**Trigger Setup:**
- Apps Script trigger: **Time-driven** → Daily → 8 AM to 9 AM (time zone: Asia/Dubai)
- Function: `triggerDailyLowStockAlert()`

**Files to Create/Modify:**
- New file: `Triggers.gs` — contains `triggerDailyLowStockAlert()` function
- Modify: `Config.gs` — add `ADMIN_EMAIL` constant

**Email Content:**
```
Subject: Aldhafra IMS — Low Stock Alert (17 May 2026)

Low Stock Items:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Item Code | Item Name        | Current | Min | Location
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ABC-002   | Cartridge Canon  | 3       | 5   | Madinat Zayed
PPR-A4    | Paper A4         | 0       | 10  | All stores (0 in 2 stores)

Total items below minimum: 8
Log in: [Web App URL]
```

**Server Functions:**
- New: `triggerDailyLowStockAlert()` — main trigger
  - Query Stock_Movement, calculate all balances
  - Find items where current < minStock
  - Group by location
  - Send email to Admin
  - Log in Audit_Log: "LOW_STOCK_ALERT_SENT"

**Estimated Effort:** 3–4 hours (trigger + email formatting + testing)

**Testing Checklist:**
- Trigger runs at scheduled time (test in Apps Script → Executions)
- Email arrives with correct content
- Email only sent if items are below minimum (no email if all OK)
- Email format is readable on mobile/desktop
- Audit log records the alert send

---

### 9. Monthly Stock Report (Admin Export)

**Problem:** Admins manually export and summarize stock data by store. No built-in report for a specific date range.

**Solution:** Admin can generate a PDF/Sheet report showing balances, movements, and changes for a store over a month.

**User Flow:**
1. Admin → Reports → "Generate Monthly Report"
2. Select: Store, Month, Year
3. Button: "Download PDF" or "Open in Sheets"

**Report Contents:**
- **Header:** Store name, month range
- **Opening Balance:** Items and quantities as of first day of month
- **Movements:** Summary (Receipts, Issuances, Adjustments, Transfers)
- **Closing Balance:** Items and quantities as of last day of month
- **Variance:** Opening → Closing (with Adjustment entries listed separately)

**Files to Create/Modify:**
- Modify: `view_reports.html` or create new section in admin area
- Modify: `ReportService.gs` — add `getMonthlyReport(storeCode, year, month)`

**Server Functions:**
- New: `ReportService.getMonthlyReport(storeCode, year, month)` — returns structured data
  - Calculate balances at start of month
  - Sum movements by type for the month
  - Calculate balances at end of month
  - Return as JSON or sheet data
- Optional: `ReportService.generateMonthlyReportPDF(data)` — uses Google Docs API or exports to Sheet

**Estimated Effort:** 5–6 hours (data aggregation + PDF/Sheet export)

**Testing Checklist:**
- Select store and month → report generates
- Opening balance is correct
- Movement totals match ledger
- Closing balance is accurate
- PDF is readable and formatted well
- Report can be downloaded/printed

---

### 10. Transfer Request Workflow (Multi-step Approval)

**Problem:** Transfers are instant. If a keeper sends items without approval, it's hard to audit. No way for admin to reject a requested transfer.

**Solution:** Keepers submit Transfer **Requests** instead of direct Transfers. Admin approves or rejects. Approved requests are recorded as Transfers in Stock_Movement.

**User Flow:**
- **Keeper:** "New Transaction" → Type = "Transfer Request" → submit
  - Cannot complete: awaits Admin approval
  - UI shows: "Pending approval from Admin"
- **Admin:** Dashboard → "Pending Requests" widget
  - Shows queued requests
  - Can click → preview → approve / reject with reason
  - Approved: creates Transfer entry in Stock_Movement, marked as approved by Admin email
  - Rejected: cancels request, logs reason in Audit_Log

**New Sheet:**
- `Transfer_Requests` — columns: RequestID, SourceStore, DestStore, ItemCode, Qty, KeeperEmail, RequestDate, Status (Pending/Approved/Rejected), ApprovedBy, RejectReason, ApprovedDate

**Files to Create/Modify:**
- New file: `view_transfer_requests.html` — for Admin to view and approve
- Modify: `view_entry.html` — add new transaction type "Transfer Request"
- Modify: `TransactionService.gs` — add `submitTransferRequest()` logic
- Modify: `AdminService.gs` — add `approveTransferRequest()`, `rejectTransferRequest()`
- Modify: `dashboard.html` — add "Pending Requests" widget for admins

**Server Functions:**
- New: `TransactionService.submitTransferRequest(payload)` — similar to submitTransaction but writes to Transfer_Requests sheet with Status=Pending
- New: `AdminService.approveTransferRequest(requestId)` — writes Transfer to Stock_Movement, updates status to Approved
- New: `AdminService.rejectTransferRequest(requestId, reason)` — updates status to Rejected, logs reason

**Estimated Effort:** 8–10 hours (new sheet, UI, approval logic, audit integration)

**Testing Checklist:**
- Keeper submits transfer request → shows pending state
- Admin sees request in dashboard
- Admin approves → creates Transfer entry in Stock_Movement
- Admin rejects → request marked as Rejected, reason logged
- Audit log shows all actions
- Keeper cannot complete transfer request without admin approval

---

## Priority 4: Future Enhancements

These are planned but not in the immediate roadmap.

### 11. Barcode Scanner Integration

**Problem:** Manually typing item codes is slow in high-volume entry.

**Solution:** When a barcode scanner fires (simulating keyboard input + Enter), auto-submit the item code field and move to quantity.

**Implementation:**
- Detect rapid Enter key after item code input
- Most barcode scanners append a trailing Enter
- Can be toggled on/off per entry form

**Effort Estimate:** 2–3 hours  
**Dependency:** Requires barcode scanner hardware in keeper's environment

---

### 12. Stock Reconciliation

**Problem:** Periodic physical counts need to be reconciled with system balances.

**Solution:** Import a count sheet, compare with system balances, auto-generate adjustment lines.

**User Flow:**
1. Admin → Reports → "Stock Reconciliation"
2. Upload CSV: ItemCode, Qty, Location, Date
3. System compares with balances as of that date
4. Shows: Expected, Counted, Variance
5. Generate Adjustment entries to correct variances

**Effort Estimate:** 6–8 hours

---

## Implementation Schedule (Suggested)

| Phase | Features | Estimated Duration | Status |
|-------|----------|-------------------|--------|
| **v2.1a** | Items 1–3 (operations) | 1–1.5 weeks | Backlog |
| **v2.1b** | Items 4–7 (efficiency) | 3–4 days | Backlog |
| **v2.1c** | Items 8–10 (business value) | 2–3 weeks | Backlog |
| **v2.2** | Items 11–12 (future) | TBD | Future |

---

## Getting Started on a Feature

1. **Pick a feature** from Priority 1 or 2 (quick wins first)
2. **Read the spec** above (Problem, Solution, Files, Functions)
3. **Check dependencies:**
   - Feature 1 (drill-down) doesn't depend on others
   - Feature 3 (dashboard) is standalone
   - Feature 4–7 are all independent tweaks
4. **Start coding:**
   - Create/modify files as listed
   - Add server functions in appropriate service file
   - Test thoroughly against the checklist
5. **Deploy:** `clasp push` to update the live script

---

## Notes

- All features preserve backward compatibility with v2.0 data
- No schema changes required for Features 1–7
- Features 8–10 add new sheets but don't alter existing ones
- Every feature should log relevant actions to Audit_Log
- Test on both desktop and mobile (responsive) where applicable
