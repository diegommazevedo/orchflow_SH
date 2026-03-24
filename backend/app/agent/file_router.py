"""
file_router.py — Detecção de tipo de arquivo por magic bytes + extensão + content_type.

Retorna apenas metadados — NÃO processa, NÃO salva nada.
Usado pelo endpoint POST /api/upload/detect.

Ordem de detecção:
  1. Magic bytes (mais confiável)
  2. Extensão do filename (fallback)
  3. content_type HTTP (último fallback)
"""

from __future__ import annotations

# ── Magic bytes ────────────────────────────────────────────────────────────────

_MAGIC: list[tuple[bytes, str, str, float]] = [
    # (prefixo, file_type, ação sugerida, confiança)
    (b"%PDF",          "contract_pdf", "POST /api/upload/contract — extrair projeto e backlog", 0.98),
    (b"PK\x03\x04",   "sheet_zip",    "_zip_dispatch",                                         0.90),
    (b"ID3",           "audio",        "POST /api/voice/transcribe — transcrever áudio",        0.97),
    (b"\xff\xfb",      "audio",        "POST /api/voice/transcribe — transcrever áudio",        0.95),
    (b"\xff\xf3",      "audio",        "POST /api/voice/transcribe — transcrever áudio",        0.95),
    (b"\xff\xf2",      "audio",        "POST /api/voice/transcribe — transcrever áudio",        0.95),
    (b"RIFF",          "audio",        "POST /api/voice/transcribe — transcrever áudio",        0.97),
    (b"\x1a\x45\xdf\xa3", "audio",    "POST /api/voice/transcribe — transcrever áudio",        0.97),
    (b"\x89PNG\r\n",   "image",        "Em breve: POST /api/upload/image — OCR",                0.99),
    (b"\xff\xd8\xff",  "image",        "Em breve: POST /api/upload/image — OCR",                0.99),
    (b"GIF8",          "image",        "Em breve: POST /api/upload/image — OCR",                0.99),
    (b"BM",            "image",        "Em breve: POST /api/upload/image — OCR",                0.96),
    (b"\x00\x00\x01\x00", "image",    "Em breve: POST /api/upload/image — OCR",                0.96),
]

# Extensão → (file_type, confiança)
_EXT_MAP: dict[str, tuple[str, float]] = {
    "pdf":  ("contract_pdf", 0.90),
    "xlsx": ("sheet",        0.90),
    "xls":  ("sheet",        0.85),
    "csv":  ("sheet",        0.90),
    "mp3":  ("audio",        0.90),
    "wav":  ("audio",        0.90),
    "webm": ("audio",        0.88),
    "m4a":  ("audio",        0.88),
    "ogg":  ("audio",        0.85),
    "png":  ("image",        0.90),
    "jpg":  ("image",        0.90),
    "jpeg": ("image",        0.90),
    "gif":  ("image",        0.88),
    "docx": ("document",     0.90),
    "doc":  ("document",     0.85),
    "txt":  ("document",     0.70),
}

# content_type → (file_type, confiança)
_CT_MAP: dict[str, tuple[str, float]] = {
    "application/pdf":                                          ("contract_pdf", 0.80),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ("sheet", 0.80),
    "application/vnd.ms-excel":                                ("sheet",        0.75),
    "text/csv":                                                ("sheet",        0.80),
    "text/plain":                                              ("document",     0.55),
    "audio/mpeg":                                              ("audio",        0.80),
    "audio/wav":                                               ("audio",        0.80),
    "audio/webm":                                              ("audio",        0.80),
    "audio/ogg":                                               ("audio",        0.80),
    "image/png":                                               ("image",        0.80),
    "image/jpeg":                                              ("image",        0.80),
    "image/gif":                                               ("image",        0.78),
    "application/msword":                                      ("document",     0.80),
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ("document", 0.85),
}

# Ações legíveis por file_type
_ACTIONS: dict[str, str] = {
    "contract_pdf": "POST /api/upload/contract — extrair projeto e backlog",
    "sheet":        "POST /api/upload/sheet — mapear colunas e importar tasks",
    "audio":        "POST /api/voice/transcribe — transcrever áudio",
    "image":        "Em breve: POST /api/upload/image — OCR",
    "document":     "Em breve: POST /api/upload/document",
    "unknown":      "Formato não reconhecido",
}


