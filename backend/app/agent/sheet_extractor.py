"""
sheet_extractor.py — Sprint 3F

Lê .xlsx ou .csv e retorna estrutura bruta (headers + linhas).
Responsabilidade única: extração. Sem interpretação de conteúdo.
"""

import csv
import io
from typing import Any

MAX_ROWS = 200


def extract_sheet(file_bytes: bytes, filename: str) -> dict:
    """
    Extrai headers e linhas de .xlsx ou .csv.

    Retorna:
    {
        "headers": ["col1", "col2", ...],
        "rows": [["val", ...], ...],  # máximo MAX_ROWS linhas
        "total_rows": N,
        "format": "xlsx" | "csv"
    }
    """
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext in ("xlsx", "xls"):
        return _extract_xlsx(file_bytes)
    if ext == "csv":
        return _extract_csv(file_bytes)
    raise ValueError(f"Formato não suportado: '{ext}'. Envie .xlsx ou .csv")


# ── XLSX ──────────────────────────────────────────────────────────────────────

def _extract_xlsx(file_bytes: bytes) -> dict:
    try:
        import openpyxl  # type: ignore
    except ImportError:
        raise RuntimeError("openpyxl não instalado. Execute: pip install openpyxl")

    wb = openpyxl.load_workbook(io.BytesIO(file_bytes), read_only=True, data_only=True)
    ws = wb.active
    rows_iter = ws.iter_rows(values_only=True)

    try:
        raw_headers = next(rows_iter)
    except StopIteration:
        wb.close()
        raise ValueError("Planilha vazia ou sem linha de cabeçalho.")

    headers = [
        str(h).strip() if h is not None else f"Coluna_{i + 1}"
        for i, h in enumerate(raw_headers)
    ]

    rows: list[list[Any]] = []
    total = 0
    for raw_row in rows_iter:
        if all(v is None for v in raw_row):
            continue
        total += 1
        if len(rows) < MAX_ROWS:
            rows.append([str(v).strip() if v is not None else "" for v in raw_row])

    wb.close()

    if not any(headers):
        raise ValueError("Cabeçalho vazio na planilha.")

    return {"headers": headers, "rows": rows, "total_rows": total, "format": "xlsx"}


# ── CSV ───────────────────────────────────────────────────────────────────────

def _extract_csv(file_bytes: bytes) -> dict:
    text: str | None = None
    for enc in ("utf-8-sig", "utf-8", "latin-1", "cp1252"):
        try:
            text = file_bytes.decode(enc)
            break
        except (UnicodeDecodeError, LookupError):
            continue

    if text is None:
        raise ValueError("Não foi possível detectar o encoding do CSV.")

    # Detecta delimitador automaticamente
    try:
        dialect = csv.Sniffer().sniff(text[:4096])
    except csv.Error:
        dialect = csv.excel

    reader = csv.reader(io.StringIO(text), dialect)

    try:
        headers = [h.strip() for h in next(reader)]
    except StopIteration:
        raise ValueError("CSV vazio ou sem linha de cabeçalho.")

    if not any(headers):
        raise ValueError("Cabeçalho vazio no CSV.")

    rows: list[list[str]] = []
    total = 0
    for raw_row in reader:
        if not any(v.strip() for v in raw_row):
            continue
        total += 1
        if len(rows) < MAX_ROWS:
            padded = raw_row + [""] * max(0, len(headers) - len(raw_row))
            rows.append([v.strip() for v in padded[: len(headers)]])

    return {"headers": headers, "rows": rows, "total_rows": total, "format": "csv"}
