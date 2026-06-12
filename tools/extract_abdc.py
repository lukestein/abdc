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

FT50_SOURCE = "https://www.ft.com/ft50-journals"
FT50_UPDATED = "2026-04"
FT50_JOURNALS = [
    "Academy of Management Annals",
    "Academy of Management Journal",
    "Academy of Management Review",
    "Accounting, Organizations and Society",
    "Accounting Review",
    "Administrative Science Quarterly",
    "American Economic Review",
    "American Sociological Review",
    "Contemporary Accounting Research",
    "Econometrica",
    "Entrepreneurship Theory and Practice",
    "Harvard Business Review",
    "Human Resource Management",
    "Information Systems Research",
    "Journal of Accounting and Economics",
    "Journal of Accounting Research",
    "Journal of Applied Psychology",
    "Journal of Business Venturing",
    "Journal of Consumer Psychology",
    "Journal of Consumer Research",
    "Journal of Finance",
    "Journal of Financial and Quantitative Analysis",
    "Journal of Financial Economics",
    "Journal of International Business Studies",
    "Journal of Management",
    "Journal of Management Information Systems",
    "Journal of Management Studies",
    "Journal of Marketing",
    "Journal of Marketing Research",
    "Journal of Operations Management",
    "Journal of Political Economy",
    "Journal of Retailing",
    "Strategic Entrepreneurship Journal",
    "Journal of Organizational Behavior",
    "Leadership Quarterly",
    "Management Information Systems Quarterly",
    "Management Science",
    "Manufacturing & Service Operations Management",
    "Marketing Science",
    "Operations Research",
    "Organization Science",
    "Organizational Behavior and Human Decision Processes",
    "Personnel Psychology",
    "Psychological Science",
    "Quarterly Journal of Economics",
    "Review of Accounting Studies",
    "Review of Economic Studies",
    "Review of Finance",
    "Review of Financial Studies",
    "Strategic Management Journal",
]
FT50_ALIASES = {
    "humanresourcemanagement": "humanresourcemanagementus",
    "managementinformationsystemsquarterly": "misquarterly",
}

UTD24_SOURCE = "https://jsom.utdallas.edu/the-utd-top-100-business-school-research-rankings/"
UTD24_UPDATED = "2026-06"
UTD24_JOURNALS = [
    "The Accounting Review",
    "Journal of Accounting and Economics",
    "Journal of Accounting Research",
    "Journal of Finance",
    "Journal of Financial Economics",
    "The Review of Financial Studies",
    "Information Systems Research",
    "Journal on Computing",
    "MIS Quarterly",
    "Journal of Consumer Research",
    "Journal of Marketing",
    "Journal of Marketing Research",
    "Marketing Science",
    "Management Science",
    "Operations Research",
    "Journal of Operations Management",
    "Manufacturing and Service Operations Management",
    "Production and Operations Management",
    "Academy of Management Journal",
    "Academy of Management Review",
    "Administrative Science Quarterly",
    "Organization Science",
    "Journal of International Business Studies",
    "Strategic Management Journal",
]
UTD24_ALIASES = {
    "journaloncomputing": "informsjournaloncomputing",
}


def col_index(cell_ref):
    letters = re.sub(r"[^A-Z]", "", cell_ref.upper())
    value = 0
    for letter in letters:
        value = value * 26 + ord(letter) - 64
    return value


def clean(value):
    return re.sub(r"\s+", " ", str(value or "").replace("\t", " ")).strip()


def journal_key(value):
    text = clean(value).lower().replace("&", " and ")
    text = re.sub(r"^(a|an|the)\s+", "", text)
    return re.sub(r"[^a-z0-9]", "", text)


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


def mark_ft50_rows(rows):
    return mark_journal_list_rows(rows, FT50_JOURNALS, "ft50", FT50_ALIASES, "FT50")


def mark_utd24_rows(rows):
    return mark_journal_list_rows(rows, UTD24_JOURNALS, "utd24", UTD24_ALIASES, "UTD24")


def mark_journal_list_rows(rows, journal_titles, field, aliases, label):
    rows_by_key = {journal_key(row["title"]): row for row in rows}
    matched = []
    missing = []

    for title in journal_titles:
        key = journal_key(title)
        target_key = aliases.get(key, key)
        row = rows_by_key.get(target_key)
        if row is None:
            missing.append(title)
            continue
        row[field] = True
        matched.append(row)

    if missing:
        raise SystemExit(f"Could not match {label} journals: {', '.join(missing)}")
    if len({row["title"] for row in matched}) != len(journal_titles):
        raise SystemExit(f"{label} matching did not produce {len(journal_titles)} unique ABDC rows")

    return matched


def main():
    rows = extract_rows()
    unknown_codes = sorted({row["forCode"] for row in rows if row["discipline"] == row["forCode"]})
    if unknown_codes:
        raise SystemExit(f"Missing FoR labels for: {', '.join(unknown_codes)}")

    ft50_rows = mark_ft50_rows(rows)
    utd24_rows = mark_utd24_rows(rows)
    payload = {
        "source": "https://abdc.edu.au/wp-content/uploads/2026/05/ABDC-JQL-2025-v2-270526.xlsx",
        "downloaded": "2026-05-27",
        "sheet": "2025 JQL",
        "count": len(rows),
        "ft50Source": FT50_SOURCE,
        "ft50Updated": FT50_UPDATED,
        "ft50Count": len(ft50_rows),
        "utd24Source": UTD24_SOURCE,
        "utd24Updated": UTD24_UPDATED,
        "utd24Count": len(utd24_rows),
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
