#!/usr/bin/env python3
"""
Build paste-ready .xlsx slices from legacy Aldhafra .xlsm for Google Backend layout
(docs/implementation/03-DATA-MODEL.md).

Does not execute VBA. Writes one workbook per logical sheet with headers in row 1.

Example:
  python tools/export_backend_paste_ready.py \\
    --legacy "Aldhafra-Pkg1-Madinat zayed Store Inventory-Store Keeper Dec 25.xlsm"
"""

from __future__ import annotations

import argparse
import re
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd

# -----------------------------------------------------------------------------
# Legacy header rows (pandas 0-based): title row above real headers on row 2 of Excel.
LEGACY_HEADERS = {"Stock_Movement": 1, "Master_Items": 1, "Locations": 1}

TXN_PATTERN = re.compile(r"^[A-Za-z]{1,12}-\d{4}-\d{3,}(?:-[A-Za-z]{2,6})?$")
GOOGLE_EMAIL_PLACEHOLDER = "migrated-from-excel@aldhafra.local"


def _norm_cols(df: pd.DataFrame) -> dict[str, str]:
    out: dict[str, str] = {}
    for c in df.columns:
        key = str(c).strip().lower().replace(" ", "_").replace("/", "_")
        out[key] = str(c).strip()
    return out


def _compact_name(s: str) -> str:
    return "".join(ch for ch in s.lower() if ch.isalnum())


def _find_column(norm_map: dict[str, str], *candidates: str) -> str | None:
    by_compact: dict[str, str] = {}
    for nk, actual in norm_map.items():
        by_compact.setdefault(_compact_name(nk), actual)
    for cand in candidates:
        cc = _compact_name(cand)
        if cc in by_compact:
            return by_compact[cc]
        for nk, actual in norm_map.items():
            nkc = _compact_name(nk)
            if cc and (cc == nkc or cc in nkc or nkc in cc):
                return actual
    return None


def _as_clean_str(val: object) -> str:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return ""
    if isinstance(val, str):
        s = val.strip()
        return "" if s.lower() == "nan" else s
    if isinstance(val, (int, float)):
        if isinstance(val, float) and val == int(val):
            return str(int(val))
        return str(val)
    return str(val).strip()


def _normalize_txn_type(raw: object) -> str:
    s = _as_clean_str(raw)
    if not s:
        return ""
    lower = s.lower()
    mapping = {
        "receipt": "Receipt",
        "issuance": "Issuance",
        "adjustment": "Adjustment",
        "transfer": "Transfer",
        "issue": "Issuance",
        "issues": "Issuance",
        "rcv": "Receipt",
    }
    if lower in mapping:
        return mapping[lower]
    if s in ("Receipt", "Issuance", "Adjustment", "Transfer"):
        return s
    parts = s.split()
    if parts and mapping.get(parts[0].lower()):
        return mapping[parts[0].lower()]
    return s.strip()


def _looks_like_transaction_id(txn: str) -> bool:
    txn = txn.strip()
    if not txn or len(txn) > 120:
        return False
    if "normalized on upgrade" in txn.lower():
        return False
    return bool(TXN_PATTERN.match(txn))


