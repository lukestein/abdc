# ABDC Journal Quality List 2025 Viewer

Static single-page viewer for the 2025 ABDC Journal Quality List.

## Files

- `index.html` is the page entry point.
- `styles.css` contains the responsive layout and table styling.
- `app.js` contains filtering, sorting, metrics, and CSV export.
- `data.js` is generated from the official XLSX.
- `tools/extract_abdc.py` regenerates `data.js` from `ABDC-JQL-2025-v2-270526.xlsx`.

## Regenerate Data

```sh
python3 tools/extract_abdc.py
```

The page can be opened directly in a browser from `index.html`; no build step is required.
