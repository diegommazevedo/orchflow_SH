"""
routers/voice.py

Transcrição de áudio via Groq Whisper API.
Recebe arquivo de áudio → retorna texto transcrito.
O texto segue o mesmo pipeline do chat (normalizer → memória → Groq intent).

Formatos suportados: webm, mp4, mp3, wav, ogg, m4a
Tamanho máximo: 25MB (limite Groq)
"""

import os
import tempfile
from fastapi import APIRouter, UploadFile, File, HTTPException, Form
from fastapi.responses import JSONResponse

router = APIRouter()

SUPPORTED_FORMATS = {
    "audio/webm", "audio/mp4", "audio/mpeg",
    "audio/wav", "audio/ogg", "audio/x-m4a",
    "video/webm",  # Chrome grava como video/webm
}

MAX_SIZE_MB = 25


@router.post("/transcribe")
async def transcribe(
    audio: UploadFile = File(...),
    language: str = Form(default="pt"),  # português por padrão
):
    """
    Recebe arquivo de áudio gravado pelo browser.
    Retorna texto transcrito pronto para o pipeline de intenção.
    """
    # valida tamanho
    content = await audio.read()
    size_mb = len(content) / (1024 * 1024)
    if size_mb > MAX_SIZE_MB:
        raise HTTPException(
            status_code=413,
            detail=f"Áudio muito grande ({size_mb:.1f}MB). Máximo: {MAX_SIZE_MB}MB"
        )

    # valida formato
    content_type = audio.content_type or ""
    if content_type not in SUPPORTED_FORMATS:
        # tenta continuar mesmo assim — Whisper é tolerante
        pass

    try:
        from groq import Groq
        client = Groq(api_key=os.getenv("GROQ_API_KEY"))

        # salva em arquivo temporário (Groq exige file-like com nome)
        suffix = _get_suffix(audio.filename or "", content_type)
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(content)
            tmp_path = tmp.name

        try:
            with open(tmp_path, "rb") as f:
                transcription = client.audio.transcriptions.create(
                    file=(audio.filename or f"audio{suffix}", f),
                    model="whisper-large-v3-turbo",
                    language=language,
                    response_format="text",
                )
        finally:
            os.unlink(tmp_path)

        text = transcription.strip() if isinstance(transcription, str) else str(transcription)

        if not text:
            return JSONResponse(
                status_code=422,
                content={"error": "Não consegui transcrever. Tente falar mais perto do microfone."}
            )

        return {
            "text": text,
            "language": language,
            "duration_mb": round(size_mb, 2),
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erro na transcrição: {str(e)}"
        )


def _get_suffix(filename: str, content_type: str) -> str:
    """Determina extensão do arquivo temporário."""
    if "." in filename:
        return "." + filename.rsplit(".", 1)[-1]
    mapping = {
        "audio/webm": ".webm",
        "video/webm": ".webm",
        "audio/mp4":  ".mp4",
        "audio/mpeg": ".mp3",
        "audio/wav":  ".wav",
        "audio/ogg":  ".ogg",
        "audio/x-m4a": ".m4a",
    }
    return mapping.get(content_type, ".webm")