def load_stock_movement(legacy_path: Path, tz: ZoneInfo, email: str) -> pd.DataFrame:
    hdr = LEGACY_HEADERS["Stock_Movement"]
    df = pd.read_excel(legacy_path, sheet_name="Stock_Movement", header=hdr, dtype=object)
    df.columns = [str(c).strip() if pd.notna(c) else f"Unnamed_{i}" for i, c in enumerate(df.columns)]
    norm = _norm_cols(df)
    c_txn = _find_column(norm, "txn_id", "txnid") or "Txn ID"
    c_date = _find_column(norm, "date") or "Date"
    c_type = _find_column(norm, "txn_type", "txn type") or "Txn Type"
    c_item = _find_column(norm, "item_code", "itemcode") or "Item Code"
    c_name = _find_column(norm, "item_name", "itemname") or "Item Name"
    c_unit = _find_column(norm, "unit") or "Unit"
    c_qty = _find_column(norm, "qty") or "Qty"
    c_loc = _find_column(norm, "location") or "Location"
    c_lpo = _find_column(norm, "lpo", "wo_ref", "lpo___wo_ref", "lpo / wo ref")
    c_sup = _find_column(norm, "supplier", "dept", "supplier___dept", "supplier / dept")
    c_req = _find_column(norm, "requested_by", "requested by", "requester")
    c_rec = _find_column(norm, "received_by", "received by", "receiver")
    c_notes = _find_column(norm, "remarks", "notes")

    mig_ts = datetime.now(tz).replace(microsecond=0)
    # Excel rejects tz-aware datetimes — keep Dubai wall-clock as naive local.
    ts_col = mig_ts.replace(tzinfo=None)

    def gv(row: pd.Series, col: str | None) -> str:
        if col is None:
            return ""
        return _as_clean_str(row.get(col, ""))

    rows: list[dict[str, object]] = []
    for _, r in df.iterrows():
        tid = _as_clean_str(r.get(c_txn, ""))
        if not _looks_like_transaction_id(tid):
            continue
        ttyp = _normalize_txn_type(r.get(c_type, ""))
        if ttyp not in ("Receipt", "Issuance", "Adjustment", "Transfer"):
            continue
        qty_raw = r.get(c_qty)
        try:
            q = float(qty_raw)
        except (TypeError, ValueError):
            continue
        if pd.isna(qty_raw):
            continue
        d_raw = r.get(c_date)
        if pd.isna(d_raw):
            continue
        if hasattr(d_raw, "to_pydatetime"):
            dt_val = pd.Timestamp(d_raw).to_pydatetime()
            date_cell = dt_val.date()
        else:
            try:
                date_cell = pd.Timestamp(d_raw).date()
            except Exception:
                continue

        rows.append(
            {
                "TxnID": tid,
                "Date": date_cell,
                "TxnType": ttyp,
                "ItemCode": _as_clean_str(r.get(c_item, "")),
                "ItemName": _as_clean_str(r.get(c_name, "")),
                "Unit": _as_clean_str(r.get(c_unit, "")),
                "Qty": abs(q),
                "Location": _as_clean_str(r.get(c_loc, "")),
                "LPO": gv(r, c_lpo),
                "Supplier": gv(r, c_sup),
                "Requester": gv(r, c_req),
                "Receiver": gv(r, c_rec),
                "Notes": gv(r, c_notes),
                "UserEmail": email,
                "Timestamp": ts_col,
            }
        )

    out = pd.DataFrame(rows, columns=[
        "TxnID", "Date", "TxnType", "ItemCode", "ItemName", "Unit", "Qty", "Location",
        "LPO", "Supplier", "Requester", "Receiver", "Notes", "UserEmail", "Timestamp",
    ])
    return out


def load_master_items(legacy_path: Path) -> pd.DataFrame:
    hdr = LEGACY_HEADERS["Master_Items"]
    df = pd.read_excel(legacy_path, sheet_name="Master_Items", header=hdr, dtype=object)
    df.columns = [str(c).strip() if pd.notna(c) else f"Unnamed_{i}" for i, c in enumerate(df.columns)]
    norm = _norm_cols(df)
    c_code = _find_column(norm, "item_code", "itemcode") or df.columns[0]
    c_name = _find_column(norm, "item_name", "itemname")
    c_unit = _find_column(norm, "unit")
    c_cat = _find_column(norm, "category")
    c_min = _find_column(norm, "minimum_stock", "min_stock", "minimum")

    rows: list[dict[str, object]] = []
    for _, r in df.iterrows():
        code = _as_clean_str(r.get(c_code, ""))
        if not code:
            continue
        min_val = r.get(c_min) if c_min else None
        try:
            min_stock = float(min_val) if min_val not in (None, "") and not pd.isna(min_val) else 0.0
        except (TypeError, ValueError):
            min_stock = 0.0
        rows.append(
            {
                "ItemCode": code,
                "ItemName": _as_clean_str(r.get(c_name, "")) if c_name else "",
                "Unit": _as_clean_str(r.get(c_unit, "")) if c_unit else "",
                "MinStock": min_stock,
                "Category": _as_clean_str(r.get(c_cat, "")) if c_cat else "",
                "IsActive": True,
            }
        )
    out = pd.DataFrame(rows, columns=["ItemCode", "ItemName", "Unit", "MinStock", "Category", "IsActive"])
    out = out.drop_duplicates(subset=["ItemCode"], keep="first").reset_index(drop=True)
    return out


