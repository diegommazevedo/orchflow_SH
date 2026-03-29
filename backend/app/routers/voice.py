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
from typing import Optional

from fastapi import APIRouter, Depends, Header, Request, UploadFile, File, HTTPException, Form
from fastapi.responses import JSONResponse
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.user import User
from app.routers.auth import limiter

router = APIRouter()


def _get_user_or_ip(request: Request) -> str:
    user_id = getattr(request.state, "user_id", None)
    if user_id:
        return f"user:{user_id}"
    return get_remote_address(request)

SUPPORTED_FORMATS = {
    "audio/webm", "audio/mp4", "audio/mpeg",
    "audio/wav", "audio/ogg", "audio/x-m4a",
    "video/webm",  # Chrome grava como video/webm
}

MAX_SIZE_MB = 25


@router.post("/transcribe")
@limiter.limit("10/minute", key_func=_get_user_or_ip)
async def transcribe(
    request: Request,
    audio: UploadFile = File(...),
    language: str = Form(default="pt"),
    x_workspace_id: Optional[str] = Header(None, alias="X-Workspace-Id"),
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
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
        raise HTTPException(
            status_code=415,
            detail=f"Formato não suportado. Use: webm, mp4, mp3, wav, ogg, m4a"
        )

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

        # Log transcription usage in ai_router (capability="transcription")
        if x_workspace_id:
            try:
                from app.services.ai_router import log_transcription_usage
                log_transcription_usage(
                    workspace_id=x_workspace_id,
                    audio_mb=size_mb,
                    db=db,
                )
            except Exception:
                pass  # falha no log nunca bloqueia transcrição

        return {
            "text": text,
            "language": language,
            "duration_mb": round(size_mb, 2),
        }

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Falha ao processar áudio. Tente novamente."
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
