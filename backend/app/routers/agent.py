"""
routers/agent.py — Sprint 3C

Novidades:
- Perfil carregado/salvo no banco (não mais em memória)
- Memória semântica salva após cada confirmação
- /memory/stats — estatísticas de uso de memória por usuário
- /admin/profiles — lista perfis (admin)
- /admin/profile/{uid}/visibility — torna perfil público/privado
"""

import hashlib
import hmac
import json
import os
import time

from fastapi import APIRouter, Depends, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, Any

from app.database import get_db
from app.agent.intent_engine import parse_intent, IntentResult
from app.agent.executor import execute_intent
from app.agent.permissions import record_confirmation
from app.agent.normalizer import extract_personal_abbreviation, normalize
from app.agent.conformity import conform_field
from app.agent.memory_store import (
    load_profile, save_profile, save_memory,
    set_profile_visibility,
)
from app.models.memory import UserSemanticProfile, SemanticMemory
from app.models.project import Project
from app.models.user import User
from app.models.workspace import Workspace
from app.auth.dependencies import get_current_user, get_current_workspace

router = APIRouter()


# ── Rate limiter ───────────────────────────────────────────────────────────────
def _get_user_or_ip(request: Request) -> str:
    user_id = getattr(request.state, "user_id", None)
    if user_id:
        return f"user:{user_id}"
    return get_remote_address(request)


# Import the shared limiter from auth (registered on app.state)
from app.routers.auth import limiter  # noqa: E402


# ── Confirmation token helpers ─────────────────────────────────────────────────
_CONFIRMATION_MAX_AGE = 300  # 5 minutes


def _generate_confirmation_token(intent_hash: str, workspace_id: str) -> str:
    secret = os.getenv("JWT_SECRET", "change-me").encode()
    timestamp = str(int(time.time()))
    payload = f"{intent_hash}:{workspace_id}:{timestamp}"
    sig = hmac.new(secret, payload.encode(), hashlib.sha256).hexdigest()
    return f"{timestamp}.{sig}"


def _verify_confirmation_token(
    token: str,
    intent_hash: str,
    workspace_id: str,
    max_age: int = _CONFIRMATION_MAX_AGE,
) -> bool:
    try:
        timestamp_str, sig = token.split(".", 1)
        timestamp = int(timestamp_str)
        if time.time() - timestamp > max_age:
            return False
        expected = _generate_confirmation_token(intent_hash, workspace_id)
        expected_sig = expected.split(".", 1)[1]
        return hmac.compare_digest(sig, expected_sig)
    except Exception:
        return False


# ── Request models ─────────────────────────────────────────
class InterpretRequest(BaseModel):
    message: str
    project_id: Optional[str] = None

class ExecuteRequest(BaseModel):
    intent: dict
    project_id: str
    confirmation_token: str  # HMAC gerado pelo /interpret

class ConformFieldRequest(BaseModel):
    field_type: str
    value: Any
    context: Optional[dict] = None

class ProfilePatch(BaseModel):
    confidence_threshold: Optional[float] = None
    personal_dict: Optional[dict[str, str]] = None
    personal_dict_remove: list[str] = []  # chaves a remover do dicionário pessoal

class VisibilityPatch(BaseModel):
    is_public: bool


# ── Agent endpoints ────────────────────────────────────────
@router.post("/interpret")
@limiter.limit("30/minute", key_func=_get_user_or_ip)
def interpret(
    request: Request,
    req: InterpretRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace: Workspace = Depends(get_current_workspace),
):
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="Mensagem vazia")

    user_id = str(current_user.id)

    profile = load_profile(user_id, db)
    result  = parse_intent(req.message, profile, db=db)

    data = result.model_dump()
    data["from_memory"] = result.from_memory

    # Gera confirmation_token vinculado ao intent + workspace
    intent_hash = hashlib.sha256(
        json.dumps(data, sort_keys=True, default=str).encode()
    ).hexdigest()
    data["confirmation_token"] = _generate_confirmation_token(
        intent_hash, str(current_workspace.id)
    )
    return data


