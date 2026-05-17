# MEP-Store — Aldhafra IMS v2.0

Inventory Management System for Aldhafra MEP stores.
Built with Google Apps Script + Google Sheets, migrated from the legacy Excel/VBA system.

[![Status](https://img.shields.io/badge/status-Live%20v2.0-success)]()
[![Platform](https://img.shields.io/badge/platform-Google%20Apps%20Script-blue)]()
[![Deployment](https://img.shields.io/badge/deployed-May%202026-blue)]()

**Live URL (v2.0):** `https://script.google.com/macros/s/AKfycbw3k7biBWAHQlLIkoFyvN008WDgzDCl6LIUz96M0zJqvaKXwGCK6DMtyDKZb2aW79kd/exec`

---

## What is this?

A web-based inventory management system that lets store keepers record transactions (Receipt, Issuance, Adjustment, Transfer) through a single Google Apps Script Web App, while administrators get full visibility and control over all stores.

**The system replaces a legacy Excel `.xlsm` file with VBA macros**, fixing concurrency issues, adding proper role-based access, and providing a clean web interface.

---

## Repository structure

```
.
├── docs/
│   ├── 01-VBA-AldhafraIMS-Module-Analysis.md    ← Legacy Excel/VBA analysis
│   ├── 02-Workbook-XLSM-Technical-Analysis.md
│   ├── 03-Excel-Performance-And-Weight.md
│   ├── 04-Google-Online-Architecture-And-Plan.md
│   ├── 05-Glossary-Use-Cases.md
│   └── implementation/                          ← New system docs (12 files)
│       ├── 00-PROJECT-CHARTER.md
│       ├── 01-PRD.md
│       ├── 02-SYSTEM-ARCHITECTURE.md
│       ├── 03-DATA-MODEL.md
│       ├── 04-BUSINESS-LOGIC.md
│       ├── 05-FUNCTION-SPECS.md
│       ├── 06-UI-SCREENS.md
│       ├── 07-AUTH-ROLES.md
│       ├── 08-TESTING-PLAN.md
│       ├── 09-DEPLOYMENT-GUIDE.md
│       ├── 10-MIGRATION-GUIDE.md
│       └── 11-IMPLEMENTATION-PHASES.md
│
└── src/                                         ← Google Apps Script source
    ├── appsscript.json                          ← Manifest
    ├── Config.gs                                ← Constants
    ├── setup.gs                                 ← One-time sheet setup
    ├── Code.gs                                  ← doGet + router
    ├── AuthService.gs                           ← Authentication
    ├── LockService.gs                           ← Concurrency protection
    ├── AuditService.gs                          ← Audit log
    ├── DataService.gs                           ← Data reads
    ├── TransactionService.gs                    ← Transaction logic
    ├── AdminService.gs                          ← Admin CRUD
    ├── ReportService.gs                         ← Dashboard + exports
    ├── Index.html                               ← Shell + navigation
    ├── styles.html + scripts.html               ← Shared assets
    ├── ErrorUnauthorized.html
    └── view_*.html                              ← 8 view files
```

---

## Quick start

### 1. Create the Google Sheet
- Go to [sheets.google.com](https://sheets.google.com) → create a new file
- Name it `Aldhafra IMS — Backend Data`

### 2. Open Apps Script
- In the sheet: `Extensions → Apps Script`
- This binds the script to the sheet automatically

### 3. Copy the source files
- Create each `.gs` and `.html` file from the `src/` folder into the Apps Script editor
- Or use `clasp`:
  ```bash
  npm install -g @google/clasp
  clasp login
  clasp clone <SCRIPT_ID> --rootDir ./src
  clasp push
  ```

### 4. Run setup once
- In the Apps Script editor, select the function `setupSpreadsheet`
- Click `Run` → accept OAuth permissions
- Verify in the Logs that all sheets were created

### 5. Deploy as Web App
- `Deploy → New deployment`
- Type: **Web app**
- Execute as: **Me (owner)**
- Who has access: **Anyone with a Google account**
- Save the deployment URL

### 6. Test
- Open the URL with the admin account (the one that ran setup) → Dashboard appears
- Open with an unregistered Gmail → "Access Denied" page

Full deployment instructions are in [docs/implementation/09-DEPLOYMENT-GUIDE.md](docs/implementation/09-DEPLOYMENT-GUIDE.md).

---

## v2.1 Roadmap

v2.0 is **live and operational**. The team is planning **v2.1 improvements**:

- **Priority 1:** Item drill-down (view history per item), print/PDF, keeper dashboard
- **Priority 2:** Auto-focus qty, date format (DD/MM/YYYY), ledger sorting, error toast persistence
- **Priority 3:** Low-stock email alerts, monthly reports, transfer request approval workflow

[See the full v2.1 roadmap →](docs/implementation/12-ROADMAP-V2.1.md)

---

## Features

### For Store Keepers
- **Record transactions** — Receipt, Issuance, Adjustment, Transfer
- **View own stock** — only their assigned store
- **Search history** — filter by date, type, item
- **Real-time balance** shown next to quantity during entry
- **Autocomplete** for item codes and names

### For Administrators
- **Dashboard** — today's activity, low-stock alerts, recent transactions
- **Full ledger** — all transactions with filters and Excel export
- **Stock matrix** — items × locations balance overview
- **User management** — add, edit, disable keepers
- **Item & location management** — full CRUD
- **Audit log** — every action tracked with user and timestamp

### Fixed from the legacy Excel system
- Per-store balance isolation (legacy aggregated across all stores)
- Concurrency protection via `LockService`
- Safe TxnID generation (no race conditions)
- Batch reads instead of O(n²) lookups
- Full audit trail with user email and timestamps

---

## Documentation

| Doc | What's in it |
|-----|--------------|
| [00-PROJECT-CHARTER](docs/implementation/00-PROJECT-CHARTER.md) | Goals, scope, stakeholders, phases |
| [01-PRD](docs/implementation/01-PRD.md) | 20 user stories + all functional requirements |
| [02-SYSTEM-ARCHITECTURE](docs/implementation/02-SYSTEM-ARCHITECTURE.md) | Components, request lifecycle, concurrency |
| [03-DATA-MODEL](docs/implementation/03-DATA-MODEL.md) | Full schema for all 6 sheets |
| [04-BUSINESS-LOGIC](docs/implementation/04-BUSINESS-LOGIC.md) | Validation rules, balance calc, transfer pattern |
| [05-FUNCTION-SPECS](docs/implementation/05-FUNCTION-SPECS.md) | Every Apps Script function spec |
| [06-UI-SCREENS](docs/implementation/06-UI-SCREENS.md) | All screens with wireframes |
| [07-AUTH-ROLES](docs/implementation/07-AUTH-ROLES.md) | Auth flow + permissions matrix (updated for v2.0) |
| [08-TESTING-PLAN](docs/implementation/08-TESTING-PLAN.md) | 35+ test cases |
| [09-DEPLOYMENT-GUIDE](docs/implementation/09-DEPLOYMENT-GUIDE.md) | Step-by-step deployment (updated for v2.0) |
| [10-MIGRATION-GUIDE](docs/implementation/10-MIGRATION-GUIDE.md) | Excel → Google migration |
| [11-IMPLEMENTATION-PHASES](docs/implementation/11-IMPLEMENTATION-PHASES.md) | 6-phase rollout plan |
| [12-ROADMAP-V2.1](docs/implementation/12-ROADMAP-V2.1.md) | v2.1 improvements: drill-down, print, dashboard, efficiency gains |

---

## Tech stack

- **Backend:** Google Apps Script (V8 runtime)
- **Database:** Google Sheets
- **Frontend:** HTML + CSS + vanilla JavaScript (`google.script.run` bridge)
- **Auth:** Gmail OAuth via `Session.getActiveUser()`
- **Concurrency:** `LockService.getScriptLock()`

No external dependencies. No build step required.

---

## License

Internal use — Aldhafra MEP.
