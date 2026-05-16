#!/usr/bin/env python3
"""
Excel workbook analyzer for migrating Aldhafra IMS legacy .xlsm -> Backend spreadsheet.

Reads stored cell values only (pandas/openpyxl); does not execute VBA.
Schema reference: docs/implementation/03-DATA-MODEL.md

    pip install -r tools/requirements-analysis.txt
    python tools/excel_migration_analysis.py --legacy path/to/file.xlsm
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

import pandas as pd

# Typical sheets in legacy workbook (docs/02-Workbook-XLSM-Technical-Analysis.md)
DEFAULT_SNIFF_SHEETS = (
    "Stock_Movement",
    "Master_Items",
    "Locations",
    "Current_Stock",
    "Location_Stock",
    "Users_Stores",
    "Entry_Form",
)

# Target Google Stock_Movement column names (03-DATA-MODEL.md)
GOOGLE_MOVEMENT_COLUMNS = [
    "TxnID",
    "Date",
    "TxnType",
    "ItemCode",
    "ItemName",
    "Unit",
    "Qty",
    "Location",
    "LPO",
    "Supplier",
    "Requester",
    "Receiver",
    "Notes",
    "UserEmail",
    "Timestamp",
]

TXN_ALLOWED = frozenset({"Receipt", "Issuance", "Adjustment", "Transfer"})
TXN_LOWER_MAP = {"receipt": "Receipt", "issuance": "Issuance", "adjustment": "Adjustment", "transfer": "Transfer"}


def _norm_cols(df: pd.DataFrame) -> dict[str, str]:
    """Map normalized column names -> actual column names."""
    out: dict[str, str] = {}
    for c in df.columns:
        key = str(c).strip().lower().replace(" ", "_").replace("/", "_")
        out[key] = str(c).strip()
    return out


def _compact_name(s: str) -> str:
    return "".join(ch for ch in s.lower() if ch.isalnum())


def _find_column(norm_map: dict[str, str], *candidates: str) -> str | None:
    """Match candidate names to normalized header keys."""
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


def _read_sheet(
    path: Path,
    sheet: str,
    header_row: int | None,
    nrows: int | None = None,
) -> pd.DataFrame:
    kwargs: dict[str, Any] = {"dtype": object}
    if nrows is not None:
        kwargs["nrows"] = nrows
    if header_row is None:
        return pd.read_excel(path, sheet_name=sheet, header=None, **kwargs)
    return pd.read_excel(path, sheet_name=sheet, header=header_row, **kwargs)


def sniff_headers(path: Path, sheet: str, preview_rows: int = 8) -> None:
    df = _read_sheet(path, sheet, header_row=None, nrows=preview_rows)
    print(f"\n--- Preview rows: {sheet} ({path.name}) ---")
    for i in range(len(df)):
        row = df.iloc[i].tolist()
        print(f"  excel_row={i + 1} (pandas index {i}): {row[:12]!r}" + (" ..." if len(row) > 12 else ""))


def summarize_workbook(path: Path) -> dict[str, Any]:
    xl = pd.ExcelFile(path)
    info: dict[str, Any] = {"path": str(path.resolve()), "sheets": []}
    for name in xl.sheet_names:
        try:
            # Cap rows for a cheap non-empty estimate
            sh = pd.read_excel(path, sheet_name=name, header=None, nrows=2048)
            used_rows = len(sh.dropna(how="all"))
        except Exception as e:
            used_rows = f"error: {e}"
        info["sheets"].append({"name": name, "sample_non_empty_rows_2048_cap": used_rows})
    xl.close()
    return info


def analyze_stock_movement(path: Path, header_row: int) -> dict[str, Any]:
    df = pd.read_excel(path, sheet_name="Stock_Movement", header=header_row, dtype=object)
    df.columns = [str(c).strip() if pd.notna(c) else f"Unnamed_{i}" for i, c in enumerate(df.columns)]
    norm = _norm_cols(df)
    col_txn = _find_column(norm, "txnid", "txn_id", "txn id")
    col_type = _find_column(norm, "txntype", "txn_type", "txn type", "transactiontype")
    col_item = _find_column(norm, "itemcode", "item_code")
    col_loc = _find_column(norm, "location")
    report: dict[str, Any] = {
        "rows": int(len(df)),
        "detected_columns": {k: norm[k] for k in sorted(norm)},
        "txn_id_column": col_txn,
        "txntype_column": col_type,
        "itemcode_column": col_item,
        "location_column": col_loc,
    }
    missing_google = [g for g in GOOGLE_MOVEMENT_COLUMNS if _find_column(norm, g, g.lower()) is None]
    report["columns_not_obviously_matching_google_names"] = missing_google

    if col_txn:
        s = df[col_txn].astype(str).str.strip()
        non_empty = s[s.notna() & (s != "") & (s != "nan")]
        dup = non_empty[non_empty.duplicated(keep=False)]
        report["txn_id_duplicates_count"] = int(len(dup.unique()))
        report["txn_id_duplicate_samples"] = dup.value_counts().head(10).to_dict()
    if col_type:
        vc = df[col_type].astype(str).str.strip().value_counts(dropna=False).head(25)
        report["txntype_top_values"] = vc.to_dict()
        unknown = [
            x for x in vc.index.astype(str)
            if str(x).strip() and TXN_LOWER_MAP.get(str(x).strip().lower()) is None and str(x) not in TXN_ALLOWED
        ]
        report["txntype_values_needing_manual_mapping_sample"] = unknown[:30]
    if col_item and col_loc:
        sub = df.loc[:, [col_item, col_loc]].dropna(how="all").copy()
        for c in (col_item, col_loc):
            sub[c] = sub[c].astype(str).str.strip().replace({"nan": "", "NaT": ""})
        key = sub[col_item].str.upper() + " @ " + sub[col_loc].str.upper()
        report["distinct_item_location_pairs_approx"] = int(key.nunique())
    return report


def analyze_master_items(path: Path, header_row: int) -> dict[str, Any]:
    df = pd.read_excel(path, sheet_name="Master_Items", header=header_row, dtype=object)
    df.columns = [str(c).strip() if pd.notna(c) else f"Unnamed_{i}" for i, c in enumerate(df.columns)]
    norm = _norm_cols(df)
    col_code = _find_column(norm, "itemcode", "item_code", "masteritemcodes")
    if not col_code:
        return {"error": "Could not detect ItemCode column", "detected_columns": list(norm.keys())}
    codes = df[col_code].astype(str).str.strip()
    blank = codes.isna() | (codes == "") | (codes.str.lower() == "nan")
    dup = codes[~blank][codes[~blank].duplicated(keep=False)]
    return {
        "rows": len(df),
        "itemcode_column": col_code,
        "blank_item_codes": int(blank.sum()),
        "duplicate_item_codes_count": int(dup.nunique()),
        "duplicate_examples": dup.value_counts().head(15).to_dict(),
    }


def analyze_locations(path: Path, header_row: int) -> dict[str, Any]:
    df = pd.read_excel(path, sheet_name="Locations", header=header_row, dtype=object)
    df.columns = [str(c).strip() if pd.notna(c) else f"Unnamed_{i}" for i, c in enumerate(df.columns)]
    norm = _norm_cols(df)
    col_code = _find_column(norm, "storecode", "locationcode", "code")
    if not col_code:
        col_code = str(df.columns[0])
    vals = df[col_code].dropna().astype(str).str.strip()
    vals = vals[vals.astype(bool)]
    return {
        "rows": len(df),
        "store_column_used": col_code,
        "distinct_codes": vals.nunique(),
        "sample_codes": vals.unique()[:40].tolist(),
    }


def compare_reference(legacy_path: Path, backend_path: Path, header_legacy: int, header_backend: int) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for sheet, analyzer in (
        ("Master_Items", _item_codes_set),
        ("Locations", _location_codes_set),
    ):
        try:
            a = analyzer(legacy_path, header_legacy)
            b = analyzer(backend_path, header_backend)
            out[sheet] = {
                "only_in_legacy": sorted(a - b),
                "only_in_backend": sorted(b - a),
                "overlap_count": len(a & b),
            }
        except Exception as e:
            out[sheet] = {"error": str(e)}
    return out


def _item_codes_set(path: Path, header_row: int) -> set[str]:
    df = pd.read_excel(path, sheet_name="Master_Items", header=header_row, dtype=object)
    df.columns = [str(c).strip() for c in df.columns]
    norm = _norm_cols(df)
    cc = _find_column(norm, "itemcode", "item_code") or df.columns[0]
    return set(df[cc].dropna().astype(str).str.strip().str.upper()) - {""}


def _location_codes_set(path: Path, header_row: int) -> set[str]:
    df = pd.read_excel(path, sheet_name="Locations", header=header_row, dtype=object)
    df.columns = [str(c).strip() for c in df.columns]
    norm = _norm_cols(df)
    cc = _find_column(norm, "storecode", "locationcode") or df.columns[0]
    return set(df[cc].dropna().astype(str).str.strip().str.upper()) - {""}


def main() -> int:
    p = argparse.ArgumentParser(
        description="Excel migration analyzer for Aldhafra IMS (legacy .xlsm vs Backend .xlsx).",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="See docs/implementation/03-DATA-MODEL.md and 10-MIGRATION-GUIDE.md.",
    )
    p.add_argument("--legacy", "-l", type=Path, required=True, help="Legacy workbook (.xlsm)")
    p.add_argument("--backend", "-b", type=Path, help="Backend Data spreadsheet (.xlsx) for comparison")
    p.add_argument(
        "--header-row",
        type=int,
        default=0,
        help="Header row index for pandas (0=first row; use 2 if headers are Excel row 3).",
    )
    p.add_argument(
        "--header-row-backend",
        type=int,
        default=None,
        help="Header row for --backend when it differs from --header-row",
    )
    p.add_argument("--sniff-only", action="store_true", help="Only print top rows for known sheets (find header row)")
    p.add_argument(
        "--sheet-sniff",
        action="append",
        default=[],
        metavar="NAME",
        help="Extra sheet name to sniff (repeatable)",
    )
    p.add_argument("-o", "--output-json", type=Path, default=None, help="Save full JSON report")
    args = p.parse_args()

    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass

    legacy = args.legacy.expanduser().resolve()
    if not legacy.is_file():
        print(f"Legacy file not found: {legacy}", file=sys.stderr)
        return 1

    hr = args.header_row
    hr_b = args.header_row_backend if args.header_row_backend is not None else hr

    print(f"Legacy: {legacy}")
    wb_summary = summarize_workbook(legacy)
    print(f"\nSheets overview ({len(wb_summary['sheets'])}):")
    for s in wb_summary["sheets"]:
        print(f"  • {s['name']}: {s['sample_non_empty_rows_2048_cap']}")

    sheets_to_sniff = list(dict.fromkeys(list(DEFAULT_SNIFF_SHEETS) + args.sheet_sniff))
    xf = pd.ExcelFile(legacy)
    for sheet in sheets_to_sniff:
        if sheet in xf.sheet_names:
            sniff_headers(legacy, sheet)
    xf.close()

    if args.sniff_only:
        if args.output_json:
            payload = wb_summary | {"sniff_only": True}
            args.output_json.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        return 0

    report: dict[str, Any] = {"legacy_path": str(legacy), "header_row_legacy": hr, "workbook_legacy": wb_summary}

    try:
        report["Stock_Movement"] = analyze_stock_movement(legacy, hr)
    except Exception as e:
        report["Stock_Movement"] = {"error": str(e)}

    try:
        report["Master_Items"] = analyze_master_items(legacy, hr)
    except Exception as e:
        report["Master_Items"] = {"error": str(e)}

    try:
        report["Locations"] = analyze_locations(legacy, hr)
    except Exception as e:
        report["Locations"] = {"error": str(e)}

    if args.backend:
        bk = args.backend.expanduser().resolve()
        if not bk.is_file():
            print(f"Backend file not found: {bk}", file=sys.stderr)
            return 1
        print(f"\nBackend: {bk}")
        report["backend_path"] = str(bk)
        report["header_row_backend"] = hr_b
        report["comparison"] = compare_reference(legacy, bk, hr, hr_b)
        wb_b = summarize_workbook(bk)
        report["workbook_backend"] = wb_b

    report_txt = json.dumps(report, ensure_ascii=False, indent=2, default=str)
    if args.output_json:
        args.output_json.write_text(report_txt, encoding="utf-8")
        print(f"\nSaved JSON report: {args.output_json}")

    print("\n========== Analysis report ==========")
    try:
        print(report_txt)
    except UnicodeEncodeError:
        print(report_txt.encode(sys.stdout.encoding or "utf-8", errors="replace").decode(sys.stdout.encoding or "utf-8"))

    if args.output_json:
        print(f"\n(Full UTF-8 report also in: {args.output_json})")


if __name__ == "__main__":
    raise SystemExit(main())