@router.post("/execute")
@limiter.limit("20/minute", key_func=_get_user_or_ip)
def execute(
    request: Request,
    req: ExecuteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace: Workspace = Depends(get_current_workspace),
):
    if not req.project_id:
        raise HTTPException(status_code=400, detail="project_id obrigatório")

    try:
        intent = IntentResult(**req.intent)
    except Exception:
        raise HTTPException(status_code=422, detail="Intent inválido")

    # Valida confirmation_token antes de qualquer acesso ao banco
    intent_hash = hashlib.sha256(
        json.dumps(req.intent, sort_keys=True, default=str).encode()
    ).hexdigest()
    if not _verify_confirmation_token(
        req.confirmation_token, intent_hash, str(current_workspace.id)
    ):
        raise HTTPException(status_code=422, detail="Token de confirmação inválido ou expirado.")

    # Garante que o projeto pertence ao workspace do usuário
    import uuid as _uuid
    try:
        _pid = _uuid.UUID(req.project_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="project_id inválido")
    project_check = db.query(Project).filter(
        Project.id == _pid,
        Project.workspace_id == current_workspace.id,
    ).first()
    if not project_check:
        raise HTTPException(status_code=404, detail="Projeto não encontrado no workspace.")

    user_id = str(current_user.id)
    result  = execute_intent(
        intent, req.project_id, db,
        user_id=user_id,
        workspace_id=str(current_workspace.id),
    )

    if result.get("success"):
        profile = load_profile(user_id, db)

        # registra confirmação → aumenta confiança futura
        record_confirmation(intent.action, profile)

        # aprende abreviações novas
        candidate = extract_personal_abbreviation(
            intent.raw_message, {"action": intent.action}
        )
        if candidate:
            profile.personal_dict.update(candidate)

        # persiste perfil atualizado no banco
        save_profile(profile, db)

        # salva memória semântica se não veio da memória local
        if not intent.from_memory:
            save_memory(
                raw_input  = intent.raw_message,
                normalized = intent.normalized_message or normalize(intent.raw_message, profile.personal_dict),
                action     = intent.action,
                params     = intent.params.model_dump(exclude_none=True),
                confidence = intent.confidence,
                user_id    = user_id,   # sempre usuário autenticado
                db         = db,
            )

    return result


@router.post("/conform-field")
def conform_field_endpoint(req: ConformFieldRequest):
    ctx    = req.context or {}
    result = conform_field(req.field_type, req.value, **ctx)
    return {"original": req.value, "conformed": result}


# ── Profile endpoints ──────────────────────────────────────
@router.get("/profile/{user_id}")
def get_user_profile(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace: Workspace = Depends(get_current_workspace),
):
    if user_id != str(current_user.id):
        raise HTTPException(status_code=403, detail="Acesso negado")
    profile = load_profile(user_id, db)
    # busca stats de memória
    row = db.query(UserSemanticProfile).filter_by(user_id=user_id).first()
    memory_count = db.query(SemanticMemory).filter_by(
        profile_id=row.id
    ).count() if row else 0

    data = profile.model_dump()
    data["memory_count"] = memory_count
    data["is_public"]    = row.is_public if row else False
    return data


@router.patch("/profile/{user_id}")
def patch_profile(
    user_id: str,
    patch: ProfilePatch,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace: Workspace = Depends(get_current_workspace),
):
    if user_id != str(current_user.id):
        raise HTTPException(status_code=403, detail="Acesso negado")
    profile = load_profile(user_id, db)
    if patch.confidence_threshold is not None:
        profile.confidence_threshold = max(0.5, min(1.0, patch.confidence_threshold))
    if patch.personal_dict is not None:
        profile.personal_dict.update(patch.personal_dict)
    for key in patch.personal_dict_remove:
        profile.personal_dict.pop(key, None)
    save_profile(profile, db)
    return profile.model_dump()


# ── Memory stats ───────────────────────────────────────────
@router.get("/memory/stats/{user_id}")
def memory_stats(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace: Workspace = Depends(get_current_workspace),
):
    if user_id != str(current_user.id):
        raise HTTPException(status_code=403, detail="Acesso negado")
    row = db.query(UserSemanticProfile).filter_by(user_id=user_id).first()
    if not row:
        return {"memory_count": 0, "top_actions": {}, "total_hits": 0}

    memories = db.query(SemanticMemory).filter_by(profile_id=row.id).all()

    action_counts: dict = {}
    total_hits = 0
    for m in memories:
        action_counts[m.action] = action_counts.get(m.action, 0) + 1
        total_hits += m.hit_count

    return {
        "memory_count": len(memories),
        "top_actions":  action_counts,
        "total_hits":   total_hits,
        "trust_level":  row.trust_level,
        "personal_dict_size": len(row.personal_dict or {}),
    }


# ── Admin endpoints ────────────────────────────────────────
@router.get("/admin/profiles")
def list_profiles(
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    rows = db.query(UserSemanticProfile).all()
    return [
        {
            "user_id":    r.user_id,
            "trust_level": r.trust_level,
            "is_public":  r.is_public,
            "memory_count": db.query(SemanticMemory).filter_by(profile_id=r.id).count(),
            "updated_at": r.updated_at.isoformat() if r.updated_at else None,
        }
        for r in rows
    ]


@router.patch("/admin/profile/{user_id}/visibility")
def set_visibility(
    user_id: str,
    patch: VisibilityPatch,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    set_profile_visibility(user_id, patch.is_public, db)
    return {"user_id": user_id, "is_public": patch.is_public}
