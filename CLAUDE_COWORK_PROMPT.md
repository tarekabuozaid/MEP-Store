# Claude Cowork — Deployment Prompt
## MEP-Store / Aldhafra IMS v2.0 — Google Apps Script

Copy the block below and paste it into Claude Cowork (or any Claude session with browser/file access) to deploy this project end-to-end.

---

## 🎯 The Prompt (paste this into Claude Cowork)

````markdown
You are deploying an inventory management web app for me. The full source code
and documentation are in the GitHub repository:

  https://github.com/tarekabuozaid/MEP-Store

Your job: walk me through getting this running as a live Google Apps Script
Web App, step by step. Ask me for inputs only when you truly need them.
Pause between major steps and wait for me to confirm "done" before proceeding.

═══════════════════════════════════════════════════════════════════════
CONTEXT — what you are deploying
═══════════════════════════════════════════════════════════════════════

This is a Google Apps Script Web App that replaces an Excel/VBA inventory
system. Architecture:

  ┌──────────────────────────┐
  │  Web App (HTML+JS)       │  ← what users open in a browser
  └────────────┬─────────────┘
               │ google.script.run
  ┌────────────▼─────────────┐
  │  Apps Script (.gs)       │  ← server logic, auth, validation
  └────────────┬─────────────┘
               │ SpreadsheetApp
  ┌────────────▼─────────────┐
  │  Google Sheets           │  ← database (6 tables)
  └──────────────────────────┘

Source layout in the repo:
  src/
    appsscript.json         — manifest
    Config.gs               — constants and getSheet_()
    setup.gs                — ONE-TIME setup, creates all sheets
    Code.gs                 — doGet, router, include()
    AuthService.gs          — Gmail OAuth + Users_Stores lookup
    LockService.gs          — concurrency protection
    AuditService.gs         — audit log writer
    DataService.gs          — reads + balance calculation
    TransactionService.gs   — submitTransaction (main logic)
    AdminService.gs         — CRUD for users/items/locations
    ReportService.gs        — dashboard + export
    Index.html              — shell + navigation
    styles.html             — shared CSS
    scripts.html            — shared client JS + API bridge
    ErrorUnauthorized.html  — access denied page
    view_*.html (8 files)   — one per screen

Sheets that setup.gs creates:
  Stock_Movement, Master_Items, Locations, Users_Stores, Counters, Audit_Log

═══════════════════════════════════════════════════════════════════════
PHASE 1 — Create the Google Sheet (3 minutes)
═══════════════════════════════════════════════════════════════════════

1. Open https://sheets.google.com and create a new blank spreadsheet.
2. Rename it to:  Aldhafra IMS — Backend Data
3. From the menu choose:  Extensions → Apps Script
   This opens the Apps Script editor bound to this sheet.
4. In the Apps Script editor, rename the project to:  Aldhafra IMS

Confirm "done" before I continue.

═══════════════════════════════════════════════════════════════════════
PHASE 2 — Get the source code from GitHub
═══════════════════════════════════════════════════════════════════════

You have two options. Pick one and tell me which.

Option A — clasp CLI (faster, recommended if you have Node.js):
  npm install -g @google/clasp
  clasp login
  git clone https://github.com/tarekabuozaid/MEP-Store.git
  cd MEP-Store/src
  # Get the Script ID from Apps Script editor: Project Settings → IDs
  clasp clone <SCRIPT_ID> --rootDir .
  clasp push --force

Option B — manual copy/paste (no CLI required):
  Open every file in src/ on GitHub, copy its content, then create the
  matching file in the Apps Script editor:
    .gs files  → File → New → Script file (no extension in name)
    .html files → File → New → HTML file (no extension in name)
    appsscript.json → View → Show "appsscript.json" manifest file, replace it
  IMPORTANT for view_*.html: keep the exact lowercase filename including
  the "view_" prefix, because Index.html includes them by name.

After pushing/pasting, the Apps Script project must contain ALL of these
file names (no extensions inside the editor):

  .gs:    Config, setup, Code, AuthService, LockService, AuditService,
          DataService, TransactionService, AdminService, ReportService
  HTML:   Index, styles, scripts, ErrorUnauthorized,
          view_entry, view_stock, view_history, view_dashboard,
          view_ledger, view_allstock, view_admin, view_audit
  Manifest: appsscript.json (set automatically by clasp; manual users
            must enable "Show appsscript.json" first in Project Settings)

Verify the list, then say "done".

═══════════════════════════════════════════════════════════════════════
PHASE 3 — Run setup ONCE to create the sheets
═══════════════════════════════════════════════════════════════════════

1. In the Apps Script editor, open setup.gs.
2. In the function dropdown at the top of the editor, select:
     setupSpreadsheet
3. Click "Run".
4. Google will ask for OAuth permissions:
     - "Aldhafra IMS wants to access your Google Account"
     - Click "Advanced" → "Go to Aldhafra IMS (unsafe)" → "Allow"
     This is expected because the script is unverified — that's fine for
     internal use.
5. Wait for the run to finish. Then:
     View → Logs    (or Ctrl+Enter)
   You should see lines like:
     "Created sheet: Stock_Movement"
     "Created sheet: Master_Items"
     ... etc
     "Added admin user: <your_email>"
     "Added sample locations: MZ, L"
     "✅ Setup complete!"