def _ext(filename: str) -> str:
    """Retorna extensão em minúsculas, sem ponto."""
    if "." not in filename:
        return ""
    return filename.rsplit(".", 1)[-1].lower()


def _detect_csv(file_bytes: bytes) -> bool:
    """Heurística: tenta decodificar como UTF-8 e conta delimitadores."""
    try:
        sample = file_bytes[:1024].decode("utf-8", errors="ignore")
    except Exception:
        return False
    lines = [l for l in sample.splitlines() if l.strip()]
    if not lines:
        return False
    commas    = sum(l.count(",") for l in lines[:5])
    semicolons = sum(l.count(";") for l in lines[:5])
    tabs      = sum(l.count("\t") for l in lines[:5])
    return max(commas, semicolons, tabs) >= 3


def _zip_dispatch(filename: str, file_bytes: bytes) -> tuple[str, float, dict]:
    """ZIP pode ser XLSX, DOCX ou genérico. Desambigua pela extensão."""
    ext = _ext(filename)
    if ext in ("xlsx", "xls"):
        return "sheet", 0.95, {"format": ext, "zip": True}
    if ext in ("docx", "doc"):
        return "document", 0.92, {"format": ext, "zip": True}
    # Sem extensão clara — tenta inspecionar conteúdo
    try:
        import zipfile, io
        with zipfile.ZipFile(io.BytesIO(file_bytes)) as z:
            names = z.namelist()
            if any("xl/" in n for n in names):
                return "sheet", 0.85, {"format": "xlsx", "zip": True}
            if any("word/" in n for n in names):
                return "document", 0.85, {"format": "docx", "zip": True}
    except Exception:
        pass
    return "document", 0.60, {"format": "unknown_zip", "zip": True}


def detect_and_route(
    filename: str,
    content_type: str,
    file_bytes: bytes,
) -> dict:
    """
    Detecta o tipo de arquivo e retorna metadados de roteamento.

    Ordem:
      1. Magic bytes
      2. Extensão do filename
      3. content_type

    Retorna:
      {
        "file_type": str,
        "confidence": float,
        "suggested_action": str,
        "metadata": dict
      }
    """
    fname    = filename or ""
    ct_clean = (content_type or "").split(";")[0].strip().lower()

    # ── 1. Magic bytes ─────────────────────────────────────────────────────────
    for magic, ftype, action, conf in _MAGIC:
        if file_bytes[: len(magic)] == magic:
            if ftype == "sheet_zip":
                ftype, conf, meta = _zip_dispatch(fname, file_bytes)
                return {
                    "file_type":        ftype,
                    "confidence":       conf,
                    "suggested_action": _ACTIONS.get(ftype, action),
                    "metadata":         meta,
                }
            # RIFF pode ser WAV ou AVI
            if ftype == "audio" and magic == b"RIFF":
                fmt = "wav" if b"WAVE" in file_bytes[4:12] else "riff"
                return {
                    "file_type":        "audio",
                    "confidence":       conf,
                    "suggested_action": action,
                    "metadata":         {"format": fmt},
                }
            return {
                "file_type":        ftype,
                "confidence":       conf,
                "suggested_action": action,
                "metadata":         {"magic": magic.hex()},
            }

    # ── 2. CSV heurística (texto puro sem magic bytes) ──────────────────────────
    if _detect_csv(file_bytes):
        return {
            "file_type":        "sheet",
            "confidence":       0.85,
            "suggested_action": _ACTIONS["sheet"],
            "metadata":         {"format": "csv"},
        }

    # ── 3. Extensão do filename ────────────────────────────────────────────────
    ext = _ext(fname)
    if ext in _EXT_MAP:
        ftype, conf = _EXT_MAP[ext]
        return {
            "file_type":        ftype,
            "confidence":       conf,
            "suggested_action": _ACTIONS.get(ftype, ""),
            "metadata":         {"ext": ext, "source": "filename"},
        }

    # ── 4. content_type HTTP ───────────────────────────────────────────────────
    if ct_clean in _CT_MAP:
        ftype, conf = _CT_MAP[ct_clean]
        return {
            "file_type":        ftype,
            "confidence":       conf,
            "suggested_action": _ACTIONS.get(ftype, ""),
            "metadata":         {"content_type": ct_clean, "source": "content_type"},
        }

    return {
        "file_type":        "unknown",
        "confidence":       0.0,
        "suggested_action": _ACTIONS["unknown"],
        "metadata":         {"filename": fname, "content_type": ct_clean},
    }