def load_locations(legacy_path: Path) -> pd.DataFrame:
    hdr = LEGACY_HEADERS["Locations"]
    df = pd.read_excel(legacy_path, sheet_name="Locations", header=hdr, dtype=object)
    df.columns = [str(c).strip() if pd.notna(c) else f"Unnamed_{i}" for i, c in enumerate(df.columns)]
    norm = _norm_cols(df)
    c_code = _find_column(norm, "location_code", "storecode", "code") or df.columns[0]
    c_name = _find_column(norm, "location_name", "storename", "name")

    rows: list[dict[str, object]] = []
    for _, r in df.iterrows():
        code = _as_clean_str(r.get(c_code, ""))
        if not code:
            continue
        rows.append(
            {
                "StoreCode": code,
                "StoreName": _as_clean_str(r.get(c_name, "")) if c_name else code,
                "IsActive": True,
            }
        )
    out = pd.DataFrame(rows, columns=["StoreCode", "StoreName", "IsActive"])
    out = out.drop_duplicates(subset=["StoreCode"], keep="first").reset_index(drop=True)
    return out


def main() -> int:
    p = argparse.ArgumentParser(description="Export paste-ready Backend xlsx from legacy .xlsm")
    p.add_argument("--legacy", "-l", type=Path, required=True, help="Path to legacy .xlsm")
    p.add_argument(
        "--out-dir",
        type=Path,
        default=Path("tools/output_backend_paste"),
        help="Output directory (created if missing)",
    )
    p.add_argument(
        "--timezone",
        default="Asia/Dubai",
        help="IANA timezone for Timestamp column (Stock_Movement)",
    )
    p.add_argument(
        "--email",
        default=GOOGLE_EMAIL_PLACEHOLDER,
        help="UserEmail value for imported movement rows",
    )
    args = p.parse_args()

    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass

    legacy = args.legacy.expanduser().resolve()
    if not legacy.is_file():
        print(f"Legacy not found: {legacy}", file=sys.stderr)
        return 1

    out_dir = args.out_dir.expanduser().resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    try:
        tz = ZoneInfo(args.timezone)
    except Exception:
        print(f"Invalid timezone: {args.timezone}", file=sys.stderr)
        return 1

    print(f"Reading: {legacy}")
    stock = load_stock_movement(legacy, tz, args.email)
    master = load_master_items(legacy)
    locs = load_locations(legacy)

    paths = {
        "Stock_Movement": out_dir / "01_Stock_Movement_paste_ready.xlsx",
        "Master_Items": out_dir / "02_Master_Items_paste_ready.xlsx",
        "Locations": out_dir / "03_Locations_paste_ready.xlsx",
    }

    with pd.ExcelWriter(paths["Stock_Movement"], engine="openpyxl") as w:
        stock.to_excel(w, sheet_name="Stock_Movement", index=False)
    with pd.ExcelWriter(paths["Master_Items"], engine="openpyxl") as w:
        master.to_excel(w, sheet_name="Master_Items", index=False)
    with pd.ExcelWriter(paths["Locations"], engine="openpyxl") as w:
        locs.to_excel(w, sheet_name="Locations", index=False)

    print(f"Stock_Movement rows: {len(stock)} -> {paths['Stock_Movement']}")
    print(f"Master_Items rows:   {len(master)} -> {paths['Master_Items']}")
    print(f"Locations rows:      {len(locs)} -> {paths['Locations']}")
    print("\nPaste order in Google/Backend: 03 Locations, 02 Master_Items, then 01 Stock_Movement")
    print("(Or paste Locations + Master first, then Stock after Counters/Users match your policy.)")

    instr = out_dir / "PASTE_INSTRUCTIONS.txt"
    instr.write_text(
        "\n".join(
            [
                "Aldhafra IMS — paste-ready export from legacy .xlsm",
                "",
                "Files:",
                "  03_Locations_paste_ready.xlsx   -> sheet Locations   (paste from row A1, replace table body)",
                "  02_Master_Items_paste_ready.xlsx -> sheet Master_Items",
                "  01_Stock_Movement_paste_ready.xlsx -> sheet Stock_Movement (last; check Counters & TxnID policy)",
                "",
                "Stock_Movement:",
                f"  - UserEmail set to: {args.email}",
                f"  - Timestamp = export run time in {args.timezone} (same for all rows).",
                "  - Rows without a valid Txn ID pattern (PREFIX-YYYY-SEQ) or unknown TxnType were dropped.",
                "  - After paste: align Counters sheet with max sequence per PREFIX-YEAR on your backend.",
                "",
                "Review codes: Location StoreCode and ItemCode must match between Master and Movement.",
                "",
            ]
        ),
        encoding="utf-8",
    )
    print(f"Wrote: {instr}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