Switch back to the Google Sheet tab. You should now see 6 tabs at the
bottom: Stock_Movement, Master_Items, Locations, Users_Stores, Counters,
Audit_Log.

If anything failed, paste the error here and I'll debug it.

═══════════════════════════════════════════════════════════════════════
PHASE 4 — Deploy as a Web App
═══════════════════════════════════════════════════════════════════════

1. In the Apps Script editor, click:  Deploy → New deployment
2. Click the gear icon next to "Select type" and choose:  Web app
3. Fill in:
     Description:    v1.0 — initial production
     Execute as:     Me (your email)
     Who has access: Anyone with a Google account
4. Click "Deploy".
5. Google will ask for permissions again — Allow.
6. Copy the Web App URL (ends with /exec). Save it somewhere safe — this
   is the URL users will open.

Paste the URL back to me so I can verify it loads.

═══════════════════════════════════════════════════════════════════════
PHASE 5 — Smoke test
═══════════════════════════════════════════════════════════════════════

Test 1 — Admin access:
  Open the /exec URL in your normal browser tab (the one logged into the
  Gmail account that ran setup). You should see the Dashboard.

Test 2 — Unauthorized access:
  Open the same URL in an Incognito window with a different Gmail account
  that is NOT in Users_Stores. You should see the "Access Denied" page.

Test 3 — Create a master item:
  As admin → Admin → Items tab → + Add Item:
    Code: TEST-001
    Name: Test Item
    Unit: pcs
    Min Stock: 5
  Click Save.

Test 4 — Record a Receipt:
  Click "New Transaction" → Receipt → today's date → MZ location.
  Add a row: type TEST in the code field, select TEST-001 from the
  autocomplete, set Quantity to 100. Click "Save Transaction".
  You should see a success toast with TxnID like REC-2026-0001.

Test 5 — Verify the balance:
  Open the Google Sheet → Stock_Movement → confirm one row was inserted
  with Qty=100. Then back in the Web App → Stock view → confirm
  TEST-001 shows balance 100 at MZ.

Test 6 — Block an overdraw:
  In the Web App → New Transaction → Issuance → MZ → TEST-001, Qty=200.
  Click Save. You should see a red error:
    "Balance of Test Item at MZ = 100 pcs, requested: 200"

If all six tests pass, the deployment is healthy.

═══════════════════════════════════════════════════════════════════════
PHASE 6 — Add real users
═══════════════════════════════════════════════════════════════════════

For each store keeper:
  Admin → Users → + Add User
    Email: <their_gmail>
    Full Name: <their name>
    Role: Keeper
    Store: <the store they belong to>
  Save.

Then send them the Web App /exec URL. They will be auto-authenticated by
Google when they open it.

To add admins later, use Role: Admin and Store: * (asterisk).

═══════════════════════════════════════════════════════════════════════
PHASE 7 — What to do later
═══════════════════════════════════════════════════════════════════════

When you change any source file:
  - If using clasp:  cd src/ && clasp push
  - If manual:       edit the file in the Apps Script editor directly
  Then redeploy:
    Deploy → Manage deployments → ⚙ → Version: New version → Deploy

For data migration from the old Excel system, read:
  https://github.com/tarekabuozaid/MEP-Store/blob/main/docs/implementation/10-MIGRATION-GUIDE.md

For deeper troubleshooting, the full deployment guide is at:
  https://github.com/tarekabuozaid/MEP-Store/blob/main/docs/implementation/09-DEPLOYMENT-GUIDE.md

═══════════════════════════════════════════════════════════════════════
RULES OF ENGAGEMENT
═══════════════════════════════════════════════════════════════════════

- Do not invent or guess values. If a setting isn't specified, ask me.
- Do not modify source code on GitHub during deployment unless I tell you
  there is a real bug. Stick to the deployment flow above.
- After every phase, summarize what was done in ≤2 lines and wait for my
  "ok" / "done" / "next".
- If the Apps Script editor or Google Sheets returns an error, copy the
  exact error text back to me, do not paraphrase.

Start with Phase 1.
````

---

## How to use this prompt

1. **Copy** everything inside the triple-backtick block above (the prompt).
2. **Open** Claude Cowork (or any Claude conversation with file/web access).
3. **Paste** the prompt as your first message.
4. **Follow** Claude's lead phase by phase. Confirm "done" or paste errors as they come up.

---

## What this prompt assumes

| Assumption | Why |
|------------|-----|
| The user has a Gmail account | Required for Apps Script + Web App deployment |
| The user can open `sheets.google.com` and `script.google.com` | Standard Google Workspace access |
| The user can grant OAuth to their own script | Required for `Session.getActiveUser()` to work |
| The repo is public at the stated URL | Confirmed — `https://github.com/tarekabuozaid/MEP-Store` |
| Node.js is optional, not required | Manual copy/paste fallback is included |

---

## Notes for the operator (you)

- The prompt is **self-contained** — Claude Cowork doesn't need to read the docs first; the prompt embeds the essentials.
- If you want a shorter version, drop **Phase 5 (smoke tests)** and **Phase 7 (later)**. Phases 1–4 are the minimum to get a working URL.
- If you want Claude to deploy fully autonomously (no "wait for done"), remove the **"Rules of Engagement"** section.
