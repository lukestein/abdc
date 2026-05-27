#!/usr/bin/env python3
"""Extract the 2025 ABDC Journal Quality List workbook to browser-ready JSON."""

import json
import re
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
WORKBOOK = ROOT / "ABDC-JQL-2025-v2-270526.xlsx"
OUTPUT = ROOT / "data.js"

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}

FOR_LABELS = {
    "3501": "Accounting, auditing and accountability",
    "3502": "Banking, finance and investment",
    "3503": "Business systems in context",
    "3504": "Commercial services",
    "3505": "Human resources and industrial relations",
    "3506": "Marketing",
    "3507": "Strategy, management and organisational behaviour",
    "3508": "Tourism",
    "3509": "Transportation, logistics and supply chains",
    "3599": "Other commerce, management, tourism and services",
    "3801": "Applied economics",
    "3802": "Econometrics",
    "3803": "Economic theory",
    "3899": "Other economics",
    "4609": "Information systems",
    "4801": "Commercial law",
    "4905": "Statistics",
}


def col_index(cell_ref):
    letters = re.sub(r"[^A-Z]", "", cell_ref.upper())
    value = 0
    for letter in letters:
        value = value * 26 + ord(letter) - 64
    return value


def clean(value):
    return re.sub(r"\s+", " ", str(value or "").replace("\t", " ")).strip()


def load_shared_strings(zip_file):
    root = ET.fromstring(zip_file.read("xl/sharedStrings.xml"))
    strings = []
    for item in root.findall("m:si", NS):
        strings.append("".join((text.text or "") for text in item.iter(f"{{{NS['m']}}}t")))
    return strings


def cell_value(cell, shared_strings):
    value = cell.find("m:v", NS)
    if value is None:
        return ""
    raw = value.text or ""
    if cell.attrib.get("t") == "s" and raw:
        return shared_strings[int(raw)]
    return raw


def extract_rows():
    with ZipFile(WORKBOOK) as zip_file:
        shared_strings = load_shared_strings(zip_file)
        sheet = ET.fromstring(zip_file.read("xl/worksheets/sheet1.xml"))

    rows = []
    for row in sheet.findall("m:sheetData/m:row", NS):
        row_number = int(row.attrib["r"])
        if row_number < 9:
            continue

        cells = {}
        for cell in row.findall("m:c", NS):
            cells[col_index(cell.attrib["r"])] = clean(cell_value(cell, shared_strings))

        title = cells.get(2, "")
        if not title:
            continue

        for_code = cells.get(7, "")
        rating = clean(cells.get(8, "")).upper().replace("STAR", "*")

        rows.append(
            {
                "title": title,
                "publisher": cells.get(3, ""),
                "issn": cells.get(4, ""),
                "issnOnline": cells.get(5, ""),
                "year": cells.get(6, ""),
                "forCode": for_code,
                "discipline": FOR_LABELS.get(for_code, for_code),
                "rating": rating,
            }
        )
    return rows


def main():
    rows = extract_rows()
    unknown_codes = sorted({row["forCode"] for row in rows if row["discipline"] == row["forCode"]})
    if unknown_codes:
        raise SystemExit(f"Missing FoR labels for: {', '.join(unknown_codes)}")

    payload = {
        "source": "https://abdc.edu.au/wp-content/uploads/2026/05/ABDC-JQL-2025-v2-270526.xlsx",
        "downloaded": "2026-05-27",
        "sheet": "2025 JQL",
        "count": len(rows),
        "rows": rows,
    }
    OUTPUT.write_text(
        "window.ABDC_DATA = "
        + json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(rows)} rows to {OUTPUT}")


if __name__ == "__main__":
    main()
