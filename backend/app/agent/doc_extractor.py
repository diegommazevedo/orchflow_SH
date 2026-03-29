"""
doc_extractor.py — Sprint 3E

Extrai texto bruto de PDF (bytes).
PDFs escaneados sem camada de texto retornam aviso — OCR fica fora deste sprint.
"""

import io
import re


def extract_text(pdf_bytes: bytes) -> str:
    """
    Extrai texto de um PDF.
    Retorna string limpa, sem quebras excessivas.
    """
    import pdfplumber

    if not pdf_bytes or len(pdf_bytes) < 100:
        raise ValueError("Arquivo PDF inválido ou vazio.")

    text_parts: list[str] = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            t = page.extract_text()
            if t:
                text_parts.append(t)

    raw = "\n\n".join(text_parts)
    raw = re.sub(r"[ \t]+\n", "\n", raw)
    raw = re.sub(r"\n{3,}", "\n\n", raw)
    raw = raw.strip()

    if len(raw) < 80:
        raise ValueError(
            "Pouco ou nenhum texto extraído. Este PDF pode ser escaneado (imagem). "
            "OCR não está disponível nesta versão — use PDF com texto selecionável."
        )

    return raw
